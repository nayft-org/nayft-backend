export interface EmitEventPayload {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  /** Set by queue worker after client validation — skips duplicate server registry pass. */
  preValidated?: boolean;
}

export interface SystemEventDocument {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
