import mongoose from 'mongoose';
import { User } from './model';
import { WalletAddress } from '../portfolio/models/WalletAddress';
import { WalletEvent } from '../portfolio/models/WalletEvent';
import { Holding } from '../portfolio/models/Holding';
import { ExchangeConnection } from '../portfolio/models/ExchangeConnection';
import { Follow } from '../follow/model';
import { Wishlist } from '../wishlist/model';
import { RewardsActivity } from '../rewards/model';
import { NewsBoard } from '../newsboard/model';
import { Reaction } from '../reaction/model';
import { Comment } from '../comment/model';
import { NotificationModel } from '../notifications/models/Notification';
import { NotificationPreferenceModel } from '../notifications/models/NotificationPreference';
import { SystemEvent } from '../../core/event-system/event.model';

function redactUser(user: Record<string, unknown>) {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

export const userExportService = {
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');

    const [
      wallets,
      walletEvents,
      holdings,
      exchanges,
      follows,
      wishlist,
      rewards,
      boards,
      reactions,
      comments,
      notifications,
      preferences,
      events,
    ] = await Promise.all([
      WalletAddress.find({ userId }).lean(),
      WalletEvent.find({ userId }).select('-enrichedData').lean(),
      Holding.find({ userId }).lean(),
      ExchangeConnection.find({ userId }).select('-encryptedSecretBlob').lean(),
      Follow.find({ followerId: userId }).lean(),
      Wishlist.find({ userId }).lean(),
      RewardsActivity.find({ userId }).lean(),
      NewsBoard.find({ userId }).lean(),
      Reaction.find({ userId }).lean(),
      Comment.find({ userId }).lean(),
      NotificationModel.find({ userId: new mongoose.Types.ObjectId(userId) }).lean(),
      NotificationPreferenceModel.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean(),
      SystemEvent.find({ userId }).lean(),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      user: redactUser(user as Record<string, unknown>),
      wallets,
      walletEvents,
      holdings,
      exchangeConnections: exchanges,
      follows,
      wishlist,
      rewards,
      newsBoards: boards,
      reactions,
      comments,
      notifications,
      notificationPreferences: preferences,
      analyticsEvents: events,
    };
  },
};
