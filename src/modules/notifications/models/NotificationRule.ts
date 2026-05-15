import mongoose, { Schema, Document } from 'mongoose';

export type NotificationRuleScope = 'global' | 'segment' | 'user';

export interface INotificationRule extends Document {
  ruleKey: string;
  scope: NotificationRuleScope;
  eventType: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  rollout?: Record<string, unknown>;
}

const NotificationRuleSchema = new Schema<INotificationRule>(
  {
    ruleKey: { type: String, required: true, unique: true },
    scope: { type: String, enum: ['global', 'segment', 'user'], default: 'global' },
    eventType: { type: String, required: true },
    conditions: { type: Schema.Types.Mixed, default: {} },
    actions: { type: Schema.Types.Mixed, default: {} },
    priority: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    rollout: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

NotificationRuleSchema.index({ eventType: 1, enabled: 1 });
NotificationRuleSchema.index({ scope: 1 });

export const NotificationRuleModel =
  mongoose.models.NotificationRule || mongoose.model<INotificationRule>('NotificationRule', NotificationRuleSchema);
