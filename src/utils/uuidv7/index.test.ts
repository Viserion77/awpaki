import { monotonicUuidv7, uuidv7 } from './index.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produces a well formed v7 with the RFC variant bits', () => {
    expect(uuidv7()).toMatch(UUID_PATTERN);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));

    expect(ids.size).toBe(1000);
  });

  // A little-endian slip produces a valid-looking UUIDv7 that merely sorts wrong, which is
  // the one defect the format exists to prevent — so the literal prefix is pinned.
  it('writes the timestamp big-endian, in the leading 48 bits', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0x0192_3f4c_d5e6);

    expect(uuidv7().startsWith('01923f4c-d5e6-7')).toBe(true);
  });

  it('sorts as a string in creation order across milliseconds', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_700_000_000_000);
    const first = uuidv7();
    nowSpy.mockReturnValue(1_700_000_000_001);
    const second = uuidv7();
    nowSpy.mockReturnValue(1_700_000_001_000);
    const third = uuidv7();

    expect([third, first, second].sort()).toEqual([first, second, third]);
  });
});

describe('monotonicUuidv7', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produces a well formed v7', () => {
    expect(monotonicUuidv7()).toMatch(UUID_PATTERN);
  });

  it('keeps creation order inside a single millisecond', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const ids = Array.from({ length: 500 }, () => monotonicUuidv7());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // NTP corrections and resumed containers both step the clock backwards; re-issuing ids
  // below ones that already exist would break every consumer relying on the ordering.
  it('never goes backwards when the clock does', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_700_000_000_000);
    const before = monotonicUuidv7();

    nowSpy.mockReturnValue(1_699_999_000_000);
    const after = monotonicUuidv7();

    expect(after > before).toBe(true);
  });

  it('borrows the next millisecond instead of wrapping the counter', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    // More ids than the counter can hold in one millisecond, whatever it was seeded with.
    const ids = Array.from({ length: 5000 }, () => monotonicUuidv7());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The generator holds the last timestamp it used for the life of the process — which is
  // what "never goes backwards" means — so this case has to move the clock *forward* past
  // whatever the earlier cases left behind.
  it('resumes from real time once the clock catches up', () => {
    const future = Date.now() + 60_000;
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(future - 5_000);
    monotonicUuidv7();

    nowSpy.mockReturnValue(future);
    const id = monotonicUuidv7();

    // The leading 48 bits are the timestamp: eight hex digits, then four more after the dash.
    expect(id.slice(0, 8) + id.slice(9, 13)).toBe(future.toString(16).padStart(12, '0'));
  });
});
