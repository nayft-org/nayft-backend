import { featureService } from '../../core/feature-system/feature.service';

let cached: { value: boolean; expires: number } | null = null;
let enforceCached: { value: boolean; expires: number } | null = null;
const CACHE_MS = 30_000;

export async function isEmailVerificationEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;
  let active = false;
  try {
    active = await featureService.isActive('auth_email_verification');
  } catch {
    active = false;
  }
  cached = { value: active, expires: now + CACHE_MS };
  return active;
}

export async function isEmailVerificationEnforced(): Promise<boolean> {
  const now = Date.now();
  if (enforceCached && enforceCached.expires > now) return enforceCached.value;
  let active = false;
  try {
    const enabled = await isEmailVerificationEnabled();
    if (!enabled) {
      enforceCached = { value: false, expires: now + CACHE_MS };
      return false;
    }
    active = await featureService.isActive('auth_email_verification_enforce');
  } catch {
    active = false;
  }
  enforceCached = { value: active, expires: now + CACHE_MS };
  return active;
}
