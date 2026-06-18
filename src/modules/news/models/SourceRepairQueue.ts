import mongoose, { Schema } from 'mongoose';

export type RepairType = 'logo' | 'domain' | 'trust' | 'denorm';
export type RepairStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ISourceRepairItem {
  sourceKey: string;
  repairType: RepairType;
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  lastError?: string;
  status: RepairStatus;
  createdAt: Date;
  updatedAt: Date;
}

const sourceRepairQueueSchema = new Schema<ISourceRepairItem>(
  {
    sourceKey: { type: String, required: true },
    repairType: { type: String, enum: ['logo', 'domain', 'trust', 'denorm'], required: true },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    nextRetryAt: { type: Date },
    lastError: { type: String },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
  },
  { timestamps: true, collection: 'source_repair_queue' }
);

sourceRepairQueueSchema.index({ status: 1, nextRetryAt: 1 });
sourceRepairQueueSchema.index({ sourceKey: 1, repairType: 1 }, { unique: true });

export const SourceRepairQueue = mongoose.model<ISourceRepairItem>(
  'SourceRepairQueue',
  sourceRepairQueueSchema
);
