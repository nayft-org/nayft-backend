import { getRuntimeSwitchesSync, refreshRuntimeConfigSnapshot } from '../core/runtime-config/runtimeConfig.service';

jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('mongoose', () => ({
  connection: { readyState: 0, db: null },
}));

describe('runtimeConfig snapshot', () => {
  it('getRuntimeSwitchesSync returns without Redis I/O', () => {
    const switches = getRuntimeSwitchesSync();
    expect(switches).toBeDefined();
    expect(typeof switches.events_ingest_enabled).toBe('boolean');
  });

  it('refreshRuntimeConfigSnapshot updates sync read', async () => {
    await refreshRuntimeConfigSnapshot();
    const switches = getRuntimeSwitchesSync();
    expect(switches).toBeDefined();
  });
});
