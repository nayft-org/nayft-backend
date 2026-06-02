import mongoose, { Schema, Document } from 'mongoose';

export interface IRrsUniverseMember {
  symbol: string;
  internalCoinId?: string;
  marketCapRank?: number;
  marketCap?: number;
  eligibilityFlags: string[];
}

export interface IRrsBuildUniverse extends Document {
  buildId: string;
  revision?: number;
  buildCutoffTime: Date;
  universeHash: string;
  universeSize: number;
  tier: string;
  members: IRrsUniverseMember[];
  inputRevisions: {
    sentimentRevision: number | null;
    marketDataAsOf: string;
    ohlcCutoffTime: string;
  };
  factorSchemaVersion: string;
  normalizationVersion: string;
  crsFormulaVersion: string;
  regimeLogicVersion: string;
  providerVersions: Record<string, string>;
  frozenAt: Date;
}

const memberSchema = new Schema<IRrsUniverseMember>(
  {
    symbol: { type: String, required: true },
    internalCoinId: { type: String },
    marketCapRank: { type: Number },
    marketCap: { type: Number },
    eligibilityFlags: { type: [String], default: [] },
  },
  { _id: false }
);

const rrsBuildUniverseSchema = new Schema<IRrsBuildUniverse>(
  {
    buildId: { type: String, required: true, unique: true },
    revision: { type: Number },
    buildCutoffTime: { type: Date, required: true },
    universeHash: { type: String, required: true },
    universeSize: { type: Number, required: true },
    tier: { type: String, default: 'A' },
    members: { type: [memberSchema], required: true },
    inputRevisions: {
      sentimentRevision: { type: Number, default: null },
      marketDataAsOf: { type: String, required: true },
      ohlcCutoffTime: { type: String, required: true },
    },
    factorSchemaVersion: { type: String, required: true },
    normalizationVersion: { type: String, required: true },
    crsFormulaVersion: { type: String, required: true },
    regimeLogicVersion: { type: String, required: true },
    providerVersions: { type: Schema.Types.Mixed, required: true },
    frozenAt: { type: Date, required: true },
  },
  { timestamps: true }
);

rrsBuildUniverseSchema.index({ frozenAt: -1 });

export const RrsBuildUniverse = mongoose.model<IRrsBuildUniverse>(
  'RrsBuildUniverse',
  rrsBuildUniverseSchema,
  'rrs_build_universe'
);
