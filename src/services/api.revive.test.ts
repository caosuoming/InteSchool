import { describe, expect, it } from 'vitest';
import { reviveRpc } from './api';

describe('reviveRpc', () => {
  it('preserves plain JSON data and nested object identities', () => {
    const original = { nested: { count: 4 }, entries: [{ id: 'x' }, { id: 'y' }] };
    expect(reviveRpc(original)).toBe(original);
    expect(reviveRpc(original.entries)).toBe(original.entries);
  });

  it('revives Set/Map wrappers without copying untouched siblings', () => {
    const plain = { title: 'unchanged' };
    const original = { plain, data: [{ __rpcType: 'Set', values: [1, { __rpcType: 'Map', entries: [['a', 2]] }] }] };
    const result = reviveRpc(original) as { plain: typeof plain; data: Set<unknown>[] };
    expect(result).not.toBe(original);
    expect(result.plain).toBe(plain);
    expect(result.data[0]).toBeInstanceOf(Set);
    const [one, map] = [...result.data[0]];
    expect(one).toBe(1);
    expect(map).toBeInstanceOf(Map);
    expect((map as Map<string, number>).get('a')).toBe(2);
  });

  it('handles null, primitives and empty collections', () => {
    expect(reviveRpc(null)).toBeNull();
    expect(reviveRpc('x')).toBe('x');
    expect(reviveRpc({ __rpcType: 'Set', values: [] })).toEqual(new Set());
    expect(reviveRpc({ __rpcType: 'Map', entries: [] })).toEqual(new Map());
  });
});
