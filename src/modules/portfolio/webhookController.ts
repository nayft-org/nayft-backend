import crypto from 'crypto';
import { Request, Response } from 'express';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { portfolioRepository } from './repository';
import { ingestWalletEvent, WalletRawEvent } from '../../services/walletEventAggregator';
import { WalletEventType, WalletEventActivityFields } from './models/WalletEvent';
import { verifyZerionWebhook } from './zerionSignature';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(hash: string | undefined | null): string {
  if (!hash) return 'n/a';
  const value = String(hash);
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

// ── Alchemy HMAC-SHA256 signature verification ───────────────────────────────

function verifyAlchemySignature(
  rawBody:    Buffer,
  signature:  string,
  signingKey: string
): boolean {
  const hmac   = crypto.createHmac('sha256', signingKey);
  hmac.update(rawBody.toString('utf8'));
  const digest = hmac.digest('hex');
  return digest === signature;
}

// ── Category → WalletEventType maps ──────────────────────────────────────────

function mapAlchemyCategory(category: string): WalletEventType {
  switch (category) {
    case 'external':
    case 'internal':
      return 'native_transfer';
    case 'erc20':
    case 'token':
      return 'token_transfer';
    case 'erc721':
    case 'erc1155':
      return 'contract_interaction';
    default:
      return 'token_transfer';
  }
}

function mapZerionOpType(opType: string): WalletEventType {
  switch (opType) {
    case 'send':
    case 'receive':
      return 'token_transfer';
    case 'trade':
    case 'execute':
      return 'contract_interaction';
    default:
      return 'native_transfer';
  }
}

function alchemyActivityTxHash(activity: Record<string, unknown>): string {
  const h = activity.hash as string | undefined;
  if (h && String(h).trim()) return String(h).trim();
  return crypto.createHash('sha256').update(JSON.stringify(activity)).digest('hex').slice(0, 16);
}

function normalizeActivityPart(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Build a stable per-activity fingerprint for Alchemy ADDRESS_ACTIVITY payloads.
 *
 * A single transaction can emit multiple activity rows for the same monitored wallet
 * (for example a native movement plus one or more ERC-20 transfers). Deduping only by
 * tx hash drops those later rows and makes Polygon token activity look like "POL only".
 */
function alchemyActivityFingerprint(activity: Record<string, any>): string {
  const rawContract = activity.rawContract ?? {};
  const parts = [
    normalizeActivityPart(activity.hash),
    normalizeActivityPart(activity.category),
    normalizeActivityPart(activity.asset),
    normalizeActivityPart(activity.fromAddress),
    normalizeActivityPart(activity.toAddress),
    normalizeActivityPart(activity.value),
    normalizeActivityPart(activity.blockNum),
    normalizeActivityPart(rawContract.address),
    normalizeActivityPart(rawContract.decimal),
    normalizeActivityPart(activity.logIndex),
    normalizeActivityPart(activity.uniqueId),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const webhookController = {
  /**
   * Receives Alchemy Address Activity webhook events.
   * POST /api/portfolio/webhooks/alchemy
   * Unauthenticated — verified via X-Alchemy-Signature (HMAC-SHA256).
   */
  alchemyWebhook: async (req: Request, res: Response): Promise<void> => {
    // Respond 200 immediately — Alchemy retries on non-200 responses
    res.status(200).send('ok');
    const rawBody   = (req as any).rawBody as Buffer | undefined;
    const signature = req.headers['x-alchemy-signature'] as string | undefined;
    console.log('[PortfolioWebhook] Alchemy received', {
      hasRawBody: Boolean(rawBody),
      hasSignature: Boolean(signature),
      contentLength: rawBody?.length ?? 0,
    });

    if (!rawBody || !signature) {
      console.warn('[WebhookController] Alchemy: missing rawBody or signature header');
      return;
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      console.warn('[WebhookController] Alchemy: failed to parse body');
      return;
    }

    // Resolve chain from the network field in the payload
    const network = body.event?.network as string | undefined;
    const chain   = network ? alchemyNotify.getChainFromAlchemyNetwork(network) : null;
    const sigKey  = chain ? alchemyNotify.getSigningKeyForChain(chain) : null;

    if (!sigKey) {
      // Signing key not yet configured – skip verification in development, log loudly
      console.warn(
        `[WebhookController] Alchemy: ALCHEMY_WEBHOOK_SIGNING_KEYS not set for network="${network}". ` +
        'Signature verification skipped — add the signing key from the Alchemy dashboard.'
      );
    } else if (!verifyAlchemySignature(rawBody, signature, sigKey)) {
      console.warn('[WebhookController] Alchemy: invalid signature — discarding');
      return;
    }

    // Only process ADDRESS_ACTIVITY events
    if (body.type !== 'ADDRESS_ACTIVITY') return;

    const resolvedChain = chain ?? network ?? 'unknown';
    const activities: any[] = body.event?.activity ?? [];
    console.log('[PortfolioWebhook] Alchemy parsed', {
      network: network ?? 'unknown',
      chain: resolvedChain,
      activities: activities.length,
    });

    for (const activity of activities) {
      const toAddr   = activity.toAddress?.toLowerCase() as string | undefined;
      const fromAddr = activity.fromAddress?.toLowerCase() as string | undefined;

      // The webhook fires for any activity involving the monitored address.
      // The monitored wallet may be the sender OR the receiver — check both.
      let wallet = null;
      let addr   = '';

      if (toAddr) {
        wallet = await portfolioRepository.findWalletByAddress(toAddr).catch(() => null);
        if (wallet) addr = toAddr;
      }
      if (!wallet && fromAddr) {
        wallet = await portfolioRepository.findWalletByAddress(fromAddr).catch(() => null);
        if (wallet) addr = fromAddr;
      }

      if (!wallet) {
        console.warn(
          `[WebhookController] Alchemy: no monitored wallet in toAddress="${toAddr}" fromAddress="${fromAddr}"`
        );
        continue;
      }
      console.log('[PortfolioWebhook] Alchemy matched wallet', {
        chain: resolvedChain,
        userId: wallet.userId,
        matchedAddress: shortAddress(addr),
        txHash: shortHash(activity.hash),
        category: activity.category ?? 'unknown',
      });

      const activityData: WalletEventActivityFields = {
        txHash:         activity.hash ?? '',
        blockNum:       activity.blockNum,
        asset:          activity.asset,
        value:          activity.value,
        fromAddress:    activity.fromAddress?.toLowerCase(),
        toAddress:      activity.toAddress?.toLowerCase(),
        tokenContract:  activity.rawContract?.address,
        tokenDecimals:  activity.rawContract?.decimal,
      };

      const txHash = alchemyActivityTxHash(activity as Record<string, unknown>);
      const activityFingerprint = alchemyActivityFingerprint(activity as Record<string, any>);
      const netLabel = network ?? 'unknown';
      const dedupeKey = `alchemy:${netLabel}:${activityFingerprint}:${addr.toLowerCase()}`;
      const claimed = await portfolioRepository.claimWebhookIdempotencyKey(dedupeKey, 'alchemy');
      if (!claimed) {
        console.log('[PortfolioWebhook] Alchemy dedupe skipped', {
          chain: resolvedChain,
          address: shortAddress(addr),
          txHash: shortHash(txHash),
          category: activity.category ?? 'unknown',
        });
        continue;
      }

      const rawEvent: WalletRawEvent = {
        userId:   wallet.userId,
        address:  addr,
        chain:    resolvedChain,
        txHash:   activity.hash ?? txHash,
        type:     mapAlchemyCategory(activity.category),
        activity: activityData,
      };
      console.log('[PortfolioWebhook] Alchemy ingesting raw event', {
        userId: wallet.userId,
        chain: resolvedChain,
        address: shortAddress(addr),
        txHash: shortHash(rawEvent.txHash),
        type: rawEvent.type,
      });
      ingestWalletEvent(rawEvent);
    }
  },

  /**
   * Receives Zerion tx-subscription webhook events.
   * POST /api/portfolio/webhooks/zerion
   * Unauthenticated — verified via X-Certificate-URL, X-Timestamp, X-Signature (`zerionSignature.ts`).
   */
  zerionWebhook: async (req: Request, res: Response): Promise<void> => {
    // Respond 200 immediately — Zerion stops after 3 failed attempts
    res.status(200).send('ok');

    const rawBody = (req as any).rawBody as Buffer | undefined;
    console.log('[PortfolioWebhook] Zerion received', {
      hasRawBody: Boolean(rawBody),
      contentLength: rawBody?.length ?? 0,
    });
    if (!rawBody) {
      console.warn('[WebhookController] Zerion: missing rawBody');
      return;
    }

    const okSig = await verifyZerionWebhook(rawBody, req.headers as NodeJS.Dict<string | string[] | undefined>);
    if (!okSig) {
      console.warn('[WebhookController] Zerion: signature verification failed — discarding');
      return;
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      console.warn('[WebhookController] Zerion: failed to parse body');
      return;
    }

    // Zerion payload shape:
    //   body.data.attributes.address  — wallet address
    //   body.included[0]              — transaction object
    const address = body.data?.attributes?.address?.toLowerCase() as string | undefined;
    const tx      = body.included?.[0];

    if (!address || !tx) return;
    console.log('[PortfolioWebhook] Zerion parsed', {
      address: shortAddress(address),
      hasTransaction: Boolean(tx),
    });

    const wallet = await portfolioRepository.findWalletByAddress(address).catch(() => null);
    if (!wallet) {
      console.warn('[PortfolioWebhook] Zerion no monitored wallet', {
        address: shortAddress(address),
      });
      return;
    }

    const chainId = (tx.relationships?.chain?.id as string | undefined) ?? 'unknown';
    const attrs   = tx.attributes ?? {};
    console.log('[PortfolioWebhook] Zerion matched wallet', {
      userId: wallet.userId,
      chain: chainId,
      address: shortAddress(address),
      txHash: shortHash(attrs.hash),
      operationType: attrs.operation_type ?? 'unknown',
    });

    const activityData: WalletEventActivityFields = {
      txHash:         attrs.hash ?? '',
      blockNum:       attrs.block_number?.toString(),
      asset:          attrs.fungible_info?.symbol ?? attrs.fungible_info?.name,
      value:          attrs.value,
      fromAddress:    attrs.from?.toLowerCase(),
      toAddress:      attrs.to?.toLowerCase(),
      tokenContract:  attrs.fungible_info?.asset_code,
      tokenDecimals:  attrs.fungible_info?.decimals?.toString(),
    };

    const txHash = (attrs.hash ?? '').toString().trim() || 'unknown';
    const dedupeKey = `zerion:${chainId}:${txHash}:${address.toLowerCase()}`;
    const claimed = await portfolioRepository.claimWebhookIdempotencyKey(dedupeKey, 'zerion');
    if (!claimed) {
      console.log('[PortfolioWebhook] Zerion dedupe skipped', {
        chain: chainId,
        address: shortAddress(address),
        txHash: shortHash(txHash),
      });
      return;
    }

    const rawEvent: WalletRawEvent = {
      userId:   wallet.userId,
      address,
      chain:    chainId,
      txHash:   attrs.hash ?? '',
      type:     mapZerionOpType(attrs.operation_type ?? ''),
      activity: activityData,
    };
    console.log('[PortfolioWebhook] Zerion ingesting raw event', {
      userId: wallet.userId,
      chain: chainId,
      address: shortAddress(address),
      txHash: shortHash(rawEvent.txHash),
      type: rawEvent.type,
    });
    ingestWalletEvent(rawEvent);
  },
};
