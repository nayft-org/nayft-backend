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

  create: async (userData: {
    email: string;
    passwordHash: string;
    username: string;
  }): Promise<IUser> => {
    const user = new User(userData);
    return user.save();
  },
};

