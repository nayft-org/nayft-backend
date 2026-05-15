import type { HydratedDocument } from 'mongoose';
import type { INotification } from '../../../modules/notifications/models/Notification';

/** Email adapter placeholder */
export const EmailChannel = {
  async dispatch(_doc: HydratedDocument<INotification>): Promise<{ skipped: true }> {
    return { skipped: true };
  },
};
