import {
  MAX_FLAG_BIT,
  addFlags,
  decodeFlags,
  encodeFlags,
  hasFlag,
  removeFlag,
} from './permissionsBitmask';

describe('encodeFlags', () => {
  it('should build a mask from bit positions', () => {
    expect(encodeFlags([0])).toBe('1');
    expect(encodeFlags([1])).toBe('2');
    expect(encodeFlags([0, 1, 3])).toBe('11');
  });

  it('should return "0" for an empty list', () => {
    expect(encodeFlags([])).toBe('0');
  });

  it('should ignore duplicated bits', () => {
    expect(encodeFlags([2, 2, 2])).toBe('4');
  });

  it('should not depend on the order of the bits', () => {
    expect(encodeFlags([3, 1, 0])).toBe(encodeFlags([0, 1, 3]));
  });

  it('should always return a decimal string', () => {
    const mask = encodeFlags([5]);

    expect(typeof mask).toBe('string');
    expect(mask).toMatch(/^\d+$/);
  });

  it('should throw for a negative bit', () => {
    expect(() => encodeFlags([-1])).toThrow(RangeError);
  });

  it('should throw for a bit above MAX_FLAG_BIT', () => {
    expect(() => encodeFlags([MAX_FLAG_BIT + 1])).toThrow(RangeError);
    expect(() => encodeFlags([MAX_FLAG_BIT])).not.toThrow();
  });

  it('should throw for a non-integer bit', () => {
    expect(() => encodeFlags([1.5])).toThrow(TypeError);
    expect(() => encodeFlags([NaN])).toThrow(TypeError);
    expect(() => encodeFlags(['1' as unknown as number])).toThrow(TypeError);
  });
});

describe('decodeFlags', () => {
  it('should list the bits that are set', () => {
    expect(decodeFlags('11')).toEqual([0, 1, 3]);
    expect(decodeFlags('4')).toEqual([2]);
  });

  it('should return an empty list for an empty mask', () => {
    expect(decodeFlags('0')).toEqual([]);
  });

  it('should return the bits in ascending order', () => {
    expect(decodeFlags(encodeFlags([9, 2, 60, 0]))).toEqual([0, 2, 9, 60]);
  });

  it('should accept a bigint mask', () => {
    expect(decodeFlags(11n)).toEqual([0, 1, 3]);
    expect(decodeFlags(0n)).toEqual([]);
  });

  it('should tolerate surrounding whitespace in the string', () => {
    expect(decodeFlags(' 11 ')).toEqual([0, 1, 3]);
  });

  it('should round-trip with encodeFlags', () => {
    const bits = [0, 5, 31, 32, 52, 53, 64, 128, MAX_FLAG_BIT];

    expect(decodeFlags(encodeFlags(bits))).toEqual(bits);
  });

  it('should reject a number mask, explaining the precision problem', () => {
    expect(() => decodeFlags(11 as unknown as string)).toThrow(TypeError);
    expect(() => decodeFlags(11 as unknown as string)).toThrow(/lose precision/);
  });

  it('should reject malformed strings', () => {
    expect(() => decodeFlags('')).toThrow(TypeError);
    expect(() => decodeFlags('  ')).toThrow(TypeError);
    expect(() => decodeFlags('-1')).toThrow(TypeError);
    expect(() => decodeFlags('12.5')).toThrow(TypeError);
    expect(() => decodeFlags('0x10')).toThrow(TypeError);
    expect(() => decodeFlags('1e3')).toThrow(TypeError);
    expect(() => decodeFlags('abc')).toThrow(TypeError);
  });

  it('should reject a negative bigint', () => {
    expect(() => decodeFlags(-1n)).toThrow(RangeError);
  });
});

describe('hasFlag', () => {
  it('should detect a set bit', () => {
    expect(hasFlag('11', 0)).toBe(true);
    expect(hasFlag('11', 1)).toBe(true);
    expect(hasFlag('11', 3)).toBe(true);
  });

  it('should detect an unset bit', () => {
    expect(hasFlag('11', 2)).toBe(false);
    expect(hasFlag('0', 0)).toBe(false);
  });

  it('should accept a bigint mask', () => {
    expect(hasFlag(11n, 3)).toBe(true);
    expect(hasFlag(11n, 2)).toBe(false);
  });

  it('should throw for an invalid mask or bit', () => {
    expect(() => hasFlag('nope', 0)).toThrow(TypeError);
    expect(() => hasFlag('1', -1)).toThrow(RangeError);
    expect(() => hasFlag('1', 1.5)).toThrow(TypeError);
  });
});

