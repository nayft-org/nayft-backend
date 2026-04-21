import mongoose, { Schema, Document } from 'mongoose';

export type WebhookIdempotencyProvider = 'alchemy' | 'zerion';

export interface IPortfolioWebhookIdempotency extends Document {
  dedupeKey: string;
  provider:  WebhookIdempotencyProvider;
  createdAt: Date;
}

const portfolioWebhookIdempotencySchema = new Schema<IPortfolioWebhookIdempotency>(
  {
    dedupeKey: { type: String, required: true, unique: true },
    provider:  { type: String, required: true, enum: ['alchemy', 'zerion'] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'portfolio_webhook_idempotencies' }
);

export const PortfolioWebhookIdempotency = mongoose.model<IPortfolioWebhookIdempotency>(
  'PortfolioWebhookIdempotency',
  portfolioWebhookIdempotencySchema
);
