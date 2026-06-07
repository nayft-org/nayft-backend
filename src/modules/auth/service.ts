import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { authRepository } from './repository';
import { SignupDto, LoginDto } from './dto';
import { IUser } from '../../types';
import { onboardingService } from '../onboarding/service';
import { eventService } from '../../core/event-system';
import { signAccessToken } from '../../middlewares/jwtPayload';
import { config } from '../../config/env';
import { validatePasswordForSignup } from './passwordValidation.service';
import { authMetrics } from '../../observability/authMetrics';
import { verificationService } from './verification/verification.service';
import { emailService } from '../email/email.service';

function buildTokenForUser(user: IUser): string {
  return signAccessToken({
    userId: user._id.toString(),
    preferredLanguage: user.preferredLanguage ?? null,
    emailVerified: user.emailVerified ?? false,
  });
}

async function issueVerificationForSignup(
  user: IUser,
  locale: string,
  ip?: string
): Promise<{ emailDeliveryStatus: 'queued' | 'skipped' | 'failed' }> {
  const issued = await verificationService.issueCode(user._id.toString(), 'email_signup', {
    email: user.email,
    username: user.username,
    locale,
    ip,
  });

  let emailDeliveryStatus: 'queued' | 'skipped' | 'failed' = 'skipped';
  if (config.shouldSendVerificationEmail) {
    await emailService.enqueueVerificationEmail({
      userId: user._id.toString(),
      purpose: 'email_signup',
      email: user.email,
      username: user.username,
      code: issued.code,
      locale,
      correlationId: issued.correlationId,
      issuedAt: new Date(),
    });
    emailDeliveryStatus = 'queued';
  }

  return { emailDeliveryStatus };
}

