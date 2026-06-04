import mongoose, { Schema, Document } from 'mongoose';
import type { PiTrigger } from '../contracts/piContracts';

export type PiJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IPiRecomputeJob extends Document {
  jobId: string;
  userId: string;
  trigger: PiTrigger;
  status: PiJobStatus;
  correlationId: string;
  attempts: number;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
}

const piRecomputeJobSchema = new Schema<IPiRecomputeJob>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    trigger: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], required: true },
    correlationId: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true, collection: 'pi_recompute_jobs' }
);

piRecomputeJobSchema.index({ userId: 1, createdAt: -1 });
piRecomputeJobSchema.index({ status: 1, createdAt: -1 });

export const PiRecomputeJob = mongoose.model<IPiRecomputeJob>('PiRecomputeJob', piRecomputeJobSchema);