describe('addFlags', () => {
  it('should set a single bit', () => {
    expect(addFlags('0', 0)).toBe('1');
    expect(addFlags('3', 3)).toBe('11');
  });

  it('should set many bits at once', () => {
    expect(addFlags('0', [0, 1])).toBe('3');
  });

  it('should be idempotent', () => {
    expect(addFlags('11', 3)).toBe('11');
    expect(addFlags(addFlags('0', 5), 5)).toBe(addFlags('0', 5));
  });

  it('should accept an empty list', () => {
    expect(addFlags('11', [])).toBe('11');
  });

  it('should accept a bigint mask and still return a string', () => {
    expect(addFlags(3n, 2)).toBe('7');
  });

  it('should never mutate the input mask', () => {
    const mask = '3';

    addFlags(mask, 5);

    expect(mask).toBe('3');
  });

  it('should throw for an invalid bit', () => {
    expect(() => addFlags('0', MAX_FLAG_BIT + 1)).toThrow(RangeError);
  });
});

describe('removeFlag', () => {
  it('should clear a single bit', () => {
    expect(removeFlag('11', 3)).toBe('3');
    expect(removeFlag('1', 0)).toBe('0');
  });

  it('should be idempotent when the bit is not set', () => {
    expect(removeFlag('11', 2)).toBe('11');
    expect(removeFlag('0', 7)).toBe('0');
  });

  it('should clear many bits at once', () => {
    expect(removeFlag('11', [0, 1])).toBe('8');
  });

  it('should accept a bigint mask and still return a string', () => {
    expect(removeFlag(7n, 1)).toBe('5');
  });

  it('should never produce a negative mask', () => {
    expect(removeFlag('0', [0, 1, 2])).toBe('0');
  });

  it('should throw for an invalid mask', () => {
    expect(() => removeFlag('-1', 0)).toThrow(TypeError);
  });
});

describe('beyond the 32-bit bitwise ceiling', () => {
  it('should keep flag 32 distinct from flag 0', () => {
    // `1 << 32` is `1` in JavaScript: the naive implementation would collide here.
    const mask = encodeFlags([32]);

    expect(mask).toBe('4294967296');
    expect(hasFlag(mask, 32)).toBe(true);
    expect(hasFlag(mask, 0)).toBe(false);
  });

  it('should keep flag 60 distinct from flag 28', () => {
    // `1 << 60` is `268435456`, which is `1 << 28`.
    const mask = encodeFlags([60]);

    expect(mask).toBe('1152921504606846976');
    expect(hasFlag(mask, 60)).toBe(true);
    expect(hasFlag(mask, 28)).toBe(false);
    expect(decodeFlags(mask)).toEqual([60]);
  });

  it('should not turn flag 31 into a negative mask', () => {
    // `1 << 31` is -2147483648 with 32-bit signed arithmetic.
    expect(encodeFlags([31])).toBe('2147483648');
    expect(hasFlag('2147483648', 31)).toBe(true);
  });

  it('should add and remove a high bit without touching the low ones', () => {
    const granted = addFlags(encodeFlags([0, 1]), 60);

    expect(decodeFlags(granted)).toEqual([0, 1, 60]);
    expect(decodeFlags(removeFlag(granted, 60))).toEqual([0, 1]);
    expect(decodeFlags(removeFlag(granted, 0))).toEqual([1, 60]);
  });
});

describe('beyond the 53-bit safe integer ceiling', () => {
  it('should stay exact where Number rounds', () => {
    const mask = encodeFlags([0, 53]);

    // 2 ** 53 + 1 is the first integer `number` cannot represent.
    expect(mask).toBe('9007199254740993');
    expect(Number(mask)).toBe(9007199254740992); // the rounding this module avoids
    expect(hasFlag(mask, 0)).toBe(true);
    expect(hasFlag(mask, 53)).toBe(true);
    expect(decodeFlags(mask)).toEqual([0, 53]);
  });

  it('should survive a JSON round-trip as a string', () => {
    const mask = addFlags(encodeFlags([2, 60]), 100);
    const stored = JSON.parse(JSON.stringify({ permissionsMask: mask })) as {
      permissionsMask: string;
    };

    expect(stored.permissionsMask).toBe(mask);
    expect(decodeFlags(stored.permissionsMask)).toEqual([2, 60, 100]);
  });

  it('should handle the highest supported bit', () => {
    const mask = encodeFlags([MAX_FLAG_BIT]);

    expect(hasFlag(mask, MAX_FLAG_BIT)).toBe(true);
    expect(hasFlag(mask, MAX_FLAG_BIT - 1)).toBe(false);
    expect(decodeFlags(mask)).toEqual([MAX_FLAG_BIT]);
    expect(mask).toBe((2n ** BigInt(MAX_FLAG_BIT)).toString(10));
  });

  it('should keep every bit independent across a full grant/revoke cycle', () => {
    const bits = [0, 1, 31, 32, 53, 60, 64, 200];

    let mask = '0';
    for (const bit of bits) {
      mask = addFlags(mask, bit);
    }

    expect(decodeFlags(mask)).toEqual(bits);

    for (const bit of bits) {
      mask = removeFlag(mask, bit);
    }

    expect(mask).toBe('0');
  });
});
