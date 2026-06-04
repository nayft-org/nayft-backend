export type PiSystemEventType =
  | 'portfolio_intelligence.positions_normalized'
  | 'portfolio_intelligence.recompute_started'
  | 'portfolio_intelligence.recompute_completed'
  | 'portfolio_intelligence.recompute_failed'
  | 'portfolio_intelligence.mapping_low_confidence'
  | 'portfolio_intelligence.reconciliation_drift'
  | 'portfolio_intelligence.shadow_drift';

export type PiEventMetadata = {
  userId: string;
  correlationId: string;
  ingestRevision?: number;
  analyticsRevision?: number;
  trigger?: string;
  driftPct?: number;
  error?: string;
};
