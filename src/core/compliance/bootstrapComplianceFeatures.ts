import { registerFeature } from '../feature-system/featureRegistry';

/** Compliance rollout feature flags — controllable via admin API. */
export async function bootstrapComplianceFeatures(): Promise<void> {
  await registerFeature({
    key: 'strict_event_schemas',
    name: 'Strict Event Schemas',
    module: 'compliance',
    description: 'Enforce per-event metadata allowlists on POST /api/events',
    controllable: true,
  });

  await registerFeature({
    key: 'ws_v2_auth',
    name: 'WebSocket v2 Auth',
    module: 'compliance',
    description: 'Require post-connect WS auth message instead of query JWT',
    controllable: true,
  });

  await registerFeature({
    key: 'personalization_opt_out',
    name: 'Personalization Opt-Out',
    module: 'compliance',
    description: 'Allow users to disable feed personalization and PI context',
    controllable: true,
  });
}
