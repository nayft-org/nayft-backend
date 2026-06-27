import { registerFeature } from '../../core/feature-system/featureRegistry';
import {
  featureConfig,
  piShadowFeatureConfig,
  piContextFeatureConfig,
  piRealtimeFeatureConfig,
  piNormalizedFeatureConfig,
  piEnginesFeatureConfig,
  piHealthFeatureConfig,
  piInsightsFeatureConfig,
  piFeedIntelFeatureConfig,
  piCategoryGovernanceFeatureConfig,
  piConfidenceFeatureConfig,
  piExplainabilityFeatureConfig,
  piBenchmarkFeatureConfig,
  piOpportunityFeatureConfig,
  piGoalProfilesFeatureConfig,
  piNarrativeIntelFeatureConfig,
  piHistoricalFeatureConfig,
  piDomainEventsFeatureConfig,
  piFacadeFeatureConfig,
  piFormulaExperimentsFeatureConfig,
  piQualityMonitorFeatureConfig,
  piAiAnalystFeatureConfig,
  piMultiOwnerFeatureConfig,
  piArchetypesFeatureConfig,
  piCostGovernanceFeatureConfig,
  piRuleEngineFeatureConfig,
  piSimulationFeatureConfig,
} from './featureConfig';

export async function bootstrapPiFeatures(): Promise<void> {
  await registerFeature(featureConfig);
  await registerFeature(piShadowFeatureConfig);
  await registerFeature(piContextFeatureConfig);
  await registerFeature(piRealtimeFeatureConfig);
  await registerFeature(piNormalizedFeatureConfig);
  await registerFeature(piEnginesFeatureConfig);
  await registerFeature(piHealthFeatureConfig);
  await registerFeature(piInsightsFeatureConfig);
  await registerFeature(piFeedIntelFeatureConfig);
  await registerFeature(piCategoryGovernanceFeatureConfig);
  await registerFeature(piConfidenceFeatureConfig);
  await registerFeature(piExplainabilityFeatureConfig);
  await registerFeature(piBenchmarkFeatureConfig);
  await registerFeature(piOpportunityFeatureConfig);
  await registerFeature(piGoalProfilesFeatureConfig);
  await registerFeature(piNarrativeIntelFeatureConfig);
  await registerFeature(piHistoricalFeatureConfig);
  await registerFeature(piDomainEventsFeatureConfig);
  await registerFeature(piFacadeFeatureConfig);
  await registerFeature(piFormulaExperimentsFeatureConfig);
  await registerFeature(piQualityMonitorFeatureConfig);
  await registerFeature(piAiAnalystFeatureConfig);
  await registerFeature(piMultiOwnerFeatureConfig);
  await registerFeature(piArchetypesFeatureConfig);
  await registerFeature(piCostGovernanceFeatureConfig);
  await registerFeature(piRuleEngineFeatureConfig);
  await registerFeature(piSimulationFeatureConfig);
}
