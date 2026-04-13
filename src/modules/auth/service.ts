import bcrypt from 'bcryptjs';
import { authRepository } from './repository';
import { SignupDto, LoginDto } from './dto';
import { IUser } from '../../types';
import { eventService } from '../../core/event-system';
import { signAccessToken } from '../../middlewares/jwtPayload';

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

    const userObj = user.toObject();
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

    const userObj = user.toObject();
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
    return user;
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
};

