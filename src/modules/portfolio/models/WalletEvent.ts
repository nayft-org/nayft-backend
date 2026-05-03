import mongoose, { Schema, Document } from 'mongoose';

export type WalletEventType =
  | 'token_transfer'
  | 'native_transfer'
  | 'contract_interaction'
  | 'multi_chain_activity'
  | 'exchange_trade';

export type WalletEventSourceType = 'wallet' | 'exchange';

/** Transaction status from eth_getTransactionReceipt (status: 1=success, 0=failed) */
export type TxStatus = 'success' | 'failed' | 'pending';

/** Activity fields from Alchemy ADDRESS_ACTIVITY webhook payload */
export interface WalletEventActivityFields {
  /** On-chain hash; optional for exchange-sourced events (synthetic ref may be used). */
  txHash?:        string;
  blockNum?:     string;
  asset?:        string;
  value?:        number;
  fromAddress?:  string;
  toAddress?:    string;
  tokenContract?: string;
  tokenDecimals?: string;
  /** From eth_getTransactionReceipt: 1=success, 0=failed, null=pending */
  txStatus?:     TxStatus | null;
  /** Block explorer URL for "View on Etherscan" */
  explorerUrl?:  string;
  /** Exchange-native trade / order id when distinct from txHash */
  tradeId?:       string;
  externalRef?:  string;
}

export interface IWalletEvent extends Document {
  userId:         string;
  address:        string;
  chain:          string;
  type:           WalletEventType;
  sourceType?:    WalletEventSourceType;
  /** ExchangeConnection _id string when sourceType === 'exchange' */
  sourceId?:      string;
  venue?:         string;
  providerTradeId?: string;
  providerTimestamp?: Date;
  schemaVersion?: number;
  rawEventCount:  number;
  /** Unique tx hashes in the batch */
  transactionCount?: number;
  /** Human-readable event descriptions, e.g. ["swap USDC -> POL", "transfer 100 USDC"] */
  eventSummaries?:  string[];
  enrichedData:   Record<string, unknown> | null;
  aggregatedAt:   Date;
  /** Core activity data from webhook (txHash, asset, value, etc.) — optional for legacy docs */
  activity?:      WalletEventActivityFields;
  createdAt:      Date;
  updatedAt:      Date;
}

const activitySchema = new Schema<WalletEventActivityFields>(
  {
    txHash:         { type: String },
    blockNum:       { type: String },
    asset:          { type: String },
    value:          { type: Number },
    fromAddress:    { type: String },
    toAddress:      { type: String },
    tokenContract:  { type: String },
    tokenDecimals:  { type: String },
    txStatus:       { type: String, enum: ['success', 'failed', 'pending'] },
    explorerUrl:    { type: String },
    tradeId:        { type: String },
    externalRef:    { type: String },
  },
  { _id: false }
);

const walletEventSchema = new Schema<IWalletEvent>(
  {
    userId:        { type: String, required: true, ref: 'User' },
    address:       { type: String, required: true },
    chain:         { type: String, required: true },
    type:          {
      type:    String,
      enum:    [
        'token_transfer',
        'native_transfer',
        'contract_interaction',
        'multi_chain_activity',
        'exchange_trade',
      ],
      default: 'token_transfer',
    },
    sourceType:    { type: String, enum: ['wallet', 'exchange'], default: 'wallet' },
    sourceId:      { type: String },
    venue:         { type: String },
    providerTradeId: { type: String },
    providerTimestamp: { type: Date },
    schemaVersion: { type: Number },
    rawEventCount:     { type: Number, default: 1 },
    transactionCount:  { type: Number },
    eventSummaries:    { type: [String], default: [] },
    enrichedData:      { type: Schema.Types.Mixed, default: null },
    aggregatedAt:  { type: Date, default: Date.now },
    activity:      { type: activitySchema },
  },
  { timestamps: true }
);

walletEventSchema.index({ userId: 1, aggregatedAt: -1 });
walletEventSchema.index({ userId: 1, sourceType: 1, aggregatedAt: -1 });
walletEventSchema.index({ address: 1, aggregatedAt: -1 });
walletEventSchema.index(
  { userId: 1, venue: 1, providerTradeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerTradeId: { $type: 'string', $gt: '' },
      venue: { $type: 'string', $gt: '' },
    },
  }
);

export const WalletEvent = mongoose.model<IWalletEvent>('WalletEvent', walletEventSchema);
