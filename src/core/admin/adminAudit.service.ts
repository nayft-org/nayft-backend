import mongoose from 'mongoose';

export interface IAdminAuditLog {
  actorId?: string;
  action: string;
  target: string;
  diff: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const adminAuditSchema = new mongoose.Schema<IAdminAuditLog>(
  {
    actorId: { type: String },
    action: { type: String, required: true },
    target: { type: String, required: true },
    diff: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'admin_audit_logs' }
);

adminAuditSchema.index({ createdAt: -1 });
adminAuditSchema.index({ action: 1, createdAt: -1 });

export const AdminAuditLog =
  mongoose.models.AdminAuditLog ||
  mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditSchema);

export async function recordAdminAudit(entry: {
  actorId?: string;
  action: string;
  target: string;
  diff: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await AdminAuditLog.create(entry);
  } catch (err) {
    console.error('[AdminAudit] write failed', err);
  }
}
