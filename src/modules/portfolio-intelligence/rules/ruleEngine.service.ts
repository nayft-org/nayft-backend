type RuleCondition = {
  field: string;
  op: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value: number | string;
};

type RuleDefinition = {
  id: string;
  domain: string;
  conditions: RuleCondition[];
  score: number;
  label: string;
};

function getField(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function evalCondition(ctx: Record<string, unknown>, cond: RuleCondition): boolean {
  const actual = getField(ctx, cond.field);
  if (actual === undefined) return false;
  const numActual = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const numValue = typeof cond.value === 'number' ? cond.value : parseFloat(String(cond.value));

  switch (cond.op) {
    case 'gte':
      return numActual >= numValue;
    case 'lte':
      return numActual <= numValue;
    case 'gt':
      return numActual > numValue;
    case 'lt':
      return numActual < numValue;
    case 'eq':
      return actual === cond.value || String(actual) === String(cond.value);
    default:
      return false;
  }
}

export const ruleEngineService = {
  evaluate(domain: string, context: Record<string, unknown>, rules: RuleDefinition[]) {
    const matched = rules
      .filter((r) => r.domain === domain)
      .filter((r) => r.conditions.every((c) => evalCondition(context, c)))
      .sort((a, b) => b.score - a.score);

    return {
      matched: matched.map((r) => ({ id: r.id, label: r.label, score: r.score })),
      top: matched[0] ?? null,
    };
  },

  rulesFromIdentityJson(
    rules: Array<Record<string, unknown>>,
    domain = 'identity'
  ): RuleDefinition[] {
    return rules.map((r) => ({
      id: String(r.id),
      domain,
      label: String(r.name ?? r.id),
      score: Number(r.priority ?? 0),
      conditions: Object.entries(r)
        .filter(([k]) => k.startsWith('min') || k.startsWith('max'))
        .map(([k, v]) => ({
          field: k.replace(/^min/, '').replace(/^max/, ''),
          op: k.startsWith('min') ? ('gte' as const) : ('lte' as const),
          value: Number(v),
        })),
    }));
  },
};
