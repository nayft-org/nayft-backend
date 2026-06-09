import { config } from '../../../config/env';
import type { TransactionalEmailPayload } from '../email.types';

const MAILTRAP_SEND_URL = 'https://send.api.mailtrap.io/api/send';

export const mailtrapApiProvider = {
  async sendTransactional(payload: TransactionalEmailPayload): Promise<{ messageId: string; statusCode: number }> {
    if (!config.mailtrapApiToken) {
      throw new Error('MAILTRAP_API_TOKEN is not configured');
    }

    const response = await fetch(MAILTRAP_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.mailtrapApiToken}`,
        'Content-Type': 'application/json',
        'X-Nayft-Idempotency-Key': payload.idempotencyKey,
      },
      body: JSON.stringify({
        from: {
          email: config.mailtrapSenderEmail,
          name: config.mailtrapSenderName,
        },
        to: [{ email: payload.to }],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        category: 'verification',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Mailtrap API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json().catch(() => ({}))) as { message_ids?: string[] };
    return { messageId: data.message_ids?.[0] || 'unknown', statusCode: response.status };
  },
};
