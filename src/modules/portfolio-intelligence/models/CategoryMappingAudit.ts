import mongoose, { Schema, Document } from 'mongoose';

export interface ICategoryMappingAudit extends Document {
  internalCoinId: string;
  issue: string;
  catalogVersion: number;
  details: Record<string, unknown>;
}

const categoryMappingAuditSchema = new Schema<ICategoryMappingAudit>(
  {
    internalCoinId: { type: String, required: true, index: true },
    issue: { type: String, required: true },
    catalogVersion: { type: Number, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'category_mapping_audit' }
);

export const CategoryMappingAudit = mongoose.model<ICategoryMappingAudit>(
  'CategoryMappingAudit',
  categoryMappingAuditSchema
);
