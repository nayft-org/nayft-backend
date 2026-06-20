import mongoose, { Schema } from 'mongoose';

export type SourceAuditAction =
  | 'publisher_created'
  | 'publisher_approved'
  | 'publisher_blocked'
  | 'publisher_reinstated'
  | 'logo_changed'
  | 'trust_changed'
  | 'domain_changed'
  | 'alias_added'
  | 'alias_removed'
  | 'publishers_merged'
  | 'repair_logo_attempted'
  | 'repair_logo_succeeded'
  | 'repair_logo_failed'
  | 'trust_assigned_default';

export type SourceAuditActorType = 'admin' | 'system' | 'repair_job' | 'ingest';

export interface ISourceAuditLog {
  sourceKey: string;
  action: SourceAuditAction;
  previousValue?: unknown;
  newValue?: unknown;
  actorId?: string;
  actorType: SourceAuditActorType;
  correlationId?: string;
  createdAt: Date;
}

const sourceAuditLogSchema = new Schema<ISourceAuditLog>(
  {
    sourceKey: { type: String, required: true },
    action: { type: String, required: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    actorId: { type: String },
    actorType: {
      type: String,
      enum: ['admin', 'system', 'repair_job', 'ingest'],
      required: true,
    },
    correlationId: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'source_audit_logs', timestamps: false }
);

// 90-day TTL
sourceAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });
sourceAuditLogSchema.index({ sourceKey: 1, createdAt: -1 });
sourceAuditLogSchema.index({ action: 1, createdAt: -1 });

export const SourceAuditLog = mongoose.model<ISourceAuditLog>('SourceAuditLog', sourceAuditLogSchema);

export async function recordSourceAudit(entry: {
  sourceKey: string;
  action: SourceAuditAction;
  previousValue?: unknown;
  newValue?: unknown;
  actorId?: string;
  actorType: SourceAuditActorType;
  correlationId?: string;
}): Promise<void> {
  try {
    await SourceAuditLog.create({ ...entry, createdAt: new Date() });
  } catch (err) {
    console.error('[SourceAuditLog] write failed', err);
  }
}
