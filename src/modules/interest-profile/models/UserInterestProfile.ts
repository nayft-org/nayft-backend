import mongoose, { Schema, Document } from 'mongoose';

export interface IUserInterestProfile extends Document {
  userId: string;
  schemaVersion: number;
  computedAt: Date;
  revision: number;
  categoryAffinity: Record<string, number>;
  coinAffinity: Record<string, number>;
  sourceAffinity: Record<string, number>;
  narrativeAffinity: Record<string, number>;
  signals: {
    followedCoins: string[];
    savedArticleIds: string[];
    readArticleIds: string[];
    searchedSymbols: string[];
    reactionCounts: Record<string, number>;
    dwellTimeBuckets: Record<string, number>;
  };
  blendWeights: {
    portfolio: number;
    behavior: number;
    explicit: number;
  };
  stale: boolean;
  ttlExpiresAt?: Date;
}

const userInterestProfileSchema = new Schema<IUserInterestProfile>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    schemaVersion: { type: Number, default: 1 },
    computedAt: { type: Date, required: true },
    revision: { type: Number, required: true, default: 1 },
    categoryAffinity: { type: Schema.Types.Mixed, default: {} },
    coinAffinity: { type: Schema.Types.Mixed, default: {} },
    sourceAffinity: { type: Schema.Types.Mixed, default: {} },
    narrativeAffinity: { type: Schema.Types.Mixed, default: {} },
    signals: {
      followedCoins: { type: [String], default: [] },
      savedArticleIds: { type: [String], default: [] },
      readArticleIds: { type: [String], default: [] },
      searchedSymbols: { type: [String], default: [] },
      reactionCounts: { type: Schema.Types.Mixed, default: {} },
      dwellTimeBuckets: { type: Schema.Types.Mixed, default: {} },
    },
    blendWeights: {
      portfolio: { type: Number, default: 0.45 },
      behavior: { type: Number, default: 0.3 },
      explicit: { type: Number, default: 0.25 },
    },
    stale: { type: Boolean, default: false },
    ttlExpiresAt: { type: Date },
  },
  { timestamps: true, collection: 'user_interest_profiles' }
);

userInterestProfileSchema.index({ computedAt: -1 });

export const UserInterestProfile = mongoose.model<IUserInterestProfile>(
  'UserInterestProfile',
  userInterestProfileSchema
);
