import type { TransactionalEmailPayload } from '../email.types';

export const noopEmailProvider = {
  async sendTransactional(_payload: TransactionalEmailPayload): Promise<{ messageId: string }> {
    return { messageId: 'noop' };
  },
};
