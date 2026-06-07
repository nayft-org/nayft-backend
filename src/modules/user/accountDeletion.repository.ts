import mongoose from 'mongoose';
import { WalletAddress } from '../portfolio/models/WalletAddress';
import { WalletEvent } from '../portfolio/models/WalletEvent';
import { Holding } from '../portfolio/models/Holding';
import { ExchangeConnection } from '../portfolio/models/ExchangeConnection';
import { PortfolioPosition } from '../portfolio-intelligence/models/PortfolioPosition';
import { PortfolioSnapshot } from '../portfolio-intelligence/models/PortfolioSnapshot';
import { PortfolioAnalyticsSnapshot } from '../portfolio-intelligence/models/PortfolioAnalyticsSnapshot';
import { PiRecomputeJob } from '../portfolio-intelligence/models/PiRecomputeJob';
import { Follow } from '../follow/model';
import { Wishlist } from '../wishlist/model';
import { RewardsActivity } from '../rewards/model';
import { NewsBoard } from '../newsboard/model';
import { Reaction } from '../reaction/model';
import { UserNewsInteraction } from '../news/models/UserNewsInteraction';
import { Comment } from '../comment/model';
import { NotificationModel } from '../notifications/models/Notification';
import { NotificationPreferenceModel } from '../notifications/models/NotificationPreference';
import { UserNotificationChannelModel } from '../notifications/models/NotificationChannel';
import { NotificationDeliveryLogModel } from '../notifications/models/NotificationDeliveryLog';
import { NotificationBatchModel } from '../notifications/models/NotificationBatch';
import { DeviceSessionModel } from '../notifications/models/DeviceSession';
import { SystemEvent } from '../../core/event-system/event.model';
import { User } from './model';

function toObjectId(userId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user id');
  }
  return new mongoose.Types.ObjectId(userId);
}

export const accountDeletionRepository = {
  async purgeUserData(userId: string): Promise<void> {
    const userOid = toObjectId(userId);

    await Promise.all([
      WalletAddress.deleteMany({ userId }),
      WalletEvent.deleteMany({ userId }),
      Holding.deleteMany({ userId }),
      ExchangeConnection.deleteMany({ userId }),
      PortfolioPosition.deleteMany({ userId }),
      PortfolioSnapshot.deleteMany({ userId }),
      PortfolioAnalyticsSnapshot.deleteMany({ userId }),
      PiRecomputeJob.deleteMany({ userId }),
      Follow.deleteMany({
        $or: [{ followerId: userId }, { targetType: 'user', targetId: userId }],
      }),
      Wishlist.deleteMany({ userId }),
      RewardsActivity.deleteMany({ userId }),
      NewsBoard.deleteMany({ userId }),
      Reaction.deleteMany({ userId }),
      UserNewsInteraction.deleteMany({ userId }),
      Comment.deleteMany({ userId }),
      NotificationModel.deleteMany({ userId: userOid }),
      NotificationPreferenceModel.deleteMany({ userId: userOid }),
      UserNotificationChannelModel.deleteMany({ userId: userOid }),
      NotificationDeliveryLogModel.deleteMany({ userId: userOid }),
      NotificationBatchModel.deleteMany({ userId: userOid }),
      DeviceSessionModel.deleteMany({ userId: userOid }),
      SystemEvent.deleteMany({ userId }),
    ]);
  },

  async deleteUserById(userId: string): Promise<boolean> {
    const result = await User.deleteOne({ _id: userId });
    return result.deletedCount > 0;
  },
};
