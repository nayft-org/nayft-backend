import { Response } from 'express';
import { portfolioService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { IWalletAddress } from './models/WalletAddress';
import { IWalletEvent } from './models/WalletEvent';
import { IExchangeConnection } from './models/ExchangeConnection';
import { parsePortfolioContextFromHeaders, PortfolioApiBlockedError } from './sessionPolicy';
import { config } from '../../config/env';

function walletToDto(w: IWalletAddress) {
  return {
    id:        (w._id as { toString(): string }).toString(),
    address:   w.address,
    chains:    w.chains,
    label:     w.label,
    createdAt: w.createdAt,
  };
}

function eventToDto(e: IWalletEvent) {
  return {
    id:               (e._id as { toString(): string }).toString(),
    address:          e.address,
    chain:            e.chain,
    type:             e.type,
    rawEventCount:    e.rawEventCount,
    transactionCount: e.transactionCount,
    eventSummaries:   e.eventSummaries,
    enrichedData:     e.enrichedData,
    aggregatedAt:     e.aggregatedAt,
    activity:         e.activity,
    sourceType:       e.sourceType,
    sourceId:         e.sourceId,
    venue:            e.venue,
    providerTradeId:  e.providerTradeId,
    providerTimestamp: e.providerTimestamp,
  };
}

function exchangeToDto(c: IExchangeConnection) {
  return {
    id:              (c._id as { toString(): string }).toString(),
    provider:        c.provider,
    label:           c.label,
    maskedApiKey:    c.maskedApiKey,
    status:          c.status,
    syncPhase:       c.syncPhase,
    balancesFreshness:  c.balancesFreshness,
    tradesFreshness:    c.tradesFreshness,
    balancesStaleReason: c.balancesStaleReason,
    tradesStaleReason:   c.tradesStaleReason,
    lastBalancesSyncAt: c.lastBalancesSyncAt,
    lastTradesSyncAt:   c.lastTradesSyncAt,
    balancesLastError:  c.balancesLastError,
    tradesLastError:    c.tradesLastError,
    requiresReauth:  c.status === 'requires_reauth' || c.status === 'invalid_credentials',
    nextPollAt:        c.nextPollAt,
    pollingIntervalMs: c.pollingIntervalMs,
    lastSuccessAt:     c.lastSuccessAt,
    lastErrorAt:       c.lastErrorAt,
    lastErrorMessage:  c.lastErrorMessage,
    createdAt:         c.createdAt,
    updatedAt:         c.updatedAt,
  };
}

function isExchangeDisabledError(message: string): boolean {
  return message === 'EXCHANGE_DISABLED' || message.includes('EXCHANGE_DISABLED');
}

export const portfolioController = {
  getSupportedChains: (_req: AuthRequest, res: Response): void => {
    try {
      const chains = portfolioService.getSupportedChains();
      sendSuccess(res, { chains });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  addWallet: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { address, chains, label } = req.body as {
        address: string;
        chains:  string[];
        label?:  string;
      };
      if (!address || typeof address !== 'string') {
        sendError(res, 'address is required', 400);
        return;
      }
      if (!Array.isArray(chains) || chains.length === 0) {
        sendError(res, 'chains must be a non-empty array', 400);
        return;
      }
      const wallet = await portfolioService.addWallet(req.userId!, address, chains, label);
      sendSuccess(res, { wallet: walletToDto(wallet) }, 201);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  removeWallet: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await portfolioService.removeWallet(req.userId!, id);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  getWallets: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const wallets = await portfolioService.getWallets(req.userId!);
      sendSuccess(res, { wallets: wallets.map(walletToDto) });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getEvents: async (req: AuthRequest, res: Response): Promise<void> => {
    const context = parsePortfolioContextFromHeaders(req.headers);
    try {
      const page  = parseInt((req.query.page  as string) || '1',  10);
      const limit = parseInt((req.query.limit as string) || '20', 10);
      const events = await portfolioService.getEvents(req.userId!, page, limit, context);
      sendSuccess(res, { events: events.map(eventToDto) });
    } catch (error: any) {
      if (error instanceof PortfolioApiBlockedError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      sendError(res, error.message, 500);
    }
  },

  refreshEventStatuses: async (req: AuthRequest, res: Response): Promise<void> => {
    const context = parsePortfolioContextFromHeaders(req.headers);
    try {
      const result = await portfolioService.refreshEventStatuses(req.userId!, context);
      sendSuccess(res, result);
    } catch (error: any) {
      if (error instanceof PortfolioApiBlockedError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      sendError(res, error.message, 500);
    }
  },

  getHoldings: async (req: AuthRequest, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const context = parsePortfolioContextFromHeaders(req.headers);
    try {
      const holdings = await portfolioService.getHoldings(req.userId!, forceRefresh, context);
      sendSuccess(res, { holdings });
    } catch (error: any) {
      if (error instanceof PortfolioApiBlockedError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      console.error('[Holdings] controller.getHoldings: error', error?.message);
      sendError(res, error.message, 500);
    }
  },

  getExchanges: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!config.exchangePortfolioEnabled) {
      sendError(res, 'Not found', 404);
      return;
    }
    try {
      const list = await portfolioService.listExchangeConnections(req.userId!);
      sendSuccess(res, { exchanges: list.map(exchangeToDto) });
    } catch (error: any) {
      if (isExchangeDisabledError(error.message)) {
        sendError(res, 'Not found', 404);
        return;
      }
      sendError(res, error.message, 500);
    }
  },

  validateCoinDcx: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!config.exchangePortfolioEnabled) {
      sendError(res, 'Not found', 404);
      return;
    }
    const { apiKey, apiSecret } = req.body as { apiKey?: string; apiSecret?: string };
    if (!apiKey || typeof apiKey !== 'string' || !apiSecret || typeof apiSecret !== 'string') {
      sendError(res, 'apiKey and apiSecret are required', 400);
      return;
    }
    try {
      await portfolioService.validateCoinDcx(apiKey, apiSecret);
      sendSuccess(res, { ok: true });
    } catch (error: any) {
      if (isExchangeDisabledError(error.message)) {
        sendError(res, 'Not found', 404);
        return;
      }
      sendError(res, error.message, 400);
    }
  },

  addCoinDcx: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!config.exchangePortfolioEnabled) {
      sendError(res, 'Not found', 404);
      return;
    }
    const { apiKey, apiSecret, label } = req.body as {
      apiKey?: string;
      apiSecret?: string;
      label?: string;
    };
    if (!apiKey || typeof apiKey !== 'string' || !apiSecret || typeof apiSecret !== 'string') {
      sendError(res, 'apiKey and apiSecret are required', 400);
      return;
    }
    try {
      const conn = await portfolioService.linkCoinDcx(req.userId!, { apiKey, apiSecret, label });
      sendSuccess(res, { exchange: exchangeToDto(conn) }, 201);
    } catch (error: any) {
      if (isExchangeDisabledError(error.message)) {
        sendError(res, 'Not found', 404);
        return;
      }
      sendError(res, error.message, 400);
    }
  },

  patchCoinDcx: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!config.exchangePortfolioEnabled) {
      sendError(res, 'Not found', 404);
      return;
    }
    const { id } = req.params;
    const { apiKey, apiSecret, label } = req.body as {
      apiKey?: string;
      apiSecret?: string;
      label?: string;
    };
    if (!apiKey || typeof apiKey !== 'string' || !apiSecret || typeof apiSecret !== 'string') {
      sendError(res, 'apiKey and apiSecret are required', 400);
      return;
    }
    try {
      const conn = await portfolioService.patchCoinDcx(req.userId!, id, { apiKey, apiSecret, label });
      sendSuccess(res, { exchange: exchangeToDto(conn) });
    } catch (error: any) {
      if (isExchangeDisabledError(error.message)) {
        sendError(res, 'Not found', 404);
        return;
      }
      const code = error.message === 'Exchange connection not found' ? 404 : 400;
      sendError(res, error.message, code);
    }
  },

  removeExchange: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!config.exchangePortfolioEnabled) {
      sendError(res, 'Not found', 404);
      return;
    }
    const { id } = req.params;
    try {
      const result = await portfolioService.removeExchangeConnection(req.userId!, id);
      sendSuccess(res, result);
    } catch (error: any) {
      if (isExchangeDisabledError(error.message)) {
        sendError(res, 'Not found', 404);
        return;
      }
      const code = error.message === 'Exchange connection not found' ? 404 : 400;
      sendError(res, error.message, code);
    }
  },
};