export const authService = {
  signup: async (
    signupDto: SignupDto,
    options: { locale?: string; ip?: string } = {}
  ): Promise<{ user: IUser; token: string; emailDeliveryStatus?: 'queued' | 'skipped' | 'failed' }> => {
    const { email, password, username } = signupDto;

    const passwordCheck = validatePasswordForSignup(password, { email, username });
    if (!passwordCheck.valid) {
      throw new Error('Password does not meet strength requirements');
    }

    // Check if user exists
    const existingUser = await authRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const existingUsername = await authRepository.findByUsername(username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await authRepository.create({
      email: email.toLowerCase(),
      passwordHash,
      username,
      emailVerified: false,
      emailVerifiedAt: null,
    });

    const migrated = await onboardingService.ensureCoinOnboardingMigrated(user);
    const userObj = migrated.toObject();
    delete (userObj as any).passwordHash;
    (userObj as IUser).emailVerified = false;

    const { emailDeliveryStatus } = await issueVerificationForSignup(
      userObj as IUser,
      options.locale || 'en',
      options.ip
    );

    const token = buildTokenForUser(userObj as IUser);

    authMetrics.passwordSignupAcceptedTotal += 1;

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'signup',
      userId: user._id.toString(),
      metadata: { passwordStrength: 'strong' },
    }).catch(() => {});

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'strong_password_created',
      userId: user._id.toString(),
      metadata: { scoreBand: passwordCheck.score >= 4 ? '4' : '3' },
    }).catch(() => {});

    return { user: userObj as IUser, token, emailDeliveryStatus };
  },

  verifyEmail: async (
    userId: string,
    code: string
  ): Promise<{ user: IUser; token: string }> => {
    const result = await verificationService.verifyCode(userId, 'email_signup', code);
    if (!result.ok) {
      if (result.reason === 'expired') {
        authMetrics.verificationExpiredTotal += 1;
        eventService.emitEvent({
          featureKey: 'auth',
          eventType: 'verification_expired',
          userId,
          metadata: { correlationId: result.correlationId || '' },
        }).catch(() => {});
        throw Object.assign(new Error('This verification code has expired'), {
          code: 'VERIFICATION_CODE_EXPIRED',
        });
      }
      if (result.reason === 'locked') {
        authMetrics.verificationLockedTotal += 1;
        throw Object.assign(new Error('Too many verification attempts'), {
          code: 'VERIFICATION_LOCKED',
        });
      }
      authMetrics.verificationFailedTotal += 1;
      eventService.emitEvent({
        featureKey: 'auth',
        eventType: 'verification_otp_failed',
        userId,
        metadata: {
          reason: result.reason,
          attemptNumber: result.attemptNumber ?? 0,
          correlationId: result.correlationId || '',
        },
      }).catch(() => {});
      throw Object.assign(new Error('Incorrect verification code'), {
        code: 'VERIFICATION_CODE_INVALID',
      });
    }

    const user = await authRepository.findById(userId);
    if (!user) throw new Error('User not found');

    const token = buildTokenForUser(user);
    authMetrics.verificationSuccessTotal += 1;

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'verification_success',
      userId,
      metadata: { correlationId: result.correlationId },
    }).catch(() => {});

    return { user, token };
  },

  resendVerification: async (
    userId: string,
    options: { locale?: string; ip?: string } = {}
  ): Promise<{ message: string; expiresAt: Date }> => {
    const user = await authRepository.findById(userId);
    if (!user) throw new Error('User not found');

    const result = await verificationService.resendCode(userId, 'email_signup', {
      email: user.email,
      username: user.username,
      locale: options.locale || user.preferredLanguage || 'en',
      ip: options.ip,
    });

    if (!result.ok) {
      if (result.reason === 'already_verified') {
        throw Object.assign(new Error('Email is already verified'), { code: 'ALREADY_VERIFIED' });
      }
      if (result.reason === 'cooldown') {
        throw Object.assign(
          new Error(`Resend available in ${result.cooldownSeconds ?? 60} seconds`),
          { code: 'VERIFICATION_RESEND_COOLDOWN' }
        );
      }
      authMetrics.verificationResendSpamTotal += 1;
      eventService.emitEvent({
        featureKey: 'auth',
        eventType: 'verification_resend_spam',
        userId,
        metadata: { reason: result.reason },
      }).catch(() => {});
      throw Object.assign(new Error('Resend limit exceeded'), { code: 'VERIFICATION_RESEND_LIMIT' });
    }

    if (config.shouldSendVerificationEmail) {
      await emailService.enqueueVerificationEmail({
        userId,
        purpose: 'email_signup',
        email: user.email,
        username: user.username,
        code: result.code,
        locale: options.locale || user.preferredLanguage || 'en',
        correlationId: result.correlationId,
        issuedAt: new Date(),
      });
    }

    authMetrics.verificationResendTotal += 1;
    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'verification_resend',
      userId,
      metadata: { attemptNumber: result.attemptNumber, correlationId: result.correlationId },
    }).catch(() => {});

    return { message: 'A new verification code has been sent', expiresAt: result.expiresAt };
  },

  getVerificationStatus: async (userId: string) => {
    return verificationService.getVerificationStatus(userId, 'email_signup');
  },

  changePassword: async (
    userId: string,
    body: { currentPassword: string; newPassword: string }
  ): Promise<void> => {
    const user = await authRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const passwordCheck = validatePasswordForSignup(body.newPassword, {
      email: user.email,
      username: user.username,
    });
    if (!passwordCheck.valid) {
      throw new Error('New password does not meet strength requirements');
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await authRepository.updatePassword(userId, passwordHash);

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'strong_password_created',
      userId,
      metadata: { scoreBand: passwordCheck.score >= 4 ? '4' : '3' },
    }).catch(() => {});
  },

  resetPassword: async (_body: {
    token: string;
    email: string;
    newPassword: string;
  }): Promise<void> => {
    throw new Error('Password reset is not yet available');
  },

  login: async (loginDto: LoginDto): Promise<{ user: IUser; token: string }> => {
    const { email, password } = loginDto;

    // Find user
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    const migrated = await onboardingService.ensureCoinOnboardingMigrated(user);
    const userObj = migrated.toObject();
    delete (userObj as any).passwordHash;

    const token = buildTokenForUser(userObj as IUser);

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'login',
      userId: user._id.toString(),
      metadata: {},
    }).catch(() => {});

    return { user: userObj as IUser, token };
  },

  getMe: async (userId: string): Promise<IUser> => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return onboardingService.ensureCoinOnboardingMigrated(user);
  },

  /** New JWT after preference update — embeds latest preferredLanguage without DB read per request. */
  issueAccessTokenForUser: async (userId: string): Promise<string> => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const u = user as IUser;
    return buildTokenForUser(u);
  },

  googleSignIn: async (idToken: string): Promise<{ user: IUser; token: string }> => {
    const client = new OAuth2Client(config.googleWebClientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.googleWebClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Invalid Google token: missing email');
    }

    const email = payload.email.toLowerCase();
    let user = await authRepository.findByEmail(email);

    if (!user) {
      // Derive a username from the Google display name or email prefix.
      const rawBase = (payload.name || email.split('@')[0]).trim();
      const baseUsername = rawBase
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/, '')
        .slice(0, 20) || 'user';

      let username = baseUsername;
      let existing = await authRepository.findByUsername(username);
      let attempts = 0;
      while (existing && attempts < 5) {
        username = `${baseUsername}_${Math.random().toString(36).slice(2, 6)}`;
        existing = await authRepository.findByUsername(username);
        attempts++;
      }

      // Sentinel hash: a valid bcrypt hash whose pre-image is discarded,
      // so password-login for Google-only accounts always fails safely.
      const sentinelHash = await bcrypt.hash(randomUUID(), 10);

      user = await authRepository.create({
        email,
        passwordHash: sentinelHash,
        username,
        emailVerified: payload.email_verified === true,
        emailVerifiedAt: payload.email_verified === true ? new Date() : null,
      });
    } else if (payload.email_verified === true && !user.emailVerified) {
      await authRepository.markEmailVerified(user._id.toString());
      user = (await authRepository.findById(user._id.toString()))!;
    }

    const migrated = await onboardingService.ensureCoinOnboardingMigrated(user);
    const userObj = migrated.toObject();
    delete (userObj as any).passwordHash;

    const token = buildTokenForUser(userObj as IUser);

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'google_login',
      userId: user._id.toString(),
      metadata: {},
    }).catch(() => {});

    return { user: userObj as IUser, token };
  },
};

