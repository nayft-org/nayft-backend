import mongoose, { Schema, Document } from 'mongoose';

export type WalletEventType =
  | 'token_transfer'
  | 'native_transfer'
  | 'contract_interaction'
  | 'multi_chain_activity';

export interface IWalletEvent extends Document {
  userId:         string;
  address:        string;
  chain:          string;
  type:           WalletEventType;
  rawEventCount:  number;
  enrichedData:   Record<string, unknown> | null;
  aggregatedAt:   Date;
  createdAt:      Date;
  updatedAt:      Date;
}

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
    rawEventCount: { type: Number, default: 1 },
    enrichedData:  { type: Schema.Types.Mixed, default: null },
    aggregatedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true }
);

walletEventSchema.index({ userId: 1, aggregatedAt: -1 });
walletEventSchema.index({ address: 1, aggregatedAt: -1 });

export const WalletEvent = mongoose.model<IWalletEvent>('WalletEvent', walletEventSchema);
