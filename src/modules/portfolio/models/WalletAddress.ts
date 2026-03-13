import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletAddress extends Document {
  userId:    string;
  address:   string;
  chains:    string[];
  label?:    string;
  createdAt: Date;
  updatedAt: Date;
}

const walletAddressSchema = new Schema<IWalletAddress>(
  {
    userId:  { type: String, required: true, ref: 'User' },
    address: { type: String, required: true },
    chains:  { type: [String], required: true },
    label:   { type: String },
  },
  { timestamps: true }
);

walletAddressSchema.index({ userId: 1 });
walletAddressSchema.index({ address: 1 });
walletAddressSchema.index({ userId: 1, address: 1 }, { unique: true });

export const WalletAddress = mongoose.model<IWalletAddress>('WalletAddress', walletAddressSchema);
