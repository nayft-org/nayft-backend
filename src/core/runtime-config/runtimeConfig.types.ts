export type SchemaEnforcementMode = 'off' | 'log' | 'enforce';

export interface RuntimeKillSwitches {
  events_ingest_enabled: boolean;
  events_schema_enforcement: SchemaEnforcementMode;
  ws_protocol_v1_enabled: boolean;
  ws_protocol_v2_required: boolean;
  notification_bridge_enabled: boolean;
  personalization_globally_disabled: boolean;
  pi_recompute_enqueue_enabled: boolean;
  third_party_zerion_enabled: boolean;
  third_party_alchemy_enabled: boolean;
  third_party_translate_enabled: boolean;
  client_analytics_server_accept: boolean;
  admin_writes_disabled: boolean;
}

export interface RuntimeConfigDocument {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  switches: RuntimeKillSwitches;
  minAppVersion?: string;
}

export const DEFAULT_RUNTIME_SWITCHES: RuntimeKillSwitches = {
  events_ingest_enabled: true,
  events_schema_enforcement: 'log',
  ws_protocol_v1_enabled: true,
  ws_protocol_v2_required: false,
  notification_bridge_enabled: true,
  personalization_globally_disabled: false,
  pi_recompute_enqueue_enabled: true,
  third_party_zerion_enabled: true,
  third_party_alchemy_enabled: true,
  third_party_translate_enabled: true,
  client_analytics_server_accept: true,
  admin_writes_disabled: false,
};

export const RUNTIME_CONFIG_REDIS_KEY = 'runtime:config:v1';
export const RUNTIME_CONFIG_MONGO_KEY = 'runtime_config';
