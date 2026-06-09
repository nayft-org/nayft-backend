import type { TransactionalEmailPayload } from '../email.types';

export const noopEmailProvider = {
  async sendTransactional(_payload: TransactionalEmailPayload): Promise<{ messageId: string; statusCode: number }> {
    return { messageId: 'noop', statusCode: 200 };
  },
};
