import { Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { getRuntimeConfig } from '../runtime-config/runtimeConfig.service';

/** Public hints for mobile clients (no secrets). */
export const runtimeHintsController = {
  get: async (_req: unknown, res: Response): Promise<void> => {
    const cfg = await getRuntimeConfig();
    sendSuccess(res, {
      minAppVersion: cfg.minAppVersion ?? '1.0.0',
      clientAnalyticsServerAccept: cfg.switches.client_analytics_server_accept,
      wsProtocolV2Required: cfg.switches.ws_protocol_v2_required,
      eventsSchemaEnforcement: cfg.switches.events_schema_enforcement,
    });
  },
};
