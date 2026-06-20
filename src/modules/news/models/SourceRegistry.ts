import mongoose, { Schema } from 'mongoose';

export type SourceStatus = 'pending' | 'approved' | 'blocked';
export type TrustCategory = 'verified' | 'trusted' | 'community' | 'unknown';
export type LogoSource = 'manual' | 'favicon' | 'upload';

export interface ISourceRegistry {
  sourceKey: string;
  sourceName: string;
  sourceDomain: string;
  sourceLogo?: string;
  logoObjectKey?: string;
  logoSource?: LogoSource;
  logoFetchedAt?: Date;
  status: SourceStatus;
  trustScore: number;
  trustCategory: TrustCategory;
  isActive: boolean;
  discoveredAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  articleCount?: number;
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISourceAlias {
  aliasKey: string;
  sourceKey: string;
  aliasType: 'name' | 'domain' | 'legacy_key';
  createdAt: Date;
}

const sourceRegistrySchema = new Schema<ISourceRegistry>(
  {
    sourceKey: { type: String, required: true, unique: true },
    sourceName: { type: String, required: true },
    sourceDomain: { type: String, default: '' },
    sourceLogo: { type: String },
    logoObjectKey: { type: String },
    logoSource: { type: String, enum: ['manual', 'favicon', 'upload'] },
    logoFetchedAt: { type: Date },
    status: { type: String, enum: ['pending', 'approved', 'blocked'], default: 'pending', required: true },
    trustScore: { type: Number, default: 0.6 },
    trustCategory: {
      type: String,
      enum: ['verified', 'trusted', 'community', 'unknown'],
      default: 'community',
    },
    isActive: { type: Boolean, default: false },
    discoveredAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: String },
    articleCount: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'source_registry' }
);

sourceRegistrySchema.index({ sourceDomain: 1 });
sourceRegistrySchema.index({ status: 1 });
sourceRegistrySchema.index({ status: 1, articleCount: -1 });
sourceRegistrySchema.index({ isActive: 1 });

const sourceAliasSchema = new Schema<ISourceAlias>(
  {
    aliasKey: { type: String, required: true, unique: true },
    sourceKey: { type: String, required: true },
    aliasType: { type: String, enum: ['name', 'domain', 'legacy_key'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'source_aliases' }
);

sourceAliasSchema.index({ sourceKey: 1 });

export const SourceRegistry = mongoose.model<ISourceRegistry>('SourceRegistry', sourceRegistrySchema);
export const SourceAlias = mongoose.model<ISourceAlias>('SourceAlias', sourceAliasSchema);

export function toTrustCategory(score: number): TrustCategory {
  if (score >= 0.9) return 'verified';
  if (score >= 0.75) return 'trusted';
  if (score >= 0.5) return 'community';
  return 'unknown';
}

export function defaultTrustForStatus(status: SourceStatus): { trustScore: number; trustCategory: TrustCategory } {
  switch (status) {
    case 'approved':
      return { trustScore: 0.75, trustCategory: 'trusted' };
    case 'blocked':
      return { trustScore: 0.0, trustCategory: 'unknown' };
    default:
      return { trustScore: 0.6, trustCategory: 'community' };
  }
}
