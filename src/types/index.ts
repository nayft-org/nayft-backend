import { Request } from 'express';
import { Document } from 'mongoose';
export type LanguageSource = 'header' | 'query' | 'jwt' | 'default';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  username: string;
  followingCoins: string[];
  rewardPoints: number;
  preferredLanguage?: string | null;
  createdAt: Date;
}

export interface ICoin extends Document {
  coinId: string;
  symbol: string;
  name: string;
  rank: number;
  price: number;
  percentChange24h: number;
  lastUpdated: Date;
  symbolLower?: string;
  nameLower?: string;
}

export interface INews extends Document {
  title: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  relatedCoins: string[];
  publishedAt: Date;
}

export interface IWishlist extends Document {
  userId: string;
  coinId: string;
  createdAt: Date;
}

export interface IRewardsActivity extends Document {
  userId: string;
  action: string;
  points: number;
  createdAt: Date;
}

export interface AuthRequest extends Request {
  userId?: string;
  user?: IUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string | null;
}

export interface CoinMarketCapResponse {
  status: {
    timestamp: string;
    error_code: number;
    error_message: string | null;
    elapsed: number;
    credit_count: number;
  };
  data: any;
}

export interface CoindeskNewsDto {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  relatedCoins: string[];
  publishedAt: Date;
}