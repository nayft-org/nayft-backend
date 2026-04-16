import { Coin } from './model';
import { LabeledCoin } from './models/LabeledCoin';
import { CmcLabeledCoin } from './models/CmcLabeledCoin';
import { FilteredCoin } from './models/FilteredCoin';
import { IdentityResolutionQueue, ResolutionSource } from './models/IdentityResolutionQueue';

export interface CoinIdentityResolution {
  internalCoinId: string | null;
  resolutionSource: ResolutionSource;
  confidence: number;
}

function normalizeInput(token: string): string {
  const candidate = token.includes('=') ? token.split('=')[1] : token;
  return candidate.trim();
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function looksNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

async function queueUnresolved(inputToken: string, normalizedToken: string, confidence: number): Promise<void> {
  await IdentityResolutionQueue.updateOne(
    { normalizedToken, status: { $in: ['pending', 'retrying', 'manual_review'] } },
    {
      $setOnInsert: {
        inputToken,
        normalizedToken,
        firstSeenAt: new Date(),
      },
      $set: {
        confidence,
        status: confidence >= 0.5 ? 'manual_review' : 'pending',
        lastTriedAt: new Date(),
      },
      $inc: { retryCount: 1 },
    },
    { upsert: true }
  ).exec();
}

export const identityResolver = {
  async resolve(token: string): Promise<CoinIdentityResolution> {
    const normalizedToken = normalizeInput(token);
    if (!normalizedToken) {
      return { internalCoinId: null, resolutionSource: 'fallback', confidence: 0 };
    }

    if (looksLikeUuid(normalizedToken)) {
      const byInternal = await Coin.findOne({ internalCoinId: normalizedToken })
        .select('internalCoinId')
        .lean()
        .exec();
      if (byInternal?.internalCoinId) {
        return {
          internalCoinId: byInternal.internalCoinId,
          resolutionSource: 'providerId',
          confidence: 1,
        };
      }
    }

    if (looksNumeric(normalizedToken)) {
      const byCmc = await CmcLabeledCoin.findOne({ id: Number(normalizedToken) })
        .select('internalCoinId')
        .lean()
        .exec();
      if (byCmc?.internalCoinId) {
        return {
          internalCoinId: byCmc.internalCoinId,
          resolutionSource: 'providerId',
          confidence: 0.95,
        };
      }
    }

    const byGecko = await LabeledCoin.findOne({ id: normalizedToken.toLowerCase() })
      .select('internalCoinId')
      .lean()
      .exec();
    if (byGecko?.internalCoinId) {
      return {
        internalCoinId: byGecko.internalCoinId,
        resolutionSource: 'providerId',
        confidence: 0.95,
      };
    }

    const byLegacyCoinId = await Coin.findOne({ coinId: normalizedToken })
      .select('internalCoinId')
      .lean()
      .exec();
    if (byLegacyCoinId?.internalCoinId) {
      return {
        internalCoinId: byLegacyCoinId.internalCoinId,
        resolutionSource: 'providerId',
        confidence: 0.9,
      };
    }

    const symbol = normalizedToken.toUpperCase();
    const [bySymbolCoin, bySymbolFiltered] = await Promise.all([
      Coin.findOne({ symbol }).select('internalCoinId').lean().exec(),
      FilteredCoin.findOne({ base_asset: symbol }).select('internalCoinId').lean().exec(),
    ]);

    if (bySymbolCoin?.internalCoinId) {
      return {
        internalCoinId: bySymbolCoin.internalCoinId,
        resolutionSource: 'symbol',
        confidence: 0.75,
      };
    }
    if (bySymbolFiltered?.internalCoinId) {
      return {
        internalCoinId: bySymbolFiltered.internalCoinId,
        resolutionSource: 'fallback',
        confidence: 0.6,
      };
    }

    await queueUnresolved(token, normalizedToken, 0);
    return { internalCoinId: null, resolutionSource: 'fallback', confidence: 0 };
  },
};

