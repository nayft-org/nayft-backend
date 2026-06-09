import type { TransactionalEmailPayload } from '../email.types';

export const mockEmailProvider = {
  async sendTransactional(payload: TransactionalEmailPayload): Promise<{ messageId: string; statusCode: number }> {
    const seed = Buffer.from(payload.idempotencyKey).toString('hex').slice(0, 12);
    return { messageId: `mock-${seed}`, statusCode: 202 };
  },
};

