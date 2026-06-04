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

export const authService = {
  signup: async (signupDto: SignupDto): Promise<{ user: IUser; token: string }> => {
    const { email, password, username } = signupDto;

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

    // Create user
    const user = await authRepository.create({
      email: email.toLowerCase(),
      passwordHash,
      username,
    });

    const migrated = await onboardingService.ensureCoinOnboardingMigrated(user);
    const userObj = migrated.toObject();
    delete (userObj as any).passwordHash;

    const token = signAccessToken({
      userId: user._id.toString(),
      preferredLanguage: (userObj as IUser).preferredLanguage ?? null,
    });

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'signup',
      userId: user._id.toString(),
      metadata: {},
    }).catch(() => {});

    return { user: userObj as IUser, token };
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

    const token = signAccessToken({
      userId: user._id.toString(),
      preferredLanguage: (userObj as IUser).preferredLanguage ?? null,
    });

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
    return signAccessToken({
      userId: user._id.toString(),
      preferredLanguage: u.preferredLanguage ?? null,
    });
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

      user = await authRepository.create({ email, passwordHash: sentinelHash, username });
    }

    const migrated = await onboardingService.ensureCoinOnboardingMigrated(user);
    const userObj = migrated.toObject();
    delete (userObj as any).passwordHash;

    const token = signAccessToken({
      userId: user._id.toString(),
      preferredLanguage: (userObj as IUser).preferredLanguage ?? null,
    });

    eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'google_login',
      userId: user._id.toString(),
      metadata: {},
    }).catch(() => {});

    return { user: userObj as IUser, token };
  },
};

