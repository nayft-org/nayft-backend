import mongoose, { Schema, Document } from 'mongoose';

export interface IPiCatalogSnapshot extends Document {
  catalogVersion: number;
  taxonomyVersion: string;
  categories: Array<{ categoryId: string; name: string }>;
  createdAt: Date;
}

const piCatalogSnapshotSchema = new Schema<IPiCatalogSnapshot>(
  {
    catalogVersion: { type: Number, required: true, unique: true },
    taxonomyVersion: { type: String, required: true },
    categories: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'pi_catalog_snapshots' }
);

export const PiCatalogSnapshot = mongoose.model<IPiCatalogSnapshot>(
  'PiCatalogSnapshot',
  piCatalogSnapshotSchema
);
