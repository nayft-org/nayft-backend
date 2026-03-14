import mongoose, { Schema, Document } from 'mongoose';

export type WalletEventType =
  | 'token_transfer'
  | 'native_transfer'
  | 'contract_interaction'
  | 'multi_chain_activity';

/** Transaction status from eth_getTransactionReceipt (status: 1=success, 0=failed) */
export type TxStatus = 'success' | 'failed' | 'pending';

/** Activity fields from Alchemy ADDRESS_ACTIVITY webhook payload */
export interface WalletEventActivityFields {
  txHash:         string;
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
}

export interface IWalletEvent extends Document {
  userId:         string;
  address:        string;
  chain:          string;
  type:           WalletEventType;
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
    txHash:         { type: String, required: true },
    blockNum:       { type: String },
    asset:          { type: String },
    value:          { type: Number },
    fromAddress:    { type: String },
    toAddress:      { type: String },
    tokenContract:  { type: String },
    tokenDecimals:  { type: String },
    txStatus:       { type: String, enum: ['success', 'failed', 'pending'] },
    explorerUrl:    { type: String },
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
      enum:    ['token_transfer', 'native_transfer', 'contract_interaction', 'multi_chain_activity'],
      default: 'token_transfer',
    },
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
walletEventSchema.index({ address: 1, aggregatedAt: -1 });

export const WalletEvent = mongoose.model<IWalletEvent>('WalletEvent', walletEventSchema);
