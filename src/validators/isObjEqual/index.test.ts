import { isObjEqual } from './index';

describe('isObjEqual', () => {
  it('should compare primitives with Object.is semantics', () => {
    expect(isObjEqual(1, 1)).toBe(true);
    expect(isObjEqual('a', 'a')).toBe(true);
    expect(isObjEqual(true, true)).toBe(true);
    expect(isObjEqual(NaN, NaN)).toBe(true);
    expect(isObjEqual(null, null)).toBe(true);
    expect(isObjEqual(undefined, undefined)).toBe(true);

    expect(isObjEqual(1, '1')).toBe(false);
    expect(isObjEqual(0, -0)).toBe(false);
    expect(isObjEqual(null, undefined)).toBe(false);
    expect(isObjEqual(null, {})).toBe(false);
    expect(isObjEqual(undefined, {})).toBe(false);
    expect(isObjEqual(0, false)).toBe(false);
    expect(isObjEqual('', null)).toBe(false);
  });

  it('should deeply compare plain objects', () => {
    expect(isObjEqual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBe(true);
    expect(isObjEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isObjEqual({}, {})).toBe(true);

    expect(isObjEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isObjEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isObjEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(isObjEqual({ a: undefined }, {})).toBe(false);
  });

  it('should compare arrays by length, order and content', () => {
    expect(isObjEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isObjEqual([], [])).toBe(true);
    expect(isObjEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);

    expect(isObjEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(isObjEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isObjEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('should never consider an array equal to an object', () => {
    expect(isObjEqual([], {})).toBe(false);
    expect(isObjEqual(['a'], { 0: 'a' })).toBe(false);
    expect(isObjEqual({ 0: 'a', length: 1 }, ['a'])).toBe(false);
  });

  it('should compare dates by their timestamp', () => {
    expect(isObjEqual(new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'))).toBe(
      true
    );
    expect(isObjEqual(new Date(0), new Date(0))).toBe(true);
    expect(isObjEqual(new Date('invalid'), new Date('invalid'))).toBe(true);
    expect(isObjEqual({ at: new Date(1700000000000) }, { at: new Date(1700000000000) })).toBe(true);

    expect(isObjEqual(new Date(0), new Date(1))).toBe(false);
    expect(isObjEqual(new Date(0), 0)).toBe(false);
    expect(isObjEqual(new Date(0), '1970-01-01T00:00:00.000Z')).toBe(false);
    expect(isObjEqual(new Date('invalid'), new Date(0))).toBe(false);
  });

  it('should compare prototypes, not only properties', () => {
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }
    class Vector {
      constructor(
        public x: number,
        public y: number
      ) {}
    }

    expect(isObjEqual(new Point(1, 2), new Point(1, 2))).toBe(true);
    expect(isObjEqual(new Point(1, 2), new Vector(1, 2))).toBe(false);
    expect(isObjEqual(new Point(1, 2), { x: 1, y: 2 })).toBe(false);
    expect(isObjEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 })).toBe(false);
  });

  it('should compare regexps, maps and sets', () => {
    expect(isObjEqual(/ab+c/gi, /ab+c/gi)).toBe(true);
    expect(isObjEqual(/ab+c/g, /ab+c/i)).toBe(false);
    expect(isObjEqual(/ab+c/, /abc/)).toBe(false);

    expect(
      isObjEqual(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
        new Map([
          ['a', 1],
          ['b', 2],
        ])
      )
    ).toBe(true);
    expect(isObjEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(isObjEqual(new Map([['a', 1]]), new Map())).toBe(false);

    expect(isObjEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true);
    expect(isObjEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
    expect(isObjEqual(new Set([1]), new Set([1, 2]))).toBe(false);
  });

  it('should compare enumerable symbol keys', () => {
    const key = Symbol('id');
    expect(isObjEqual({ [key]: 1 }, { [key]: 1 })).toBe(true);
    expect(isObjEqual({ [key]: 1 }, { [key]: 2 })).toBe(false);
    expect(isObjEqual({ [key]: 1 }, {})).toBe(false);
  });

  it('should compare functions by reference', () => {
    const fn = (): number => 1;
    expect(isObjEqual({ fn }, { fn })).toBe(true);
    expect(isObjEqual({ fn }, { fn: (): number => 1 })).toBe(false);
  });

  it('should terminate on cyclic structures', () => {
    type Node = { name: string; self?: Node };

    const a: Node = { name: 'root' };
    a.self = a;
    const b: Node = { name: 'root' };
    b.self = b;
    expect(isObjEqual(a, b)).toBe(true);

    const c: Node = { name: 'other' };
    c.self = c;
    expect(isObjEqual(a, c)).toBe(false);

    const listA: unknown[] = [1];
    listA.push(listA);
    const listB: unknown[] = [1];
    listB.push(listB);
    expect(isObjEqual(listA, listB)).toBe(true);
  });

  it('should return false instead of throwing when a getter blows up', () => {
    const exploding = {
      get value(): never {
        throw new Error('boom');
      },
    };
    expect(isObjEqual(exploding, { value: 1 })).toBe(false);
    expect(isObjEqual({ value: 1 }, exploding)).toBe(false);
  });

  it('should return false instead of overflowing on very deep structures', () => {
    const deepA: Record<string, unknown> = {};
    const deepB: Record<string, unknown> = {};
    let cursorA = deepA;
    let cursorB = deepB;
    for (let index = 0; index < 100000; index += 1) {
      cursorA = cursorA.next = {} as Record<string, unknown>;
      cursorB = cursorB.next = {} as Record<string, unknown>;
    }
    expect(typeof isObjEqual(deepA, deepB)).toBe('boolean');
  });
});
