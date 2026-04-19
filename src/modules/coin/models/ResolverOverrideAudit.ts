import mongoose, { Document, Schema } from 'mongoose';

export interface IResolverOverrideAudit extends Document {
  inputToken: string;
  previousInternalCoinId?: string;
  resolvedInternalCoinId: string;
  overrideBy: string;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const resolverOverrideAuditSchema = new Schema<IResolverOverrideAudit>(
  {
    inputToken: { type: String, required: true },
    previousInternalCoinId: { type: String },
    resolvedInternalCoinId: { type: String, required: true, index: true },
    overrideBy: { type: String, required: true },
    reason: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

resolverOverrideAuditSchema.index({ inputToken: 1, createdAt: -1 });

export const ResolverOverrideAudit = mongoose.model<IResolverOverrideAudit>(
  'ResolverOverrideAudit',
  resolverOverrideAuditSchema,
  'resolverOverrideAudit'
);

