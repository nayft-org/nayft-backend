import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

const PI_MODULE = 'portfolio-intelligence';

export const featureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_foundation',
  name: 'Portfolio Intelligence Foundation',
  module: PI_MODULE,
  description: 'Async portfolio normalization, snapshots, and intelligence infrastructure',
  category: 'premium',
  controllable: true,
};

export const piShadowFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_shadow',
  name: 'Portfolio Intelligence Shadow Mode',
  module: PI_MODULE,
  description: 'Compute PI state to shadow prefix without serving',
  category: 'premium',
  controllable: true,
};

export const piContextFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_context_api',
  name: 'Portfolio Intelligence Context API',
  module: PI_MODULE,
  description: 'Expose held-symbol context for feed personalization',
  category: 'premium',
  controllable: true,
};

export const piRealtimeFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_realtime',
  name: 'Portfolio Intelligence Realtime Fanout',
  module: PI_MODULE,
  description: 'Redis-backed portfolio WS fanout across replicas',
  category: 'premium',
  controllable: true,
};

export const piNormalizedFeatureConfig: FeatureConfig = {
  key: 'portfolio_normalized_positions',
  name: 'Portfolio Normalized Positions Read',
  module: PI_MODULE,
  description: 'Serve holdings from normalized position store',
  category: 'premium',
  controllable: true,
};

export const piEnginesFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_engines',
  name: 'Portfolio Intelligence Engines',
  module: PI_MODULE,
  description: 'Deterministic portfolio analytics engines',
  category: 'premium',
  controllable: true,
};

export const piHealthFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_health_score',
  name: 'Portfolio Health Score',
  module: PI_MODULE,
  description: 'Composite portfolio health score',
  category: 'premium',
  controllable: true,
};

export const piInsightsFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_insights',
  name: 'Portfolio Intelligence Insights',
  module: PI_MODULE,
  description: 'Rule-based portfolio insights',
  category: 'premium',
  controllable: true,
};

export const piFeedIntelFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_feed_intel',
  name: 'Portfolio Feed Intelligence',
  module: PI_MODULE,
  description: 'Narrative and conviction vectors for feed ranking',
  category: 'premium',
  controllable: true,
};

export const piCategoryGovernanceFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_category_governance',
  name: 'Portfolio Category Governance',
  module: PI_MODULE,
  description: 'Admin category governance, overrides, and audit trail',
  category: 'premium',
  controllable: true,
};

export const piConfidenceFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_confidence',
  name: 'Portfolio Confidence Engine',
  module: PI_MODULE,
  description: 'Portfolio analytics confidence scoring and propagation',
  category: 'premium',
  controllable: true,
};

export const piExplainabilityFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_explainability',
  name: 'Portfolio Explainability',
  module: PI_MODULE,
  description: 'Engine explainability bundles for UI and AI analyst',
  category: 'premium',
  controllable: true,
};

export const piBenchmarkFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_benchmark',
  name: 'Portfolio Benchmark Engine',
  module: PI_MODULE,
  description: 'Anonymous cohort percentile benchmarks',
  category: 'premium',
  controllable: true,
};

export const piOpportunityFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_opportunity',
  name: 'Portfolio Opportunity Detection',
  module: PI_MODULE,
  description: 'Goal-adapted portfolio opportunity detection',
  category: 'premium',
  controllable: true,
};

export const piGoalProfilesFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_goal_profiles',
  name: 'Portfolio Goal Profiles',
  module: PI_MODULE,
  description: 'User goal profiles for adapted health and opportunities',
  category: 'premium',
  controllable: true,
};

export const piNarrativeIntelFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_narrative_intel',
  name: 'Narrative Intelligence Layer',
  module: PI_MODULE,
  description: 'Market narrative momentum and conviction tracking',
  category: 'premium',
  controllable: true,
};

export const piHistoricalFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_historical',
  name: 'Historical Intelligence Timelines',
  module: PI_MODULE,
  description: 'Identity, risk, narrative, and health evolution timelines',
  category: 'premium',
  controllable: true,
};

export const piDomainEventsFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_domain_events',
  name: 'Portfolio Intelligence Domain Events',
  module: PI_MODULE,
  description: 'Emit domain events on meaningful analytics deltas',
  category: 'premium',
  controllable: true,
};

export const piFacadeFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_facade',
  name: 'Portfolio Intelligence Facade',
  module: PI_MODULE,
  description: 'Unified read layer and feed intelligence contract',
  category: 'premium',
  controllable: true,
};

export const piFormulaExperimentsFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_formula_experiments',
  name: 'PI Formula Experiments',
  module: PI_MODULE,
  description: 'A/B formula bundle experimentation framework',
  category: 'premium',
  controllable: true,
};

export const piQualityMonitorFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_quality_monitor',
  name: 'PI Quality Monitor',
  module: PI_MODULE,
  description: 'Intelligence quality distribution monitoring',
  category: 'premium',
  controllable: true,
};

export const piAiAnalystFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_ai_analyst',
  name: 'PI AI Analyst',
  module: PI_MODULE,
  description: 'AI portfolio analyst governance and context API',
  category: 'premium',
  controllable: true,
};

export const piMultiOwnerFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_multi_owner',
  name: 'Portfolio Multi-Owner',
  module: PI_MODULE,
  description: 'Portfolio owner abstraction for multi-wallet and shared portfolios',
  category: 'premium',
  controllable: true,
};

export const piArchetypesFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_archetypes',
  name: 'Portfolio Archetype Registry',
  module: PI_MODULE,
  description: 'Investor archetype catalog and fit scoring',
  category: 'premium',
  controllable: true,
};

export const piCostGovernanceFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_cost_governance',
  name: 'PI Cost Governance',
  module: PI_MODULE,
  description: 'Compute cost tracking and budget enforcement',
  category: 'premium',
  controllable: true,
};

export const piRuleEngineFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_rule_engine',
  name: 'PI Rule Engine DSL',
  module: PI_MODULE,
  description: 'Generic rule evaluation for identity and opportunity engines',
  category: 'premium',
  controllable: true,
};

export const piSimulationFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_simulation',
  name: 'Portfolio Simulation Engine',
  module: PI_MODULE,
  description: 'What-if portfolio allocation simulation',
  category: 'premium',
  controllable: true,
};
