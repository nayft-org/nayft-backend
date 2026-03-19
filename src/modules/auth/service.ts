import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { authRepository } from './repository';
import { SignupDto, LoginDto } from './dto';
import { IUser } from '../../types';
import { eventService } from '../../core/event-system';

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

    // Generate token
    const token = jwt.sign({ userId: user._id.toString() }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    const userObj = user.toObject();
    delete (userObj as any).passwordHash;

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

    // Generate token
    const token = jwt.sign({ userId: user._id.toString() }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    const userObj = user.toObject();
    delete (userObj as any).passwordHash;

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
};

