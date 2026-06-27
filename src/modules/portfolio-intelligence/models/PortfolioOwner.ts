import mongoose, { Schema, Document } from 'mongoose';

export type PortfolioOwnerType = 'user' | 'public_wallet' | 'shared' | 'dao' | 'fund';

export interface IPortfolioOwner extends Document {
  ownerId: string;
  ownerType: PortfolioOwnerType;
  userId?: string;
  walletAddresses?: string[];
  goalProfileId?: string;
  benchmarkParticipation: boolean;
  metadata: Record<string, unknown>;
}

const portfolioOwnerSchema = new Schema<IPortfolioOwner>(
  {
    ownerId: { type: String, required: true, unique: true, index: true },
    ownerType: {
      type: String,
      enum: ['user', 'public_wallet', 'shared', 'dao', 'fund'],
      required: true,
      default: 'user',
    },
    userId: { type: String, index: true, sparse: true },
    walletAddresses: { type: [String], default: [] },
    goalProfileId: { type: String },
    benchmarkParticipation: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'portfolio_owners' }
);

portfolioOwnerSchema.index({ userId: 1 }, { unique: true, sparse: true });

export const PortfolioOwner = mongoose.model<IPortfolioOwner>(
  'PortfolioOwner',
  portfolioOwnerSchema
);
