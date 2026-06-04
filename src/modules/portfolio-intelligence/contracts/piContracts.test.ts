import {
  PI_SCHEMA_VERSION,
  PI_JOB_SCHEMA_VERSION,
  PI_CONTEXT_SCHEMA_VERSION,
  type PiRecomputeJob,
  type PortfolioContextDto,
} from './piContracts';

describe('piContracts v1', () => {
  it('exposes stable schema versions', () => {
    expect(PI_SCHEMA_VERSION).toBe(1);
    expect(PI_JOB_SCHEMA_VERSION).toBe(1);
    expect(PI_CONTEXT_SCHEMA_VERSION).toBe(1);
  });

  it('PiRecomputeJob shape', () => {
    const job: PiRecomputeJob = {
      jobSchemaVersion: PI_JOB_SCHEMA_VERSION,
      userId: 'u1',
      trigger: 'webhook',
      correlationId: 'pi-test',
      enqueuedAt: new Date().toISOString(),
    };
    expect(job.userId).toBe('u1');
  });

  it('PortfolioContextDto shape', () => {
    const dto: PortfolioContextDto = {
      schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
      userId: 'u1',
      heldSymbols: ['BTC'],
      heldCoinIds: [],
      weightBySymbol: { BTC: 1 },
      ingestRevision: 1,
      analyticsRevision: 0,
      stale: false,
      staleMapping: false,
    };
    expect(dto.heldSymbols).toContain('BTC');
  });
});
