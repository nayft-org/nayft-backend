import cron from 'node-cron';
import { sentimentConfig } from '../config/sentimentConfig';
import { runCoinSentimentAggregation } from '../services/coinSentimentAggregator.service';

export function startCoinSentimentScheduler(): void {
  if (!sentimentConfig.enrichmentEnabled) return;

  cron.schedule(sentimentConfig.aggregationCron, () => {
    runCoinSentimentAggregation().catch((err) =>
      console.error('[CoinSentimentAggregator]', err)
    );
  });
  console.log(`[CoinSentimentAggregator] scheduled: ${sentimentConfig.aggregationCron}`);
}
