import { FilteredCoin, IFilteredCoin } from './models/FilteredCoin';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const filteredCoinRepository = {
  findByBaseAsset: async (baseAsset: string): Promise<IFilteredCoin | null> => {
    const normalized = baseAsset.trim().toUpperCase();
    if (!normalized) return null;
    const escaped = escapeRegex(normalized);
    return FilteredCoin.findOne({
      $or: [
        { base_asset: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { symbol: { $regex: new RegExp(`^${escaped}(USDT|USD|BTC)$`, 'i') } },
      ],
    }).sort({ fetched_at: -1 });
  },
};
