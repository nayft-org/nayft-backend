import { stableStringify } from './stableJson';

/**
 * CoinDCX signing uses a compact JSON string with sorted object keys at every level
 * (Python: json.dumps(d, separators=(',', ':')) with recursive key sort).
 */
describe('stableStringify', () => {
  it('stringifies null and scalars like JSON.stringify', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('x')).toBe('"x"');
  });

  it('sorts top-level object keys for signing stability', () => {
    const a = stableStringify({ b: 2, a: 1, timestamp: 3 });
    const b = stableStringify({ a: 1, b: 2, timestamp: 3 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"timestamp":3}');
  });

  it('recursively sorts nested object keys', () => {
    expect(stableStringify({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
  });

  it('keeps array element order (not sorted)', () => {
    expect(stableStringify([2, 1, 3])).toBe('[2,1,3]');
  });

  it('serializes objects inside arrays with sorted keys', () => {
    expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('matches a Python-style minimal balances body shape', () => {
    // Typical signed body: { "timestamp": 1700000000123 } only
    const s = stableStringify({ timestamp: 1700000000123 });
    expect(s).toBe('{"timestamp":1700000000123}');
  });

  it('produces an empty object for {}', () => {
    expect(stableStringify({})).toBe('{}');
  });
});
