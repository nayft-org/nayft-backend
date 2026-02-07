import { Wishlist } from '../wishlist/model';
import { IWishlist } from '../../types';

export const wishlistRepository = {
  findByUserAndCoin: async (userId: string, coinId: string): Promise<IWishlist | null> => {
    return Wishlist.findOne({ userId, coinId });
  },

  findByUser: async (userId: string): Promise<IWishlist[]> => {
    return Wishlist.find({ userId }).sort({ createdAt: -1 });
  },

  create: async (userId: string, coinId: string): Promise<IWishlist> => {
    const wishlist = new Wishlist({ userId, coinId });
    return wishlist.save();
  },

  delete: async (userId: string, coinId: string): Promise<boolean> => {
    const result = await Wishlist.deleteOne({ userId, coinId });
    return result.deletedCount > 0;
  },
};

