import crypto from 'crypto';
import { Request, Response } from 'express';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { portfolioRepository } from './repository';
import { ingestWalletEvent, WalletRawEvent } from '../../services/walletEventAggregator';
import { WalletEventType, WalletEventActivityFields } from './models/WalletEvent';

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

      const rawEvent: WalletRawEvent = {
        userId:   wallet.userId,
        address:  addr,
        chain:    resolvedChain,
        txHash:   activity.hash ?? '',
        type:     mapAlchemyCategory(activity.category),
        activity: activityData,
      };
      ingestWalletEvent(rawEvent);
    }
  },

  /**
   * Receives Zerion tx-subscription webhook events.
   * POST /api/portfolio/webhooks/zerion
   * Unauthenticated — Zerion uses certificate-based signatures
   * (X-Certificate-URL, X-Timestamp, X-Signature).
   *
   * Full asymmetric cert verification requires fetching the public cert from
   * X-Certificate-URL at runtime. TODO: add full verification before production deployment.
   */
  zerionWebhook: async (req: Request, res: Response): Promise<void> => {
    // Respond 200 immediately — Zerion stops after 3 failed attempts
    res.status(200).send('ok');

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      console.warn('[WebhookController] Zerion: missing rawBody');
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

    const wallet = await portfolioRepository.findWalletByAddress(address).catch(() => null);
    if (!wallet) return;

    const chainId = (tx.relationships?.chain?.id as string | undefined) ?? 'unknown';
    const attrs   = tx.attributes ?? {};

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

    const rawEvent: WalletRawEvent = {
      userId:   wallet.userId,
      address,
      chain:    chainId,
      txHash:   attrs.hash ?? '',
      type:     mapZerionOpType(attrs.operation_type ?? ''),
      activity: activityData,
    };
    ingestWalletEvent(rawEvent);
  },
};
