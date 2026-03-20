import { eventService } from './event.service';

jest.mock('./event.model', () => ({
  SystemEvent: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../feature-system/featureValidator', () => ({
  featureExists: jest.fn(),
}));

import { SystemEvent } from './event.model';
import { featureExists } from '../feature-system/featureValidator';

describe('eventService.emitEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists with invalidFeature when key missing', async () => {
    (featureExists as jest.Mock).mockResolvedValue(false);
    await eventService.emitEvent({
      featureKey: 'unknown',
      eventType: 'click',
      metadata: {},
    });
    expect(SystemEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'unknown',
        eventType: 'click',
        invalidFeature: true,
      })
    );
  });

  it('persists normally when key exists', async () => {
    (featureExists as jest.Mock).mockResolvedValue(true);
    await eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'login',
      metadata: {},
    });
    const call = (SystemEvent.create as jest.Mock).mock.calls[0][0];
    expect(call.featureKey).toBe('auth');
    expect(call.eventType).toBe('login');
    expect(call.invalidFeature).not.toBe(true);
  });
});
