export interface EmitEventPayload {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemEventDocument {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
