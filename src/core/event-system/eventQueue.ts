import type { EmitEventPayload } from './event.types';

export interface IEventQueue {
  push(payload: EmitEventPayload): Promise<void>;
  pushToDlq(payload: EmitEventPayload): Promise<void>;
}
