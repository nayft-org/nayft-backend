import mongoose, { Schema, Document } from 'mongoose';

export type ExchangeProvider = 'coindcx';
export type ExchangeConnectionStatus =
  | 'active'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'error'
  | 'requires_reauth';
export type ExchangeSyncPhase = 'initial_backfill' | 'live';
export type ExchangeFreshnessState = 'fresh' | 'stale' | 'syncing';

export interface IExchangeConnection extends Document {
  userId: string;
  provider: ExchangeProvider;
  label?: string;
  maskedApiKey: string;
  encryptedSecretBlob: string;
  encryptionKeyId: string;
  secretVersion: number;
  status: ExchangeConnectionStatus;
  syncPhase: ExchangeSyncPhase;
  balancesFreshness: ExchangeFreshnessState;
  tradesFreshness: ExchangeFreshnessState;
  balancesStaleReason?: string;
  tradesStaleReason?: string;
  lastBalancesSyncAt?: Date;
  lastTradesSyncAt?: Date;
  balancesLastError?: string;
  tradesLastError?: string;
  balancesAttemptAt?: Date;
  tradesAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastTradeId?: string;
  lastTradeTimestamp?: number;
  backfillCursor?: string;
  backfillStartedAt?: Date;
  pollingIntervalMs: number;
  nextPollAt: Date;
  lastReconcileAt?: Date;
  reconcileChecksum?: string;
  circuitOpenUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const exchangeConnectionSchema = new Schema<IExchangeConnection>(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ['coindcx'], default: 'coindcx' },
    label: { type: String },
    maskedApiKey: { type: String, required: true },
    encryptedSecretBlob: { type: String, required: true },
    encryptionKeyId: { type: String, required: true },
    secretVersion: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['active', 'invalid_credentials', 'rate_limited', 'error', 'requires_reauth'],
      default: 'active',
    },
    syncPhase: {
      type: String,
      enum: ['initial_backfill', 'live'],
      default: 'initial_backfill',
    },
    balancesFreshness: {
      type: String,
      enum: ['fresh', 'stale', 'syncing'],
      default: 'stale',
    },
    tradesFreshness: {
      type: String,
      enum: ['fresh', 'stale', 'syncing'],
      default: 'stale',
    },
    balancesStaleReason: { type: String },
    tradesStaleReason: { type: String },
    lastBalancesSyncAt: { type: Date },
    lastTradesSyncAt: { type: Date },
    balancesLastError: { type: String },
    tradesLastError: { type: String },
    balancesAttemptAt: { type: Date },
    tradesAttemptAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastErrorAt: { type: Date },
    lastErrorCode: { type: String },
    lastErrorMessage: { type: String },
    lastTradeId: { type: String },
    lastTradeTimestamp: { type: Number },
    backfillCursor: { type: String },
    backfillStartedAt: { type: Date },
    pollingIntervalMs: { type: Number, default: 90_000 },
    nextPollAt: { type: Date, required: true, index: true },
    lastReconcileAt: { type: Date },
    reconcileChecksum: { type: String },
    circuitOpenUntil: { type: Date },
  },
  { timestamps: true }
);

exchangeConnectionSchema.index({ userId: 1, provider: 1 });
exchangeConnectionSchema.index({ status: 1, nextPollAt: 1 });

export const ExchangeConnection = mongoose.model<IExchangeConnection>(
  'ExchangeConnection',
  exchangeConnectionSchema
);
