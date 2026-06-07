import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const authEmailVerificationFeature: FeatureConfig = {
  key: 'auth_email_verification',
  name: 'Email Verification',
  module: 'auth',
  description: 'Email OTP verification on signup',
  category: 'free',
  controllable: true,
  critical: false,
};

export const authEmailVerificationEnforceFeature: FeatureConfig = {
  key: 'auth_email_verification_enforce',
  name: 'Email Verification Enforcement',
  module: 'auth',
  description: 'Block unverified users from protected routes',
  category: 'free',
  controllable: true,
  critical: false,
};
