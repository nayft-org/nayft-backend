export { riskEngine } from './services/riskEngine.service';
export { computeNewsFactor, loadLatestCoinSentiment } from './services/newsFactor.service';
export { applyNewsFactorGating } from './services/newsFactorLogic';
export type { NewsFactorResult, NewsFactorFlag } from './types';
export { riskConfig } from './config/riskConfig';
