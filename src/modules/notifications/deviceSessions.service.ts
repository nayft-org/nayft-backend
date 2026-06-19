import mongoose from 'mongoose';
import { DeviceSessionModel } from './models/DeviceSession';

export const deviceSessionsService = {
  async upsert(
    userId: string,
    input: { deviceId: string; platform: string; pushToken: string }
  ): Promise<{ ok: true; deviceId: string }> {
    const deviceId = input.deviceId.trim().slice(0, 128);
    const pushToken = input.pushToken.trim();
    const platform = input.platform.trim().slice(0, 32);
    if (!deviceId || !pushToken || !platform) {
      throw new Error('deviceId, platform, and pushToken are required');
    }

    await DeviceSessionModel.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        deviceId,
      },
      {
        $set: {
          platform,
          pushToken,
          lastSeenAt: new Date(),
          isActive: true,
        },
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(userId),
          deviceId,
        },
      },
      { upsert: true, new: true }
    );

    return { ok: true, deviceId };
  },

  async remove(userId: string, deviceId: string): Promise<{ ok: boolean }> {
    const res = await DeviceSessionModel.deleteOne({
      userId: new mongoose.Types.ObjectId(userId),
      deviceId: deviceId.trim().slice(0, 128),
    });
    return { ok: res.deletedCount > 0 };
  },

  async findActivePushTokens(userId: string): Promise<string[]> {
    const docs = await DeviceSessionModel.find({
      userId: new mongoose.Types.ObjectId(userId),
      isActive: true,
      pushToken: { $exists: true, $ne: '' },
    })
      .select('pushToken')
      .lean();
    return docs
      .map((d) => d.pushToken)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  },

  async deactivateToken(pushToken: string): Promise<void> {
    await DeviceSessionModel.updateMany(
      { pushToken },
      { $set: { isActive: false, pushToken: undefined } }
    );
  },
};
