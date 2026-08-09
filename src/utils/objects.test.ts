import { cleanRecord, compareJsonDiff, mergeObjectChanges } from './objects';

describe('cleanRecord', () => {
  it('should remove keys holding undefined', () => {
    expect(cleanRecord({ a: 'x', b: undefined, c: 1 })).toEqual({ a: 'x', c: 1 });
  });

  it('should preserve null, empty string, zero and false', () => {
    const result = cleanRecord({ a: null, b: '', c: 0, d: false, e: undefined });

    expect(result).toEqual({ a: null, b: '', c: 0, d: false });
    expect(Object.keys(result)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should return an empty object when every value is undefined', () => {
    expect(cleanRecord({ a: undefined, b: undefined })).toEqual({});
  });

  it('should handle an empty object', () => {
    expect(cleanRecord({})).toEqual({});
  });

  it('should not mutate the input', () => {
    const input = { a: 'x', b: undefined };

    cleanRecord(input);

    expect(Object.prototype.hasOwnProperty.call(input, 'b')).toBe(true);
    expect(input).toEqual({ a: 'x', b: undefined });
  });

  it('should return a new object, not the same reference', () => {
    const input = { a: 'x' };

    expect(cleanRecord(input)).not.toBe(input);
  });

  it('should be shallow and keep nested undefined values untouched', () => {
    const nested = { keep: 1, drop: undefined };

    const result = cleanRecord({ nested, gone: undefined });

    expect(result).toEqual({ nested });
    expect(result.nested).toBe(nested);
    expect(Object.prototype.hasOwnProperty.call(result.nested, 'drop')).toBe(true);
  });

  it('should ignore inherited keys', () => {
    const parent = { inherited: 'yes' };
    const child = Object.create(parent) as { own?: string };
    child.own = 'value';

    expect(cleanRecord(child)).toEqual({ own: 'value' });
  });

  it('should work as the pre-step of a Record<string, string | undefined>', () => {
    const metadata: Record<string, string | undefined> = {
      traceId: 'abc-123',
      tenantId: undefined,
    };

    const cleaned: Record<string, string> = cleanRecord(metadata);

    expect(cleaned).toEqual({ traceId: 'abc-123' });
  });
});

describe('compareJsonDiff', () => {
  it('should report added, changed and removed keys', () => {
    const result = compareJsonDiff({ name: 'old', legacy: true }, { name: 'new', extra: 1 });

    expect(result).toEqual({
      diff: { name: 'new', extra: 1 },
      removed: { legacy: true },
    });
  });

  it('should return empty diff and removed for equal objects', () => {
    expect(compareJsonDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual({ diff: {}, removed: {} });
  });

  it('should return empty results for two empty objects', () => {
    expect(compareJsonDiff({}, {})).toEqual({ diff: {}, removed: {} });
  });

  it('should nest the diff following the original shape', () => {
    const result = compareJsonDiff(
      { config: { retries: 3, timeout: 10, nested: { keep: true } } },
      { config: { retries: 5, nested: { keep: true } } }
    );

    expect(result).toEqual({
      diff: { config: { retries: 5 } },
      removed: { config: { timeout: 10 } },
    });
  });

  it('should omit a nested object entirely when nothing changed inside it', () => {
    const result = compareJsonDiff({ config: { a: 1 } }, { config: { a: 1 } });

    expect(result.diff).toEqual({});
    expect(Object.keys(result.diff)).toHaveLength(0);
  });

  it('should treat null as a value and undefined as a removal', () => {
    expect(compareJsonDiff({ a: 1, b: 2 }, { a: null, b: undefined })).toEqual({
      diff: { a: null },
      removed: { b: 2 },
    });
  });

  it('should report a key added with a null value', () => {
    expect(compareJsonDiff({}, { a: null })).toEqual({ diff: { a: null }, removed: {} });
  });

  it('should ignore keys that are undefined on both sides', () => {
    expect(compareJsonDiff({ a: undefined }, { a: undefined })).toEqual({ diff: {}, removed: {} });
  });

  it('should treat a key that went from undefined to a value as an addition', () => {
    expect(compareJsonDiff({ a: undefined }, { a: 1 })).toEqual({ diff: { a: 1 }, removed: {} });
  });

  it('should compare arrays deeply and report them whole', () => {
    expect(compareJsonDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({
      diff: {},
      removed: {},
    });

    expect(compareJsonDiff({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })).toEqual({
      diff: { tags: ['a', 'c'] },
      removed: {},
    });
  });

  it('should detect array length changes', () => {
    expect(compareJsonDiff({ tags: ['a'] }, { tags: ['a', 'b'] }).diff).toEqual({
      tags: ['a', 'b'],
    });
    expect(compareJsonDiff({ tags: ['a', 'b'] }, { tags: [] }).diff).toEqual({ tags: [] });
  });

  it('should compare arrays of objects deeply', () => {
    expect(compareJsonDiff({ items: [{ id: 1 }] }, { items: [{ id: 1 }] })).toEqual({
      diff: {},
      removed: {},
    });
    expect(compareJsonDiff({ items: [{ id: 1 }] }, { items: [{ id: 2 }] }).diff).toEqual({
      items: [{ id: 2 }],
    });
  });

  it('should detect objects inside arrays that differ in their key set', () => {
    expect(compareJsonDiff({ items: [{ a: 1 }] }, { items: [{ a: 1, b: 2 }] }).diff).toEqual({
      items: [{ a: 1, b: 2 }],
    });
    expect(compareJsonDiff({ items: [{ a: 1 }] }, { items: [{ b: 1 }] }).diff).toEqual({
      items: [{ b: 1 }],
    });
  });

  it('should report a type change as a whole new value', () => {
    expect(compareJsonDiff({ a: { nested: 1 } }, { a: 'string' })).toEqual({
      diff: { a: 'string' },
      removed: {},
    });

    expect(compareJsonDiff({ a: 'string' }, { a: { nested: 1 } })).toEqual({
      diff: { a: { nested: 1 } },
      removed: {},
    });
  });

  it('should not report an array replaced by an equal array as changed', () => {
    const result = compareJsonDiff({ a: [1, [2, 3]] }, { a: [1, [2, 3]] });

    expect(result.diff).toEqual({});
  });

  it('should compare Date values by timestamp', () => {
    const iso = '2024-05-01T10:00:00.000Z';

    expect(compareJsonDiff({ at: new Date(iso) }, { at: new Date(iso) }).diff).toEqual({});
    expect(
      compareJsonDiff({ at: new Date(iso) }, { at: new Date('2024-05-02T10:00:00.000Z') }).diff
    ).toHaveProperty('at');
  });

  it('should consider NaN equal to NaN', () => {
    expect(compareJsonDiff({ a: NaN }, { a: NaN }).diff).toEqual({});
  });

  it('should report every removed key of a nested object', () => {
    expect(compareJsonDiff({ config: { a: 1, b: 2 } }, { config: {} })).toEqual({
      diff: {},
      removed: { config: { a: 1, b: 2 } },
    });
  });

  it('should not mutate the inputs', () => {
    const oldObj = { a: 1, nested: { b: 2 } };
    const newObj = { a: 2, nested: { c: 3 } };

    compareJsonDiff(oldObj, newObj);

    expect(oldObj).toEqual({ a: 1, nested: { b: 2 } });
    expect(newObj).toEqual({ a: 2, nested: { c: 3 } });
  });
});

describe('mergeObjectChanges', () => {
  it('should merge nested plain objects recursively', () => {
    const result = mergeObjectChanges(
      { name: 'sensor', config: { retries: 3, timeout: 10 } },
      { config: { retries: 5 } }
    );

    expect(result).toEqual({ name: 'sensor', config: { retries: 5, timeout: 10 } });
  });

  it('should replace arrays instead of concatenating them', () => {
    expect(mergeObjectChanges({ tags: ['a', 'b'] }, { tags: ['c'] })).toEqual({ tags: ['c'] });
  });

  it('should replace an array with an empty array', () => {
    expect(mergeObjectChanges({ tags: ['a', 'b'] }, { tags: [] })).toEqual({ tags: [] });
  });

  it('should replace arrays nested inside merged objects', () => {
    expect(
      mergeObjectChanges({ config: { hosts: ['a', 'b'], port: 1 } }, { config: { hosts: ['c'] } })
    ).toEqual({ config: { hosts: ['c'], port: 1 } });
  });

  it('should add new keys by default', () => {
    expect(mergeObjectChanges({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('should keep old keys absent from the new object by default', () => {
    expect(mergeObjectChanges({ a: 1, b: 2 }, { a: 9 })).toEqual({ a: 9, b: 2 });
  });

  it('should ignore new keys when addNewKeys is false', () => {
    expect(
      mergeObjectChanges({ name: 'old' }, { name: 'new', hacker: true }, { addNewKeys: false })
    ).toEqual({ name: 'new' });
  });

  it('should apply addNewKeys: false at every nesting level', () => {
    expect(
      mergeObjectChanges(
        { config: { retries: 3 } },
        { config: { retries: 5, injected: true } },
        { addNewKeys: false }
      )
    ).toEqual({ config: { retries: 5 } });
  });

  it('should drop old keys when useOldKeysIfNotPresentInNew is false', () => {
    expect(
      mergeObjectChanges(
        { name: 'old', legacy: true },
        { name: 'new' },
        { useOldKeysIfNotPresentInNew: false }
      )
    ).toEqual({ name: 'new' });
  });

  it('should apply useOldKeysIfNotPresentInNew: false at every nesting level', () => {
    expect(
      mergeObjectChanges(
        { config: { retries: 3, timeout: 10 } },
        { config: { retries: 5 } },
        { useOldKeysIfNotPresentInNew: false }
      )
    ).toEqual({ config: { retries: 5 } });
  });

  it('should update only shared keys when both flags are false', () => {
    expect(
      mergeObjectChanges(
        { a: 1, b: 2 },
        { a: 9, c: 3 },
        { addNewKeys: false, useOldKeysIfNotPresentInNew: false }
      )
    ).toEqual({ a: 9 });
  });

  it('should ignore undefined values coming from the new object', () => {
    expect(mergeObjectChanges({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('should treat a key that only exists as undefined in the old object as a new key', () => {
    expect(mergeObjectChanges({ a: undefined }, { a: 1 })).toEqual({ a: 1 });
    expect(mergeObjectChanges({ a: undefined }, { a: 1 }, { addNewKeys: false })).toEqual({});
  });

  it('should never carry undefined values from the old object into the result', () => {
    const result = mergeObjectChanges({ a: undefined, b: 1 }, {});

    expect(result).toEqual({ b: 1 });
    expect(Object.prototype.hasOwnProperty.call(result, 'a')).toBe(false);
  });

  it('should let null overwrite a previous value', () => {
    expect(mergeObjectChanges({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it('should replace a plain object with a primitive and vice versa', () => {
    expect(mergeObjectChanges({ a: { nested: 1 } }, { a: 'x' })).toEqual({ a: 'x' });
    expect(mergeObjectChanges({ a: 'x' }, { a: { nested: 1 } })).toEqual({ a: { nested: 1 } });
  });

  it('should replace non-plain values as a whole', () => {
    const next = new Date('2024-05-02T00:00:00.000Z');

    const result = mergeObjectChanges<{ at: Date }>({ at: new Date('2024-01-01') }, { at: next });

    expect(result.at).toBe(next);
  });

  it('should not mutate any of the inputs', () => {
    const oldObj = { a: 1, config: { retries: 3, timeout: 10 } };
    const newObj = { config: { retries: 5 }, b: 2 };

    const result = mergeObjectChanges(oldObj, newObj);

    expect(oldObj).toEqual({ a: 1, config: { retries: 3, timeout: 10 } });
    expect(newObj).toEqual({ config: { retries: 5 }, b: 2 });
    expect(result).not.toBe(oldObj);
    expect(result).not.toBe(newObj);
    expect(result.config).not.toBe(oldObj.config);
    expect(result.config).not.toBe(newObj.config);
  });

  it('should handle empty objects on both sides', () => {
    expect(mergeObjectChanges({}, {})).toEqual({});
    expect(mergeObjectChanges({}, { a: 1 })).toEqual({ a: 1 });
    expect(mergeObjectChanges({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it('should merge deeply nested structures', () => {
    expect(
      mergeObjectChanges(
        { level1: { level2: { level3: { keep: true, change: 'old' } } } },
        { level1: { level2: { level3: { change: 'new' } } } }
      )
    ).toEqual({ level1: { level2: { level3: { keep: true, change: 'new' } } } });
  });

  it('should accept a generic type parameter for the result', () => {
    interface Config {
      name: string;
      retries: number;
    }

    const result = mergeObjectChanges<Config>({ name: 'a', retries: 1 }, { retries: 5 });

    expect(result.name).toBe('a');
    expect(result.retries).toBe(5);
  });
});
