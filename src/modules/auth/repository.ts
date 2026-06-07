import { User } from '../user/model';
import { IUser } from '../../types';

export const authRepository = {
  findByEmail: async (email: string): Promise<IUser | null> => {
    return User.findOne({ email: email.toLowerCase() });
  },

  findByUsername: async (username: string): Promise<IUser | null> => {
    return User.findOne({ username });
  },

  findById: async (id: string): Promise<IUser | null> => {
    return User.findById(id).select('-passwordHash');
  },

  findByIdWithPassword: async (id: string): Promise<IUser | null> => {
    return User.findById(id);
  },

  updatePassword: async (id: string, passwordHash: string): Promise<void> => {
    await User.findByIdAndUpdate(id, { passwordHash });
  },

  findByIds: async (ids: string[]): Promise<IUser[]> => {
    if (ids.length === 0) return [];
    return User.find({ _id: { $in: ids } }).select('-passwordHash');
  },

  create: async (userData: {
    email: string;
    passwordHash: string;
    username: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date | null;
  }): Promise<IUser> => {
    const user = new User(userData);
    return user.save();
  },

  markEmailVerified: async (id: string): Promise<void> => {
    await User.findByIdAndUpdate(id, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
  },

  updateVerificationSent: async (id: string): Promise<void> => {
    await User.findByIdAndUpdate(id, { lastVerificationSentAt: new Date() });
  },

  grandfatherExistingUsers: async (): Promise<number> => {
    const result = await User.updateMany(
      { $or: [{ emailVerified: { $exists: false } }, { emailVerified: null }] },
      { $set: { emailVerified: true, emailVerifiedAt: new Date() } }
    );
    return result.modifiedCount;
  },
};
