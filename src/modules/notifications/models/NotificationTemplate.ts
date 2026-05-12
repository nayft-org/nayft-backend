import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationTemplate extends Document {
  templateKey: string;
  version: number;
  locale: string;
  channel: string;
  titleTpl: string;
  bodyTpl: string;
  variablesSchema?: Record<string, unknown>;
  isActive: boolean;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    templateKey: { type: String, required: true },
    version: { type: Number, required: true },
    locale: { type: String, required: true, default: 'en' },
    channel: { type: String, required: true, default: 'inapp' },
    titleTpl: { type: String, required: true },
    bodyTpl: { type: String, required: true },
    variablesSchema: { type: Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

NotificationTemplateSchema.index({ templateKey: 1, version: 1, locale: 1, channel: 1 }, { unique: true });

export const NotificationTemplateModel =
  mongoose.models.NotificationTemplate ||
  mongoose.model<INotificationTemplate>('NotificationTemplate', NotificationTemplateSchema);
