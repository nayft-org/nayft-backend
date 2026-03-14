import { Response } from 'express';
import { portfolioService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { IWalletAddress } from './models/WalletAddress';
import { IWalletEvent } from './models/WalletEvent';

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
    id:            (e._id as { toString(): string }).toString(),
    address:       e.address,
    chain:         e.chain,
    type:          e.type,
    rawEventCount: e.rawEventCount,
    enrichedData:  e.enrichedData,
    aggregatedAt:  e.aggregatedAt,
    activity:      e.activity,
  };
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
    try {
      const page  = parseInt((req.query.page  as string) || '1',  10);
      const limit = parseInt((req.query.limit as string) || '20', 10);
      const events = await portfolioService.getEvents(req.userId!, page, limit);
      sendSuccess(res, { events: events.map(eventToDto) });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
