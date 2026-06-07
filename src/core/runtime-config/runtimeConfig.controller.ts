import { Response } from 'express';
import { AuthRequest } from '../../types';
import { sendError, sendSuccess } from '../../utils/response';
import { getRuntimeConfig, patchRuntimeConfig, invalidateRuntimeConfigCache } from './runtimeConfig.service';
import type { RuntimeKillSwitches } from './runtimeConfig.types';
import { recordAdminAudit } from '../admin/adminAudit.service';
import { invalidateWsRuntimeSwitchCache } from '../../websocket/authGate';

export const runtimeConfigController = {
  get: async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const cfg = await getRuntimeConfig();
      sendSuccess(res, cfg);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to load runtime config', 500);
    }
  },

  patch: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const cfg = await getRuntimeConfig();
      if (cfg.switches.admin_writes_disabled) {
        sendError(res, 'Admin writes are disabled', 503);
        return;
      }

      const body = req.body as Partial<RuntimeKillSwitches> & { minAppVersion?: string };
      const allowedKeys: (keyof RuntimeKillSwitches | 'minAppVersion')[] = [
        'events_ingest_enabled',
        'events_schema_enforcement',
        'ws_protocol_v1_enabled',
        'ws_protocol_v2_required',
        'notification_bridge_enabled',
        'personalization_globally_disabled',
        'pi_recompute_enqueue_enabled',
        'third_party_zerion_enabled',
        'third_party_alchemy_enabled',
        'third_party_translate_enabled',
        'client_analytics_server_accept',
        'admin_writes_disabled',
        'minAppVersion',
      ];

      const patch: Partial<RuntimeKillSwitches> & { minAppVersion?: string } = {};
      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          (patch as Record<string, unknown>)[key] = body[key];
        }
      }

      const updated = await patchRuntimeConfig(patch, req.headers['x-admin-id'] as string | undefined);
      invalidateRuntimeConfigCache();
      invalidateWsRuntimeSwitchCache();
      void recordAdminAudit({
        actorId: req.headers['x-admin-id'] as string | undefined,
        action: 'runtime_config.patch',
        target: 'runtime_config',
        diff: patch as Record<string, unknown>,
        ip: req.ip,
      });
      sendSuccess(res, updated);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to update runtime config', 500);
    }
  },
};
