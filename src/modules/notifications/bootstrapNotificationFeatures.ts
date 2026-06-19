import { registerFeature } from '../../core/feature-system/featureRegistry';

export const notificationsPushFeatureConfig = {
  key: 'notifications_push',
  name: 'Notification Push',
  module: 'notifications',
  description: 'Device push delivery via Expo',
  category: 'free' as const,
  controllable: true,
};

export const notificationsMarketAlertsFeatureConfig = {
  key: 'notifications_market_alerts',
  name: 'Market Alert Notifications',
  module: 'notifications',
  description: 'Price spike notifications for followed coins',
  category: 'free' as const,
  controllable: true,
};

export const notificationsNewsAlertsFeatureConfig = {
  key: 'notifications_news_alerts',
  name: 'News Digest Notifications',
  module: 'notifications',
  description: 'Hourly news digest for followed assets',
  category: 'free' as const,
  controllable: true,
};

export const notificationsPortfolioAlertsFeatureConfig = {
  key: 'notifications_portfolio_alerts',
  name: 'Portfolio Alert Notifications',
  module: 'notifications',
  description: 'Portfolio 24h change threshold notifications',
  category: 'free' as const,
  controllable: true,
};

export async function bootstrapNotificationFeatures(): Promise<void> {
  await registerFeature(notificationsPushFeatureConfig);
  await registerFeature(notificationsMarketAlertsFeatureConfig);
  await registerFeature(notificationsNewsAlertsFeatureConfig);
  await registerFeature(notificationsPortfolioAlertsFeatureConfig);
}
