import mongoose, { Schema, Document } from 'mongoose';

export interface HoldingPositionFields {
  name:     string;
  symbol:   string;
  quantity: number;
  value:    number;
  chain:    string;
  source?:  'wallet' | 'exchange';
  venue?:   string;
  sourceConnectionId?: string;
  schemaVersion?: number;
}

export interface IHolding extends Document {
  userId:            string;
  totalValue:        number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions:         HoldingPositionFields[];
  syncedAt:          Date;
  createdAt:         Date;
  updatedAt:         Date;
}

const holdingPositionSchema = new Schema<HoldingPositionFields>(
  {
    name:     { type: String, required: true },
    symbol:   { type: String, required: true },
    quantity: { type: Number, required: true },
    value:    { type: Number, required: true },
    chain:    { type: String, required: true },
    source:   { type: String, enum: ['wallet', 'exchange'] },
    venue:    { type: String },
    sourceConnectionId: { type: String },
    schemaVersion: { type: Number },
  },
  { _id: false }
);

const holdingSchema = new Schema<IHolding>(
  {
    userId:            { type: String, required: true, unique: true },
    totalValue:        { type: Number, default: 0 },
    absoluteChange24h: { type: Number, default: 0 },
    relativeChange24h: { type: Number, default: 0 },
    positions:         { type: [holdingPositionSchema], default: [] },
    syncedAt:          { type: Date, required: true },
  },
  { timestamps: true }
);

holdingSchema.index({ userId: 1 }, { unique: true });

export const Holding = mongoose.model<IHolding>('Holding', holdingSchema);
