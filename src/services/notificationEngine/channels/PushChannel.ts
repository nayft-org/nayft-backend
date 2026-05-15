import type { HydratedDocument } from 'mongoose';
import type { INotification } from '../../../modules/notifications/models/Notification';

/**
 * Push adapter placeholder — wire Expo / FCM / APNS later.
 */
export const PushChannel = {
  async dispatch(_doc: HydratedDocument<INotification>): Promise<{ skipped: true }> {
    return { skipped: true };
  },
};
