import { config } from '../../config/env';
import type { IExchangeConnection } from '../../modules/portfolio/models/ExchangeConnection';
import { CoindcxApiError } from './coindcxErrors';

export function isCircuitOpen(conn: IExchangeConnection): boolean {
  if (!conn.circuitOpenUntil) return false;
  return conn.circuitOpenUntil.getTime() > Date.now();
}

export function failureOpensCircuit(err: unknown): boolean {
  return err instanceof CoindcxApiError && (err.code === 'provider_error' || err.code === 'network');
}

export function nextCircuitOpenUntil(): Date {
  return new Date(Date.now() + config.exchangeCircuitOpenMs);
}
