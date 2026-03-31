import mongoose, { Schema } from 'mongoose';

export interface INewsArticleSource {
  sourceId?: string;
  key: string;
  name: string;
  imageUrl?: string;
  lang?: string;
}

export interface INewsArticleAuthor {
  name: string;
  slug: string;
}

export interface INewsArticleCategory {
  id?: string;
  key: string;
  name: string;
}

export interface INewsArticleCoin {
  symbol: string;
  name: string;
}

export interface INewsArticleReactions {
  appreciate: number;
  insightful: number;
  bullish: number;
  risk: number;
  deepDive: number;
  debatable: number;
  total: number;
}

export interface INewsArticleMetrics {
  views: number;
  likes: number;
  saves: number;
  comments: number;
  reactions: INewsArticleReactions;
}

export interface INewsArticle {
  externalId: string;
  guid: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  sourceUrl: string;
  publishedAt: Date;
  source: INewsArticleSource;
  author?: INewsArticleAuthor;
  categories: INewsArticleCategory[];
  coins: INewsArticleCoin[];
  sentiment?: string;
  status: string;
  metrics: INewsArticleMetrics;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<INewsArticleSource>(
  {
    sourceId: { type: String },
    key: { type: String, required: true },
    name: { type: String, required: true },
    imageUrl: { type: String },
    lang: { type: String },
  },
  { _id: false }
);

const authorSchema = new Schema<INewsArticleAuthor>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
  },
  { _id: false }
);

const categorySchema = new Schema<INewsArticleCategory>(
  {
    id: { type: String },
    key: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const coinSchema = new Schema<INewsArticleCoin>(
  {
    symbol: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const reactionsSchema = new Schema<INewsArticleReactions>(
  {
    appreciate: { type: Number, default: 0 },
    insightful: { type: Number, default: 0 },
    bullish: { type: Number, default: 0 },
    risk: { type: Number, default: 0 },
    deepDive: { type: Number, default: 0 },
    debatable: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const metricsSchema = new Schema<INewsArticleMetrics>(
  {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    reactions: {
      type: reactionsSchema,
      default: () => ({
        appreciate: 0,
        insightful: 0,
        bullish: 0,
        risk: 0,
        deepDive: 0,
        debatable: 0,
        total: 0,
      }),
    },
  },
  { _id: false }
);

const newsArticleSchema = new Schema<INewsArticle>(
  {
    externalId: { type: String, required: true, unique: true },
    guid: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String },
    imageUrl: { type: String },
    sourceUrl: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    source: { type: sourceSchema, required: true },
    author: { type: authorSchema },
    categories: { type: [categorySchema], default: [] },
    coins: { type: [coinSchema], default: [] },
    sentiment: { type: String, default: 'neutral' },
    status: { type: String, default: 'active' },
    metrics: {
      type: metricsSchema,
      default: () => ({
        views: 0,
        likes: 0,
        saves: 0,
        comments: 0,
        reactions: {
          appreciate: 0,
          insightful: 0,
          bullish: 0,
          risk: 0,
          deepDive: 0,
          debatable: 0,
          total: 0,
        },
      }),
    },
  },
  { timestamps: true }
);

newsArticleSchema.index({ publishedAt: -1 });
newsArticleSchema.index({ status: 1, publishedAt: -1 });
newsArticleSchema.index({ 'coins.symbol': 1 });
newsArticleSchema.index({ 'source.key': 1 });
newsArticleSchema.index({ status: 1 });
newsArticleSchema.index({ sentiment: 1 });

export const NewsArticle = mongoose.model<INewsArticle>('NewsArticle', newsArticleSchema);
