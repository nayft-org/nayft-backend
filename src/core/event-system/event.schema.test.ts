import { emitEventSchema } from './event.schema';

describe('emitEventSchema', () => {
  it('validates valid payload', () => {
    const result = emitEventSchema.safeParse({
      featureKey: 'auth',
      eventType: 'login',
      metadata: { foo: 'bar' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featureKey).toBe('auth');
      expect(result.data.eventType).toBe('login');
      expect(result.data.metadata).toEqual({ foo: 'bar' });
    }
  });

  it('rejects empty featureKey', () => {
    const result = emitEventSchema.safeParse({
      featureKey: '',
      eventType: 'login',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty eventType', () => {
    const result = emitEventSchema.safeParse({
      featureKey: 'auth',
      eventType: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional userId', () => {
    const result = emitEventSchema.safeParse({
      featureKey: 'auth',
      eventType: 'login',
      userId: 'user-123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe('user-123');
    }
  });

  it('defaults metadata to empty object', () => {
    const result = emitEventSchema.safeParse({
      featureKey: 'auth',
      eventType: 'login',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });
});
