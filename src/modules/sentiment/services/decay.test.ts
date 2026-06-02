describe('sentiment decay weight', () => {
  function decayWeight(publishedAt: Date, nowMs: number, lambda: number): number {
    const ageHours = Math.max(0, (nowMs - publishedAt.getTime()) / 3_600_000);
    return Math.exp(-lambda * ageHours);
  }

  it('applies e^(-0.05 * deltaHours)', () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 3_600_000);
    const w = decayWeight(oneHourAgo, now, 0.05);
    expect(w).toBeCloseTo(Math.exp(-0.05), 3);
  });

  it('older articles weigh less', () => {
    const now = Date.now();
    const recent = decayWeight(new Date(now - 3_600_000), now, 0.05);
    const old = decayWeight(new Date(now - 48 * 3_600_000), now, 0.05);
    expect(recent).toBeGreaterThan(old);
  });
});
