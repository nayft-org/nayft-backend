import type { HydratedDocument } from 'mongoose';
import type { INotification } from '../../../modules/notifications/models/Notification';

/** SMS adapter placeholder */
export const SmsChannel = {
  async dispatch(_doc: HydratedDocument<INotification>): Promise<{ skipped: true }> {
    return { skipped: true };
  },
};
