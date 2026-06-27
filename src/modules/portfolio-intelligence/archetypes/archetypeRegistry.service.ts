import * as fs from 'fs';
import * as path from 'path';

export type ArchetypeDefinition = {
  id: string;
  name: string;
  description: string;
  identityRuleId: string;
};

type ArchetypeCatalog = {
  version: string;
  archetypes: ArchetypeDefinition[];
};

function loadCatalog(): ArchetypeCatalog {
  const full = path.join(__dirname, '../formulas/v1/archetype_catalog_v1.json');
  return JSON.parse(fs.readFileSync(full, 'utf8')) as ArchetypeCatalog;
}

export const archetypeRegistryService = {
  listArchetypes(): ArchetypeDefinition[] {
    return loadCatalog().archetypes;
  },

  getById(id: string): ArchetypeDefinition | undefined {
    return loadCatalog().archetypes.find((a) => a.id === id);
  },

  getByIdentityRuleId(ruleId: string): ArchetypeDefinition | undefined {
    return loadCatalog().archetypes.find((a) => a.identityRuleId === ruleId);
  },

  fitScore(archetypeId: string, identityId: string, identityConfidence: number): number {
    const archetype = this.getById(archetypeId);
    if (!archetype) return 0;
    if (archetype.identityRuleId === identityId) return identityConfidence;
    return identityConfidence * 0.3;
  },
};
