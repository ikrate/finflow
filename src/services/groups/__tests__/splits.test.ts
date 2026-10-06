import { calculateSplits } from '../splits';

describe('Splits calculation and remainder distribution', () => {
  test('equal split: distributes remainder 1 unit at a time in ascending memberId order', () => {
    // 1000 cents divided equally among 3 members: A, B, C
    // 1000 / 3 = 333 remainder 1
    // Ascending: "mem-a", "mem-b", "mem-c" -> "mem-a" should get 334, others 333
    const participants = [
      { memberId: 'mem-c' },
      { memberId: 'mem-a' },
      { memberId: 'mem-b' },
    ];
    const result = calculateSplits(1000, 'equal', participants);

    expect(result.isValid).toBe(true);
    expect(result.shares['mem-a']).toBe(334);
    expect(result.shares['mem-b']).toBe(333);
    expect(result.shares['mem-c']).toBe(333);
    expect(result.shares['mem-a'] + result.shares['mem-b'] + result.shares['mem-c']).toBe(1000);
  });

  test('equal split: remainder 2 units distributed to first two in ascending order', () => {
    // 1001 cents divided equally among 3 members: 333 remainder 2
    const participants = [
      { memberId: 'z-member' },
      { memberId: 'a-member' },
      { memberId: 'm-member' },
    ];
    const result = calculateSplits(1001, 'equal', participants);

    expect(result.isValid).toBe(true);
    expect(result.shares['a-member']).toBe(334);
    expect(result.shares['m-member']).toBe(334);
    expect(result.shares['z-member']).toBe(333);
    expect(result.shares['a-member'] + result.shares['m-member'] + result.shares['z-member']).toBe(1001);
  });

  test('exact split: validates that exact shares sum to amountMinor', () => {
    const participants = [
      { memberId: 'm1', value: 450 },
      { memberId: 'm2', value: 550 },
    ];
    const validResult = calculateSplits(1000, 'exact', participants);
    expect(validResult.isValid).toBe(true);
    expect(validResult.shares['m1']).toBe(450);
    expect(validResult.shares['m2']).toBe(550);

    const invalidResult = calculateSplits(1000, 'exact', [
      { memberId: 'm1', value: 400 },
      { memberId: 'm2', value: 500 },
    ]);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toBeDefined();
  });

  test('percent split: splits by percent and distributes rounding remainder deterministically', () => {
    // 1000 cents: 33%, 33%, 34%
    const participants = [
      { memberId: 'p3', value: 34 },
      { memberId: 'p1', value: 33 },
      { memberId: 'p2', value: 33 },
    ];
    const result = calculateSplits(1000, 'percent', participants);

    expect(result.isValid).toBe(true);
    // 1000 * 33 / 100 = 330 each for p1, p2. 1000 * 34 / 100 = 340 for p3. Sum = 1000.
    expect(result.shares['p1']).toBe(330);
    expect(result.shares['p2']).toBe(330);
    expect(result.shares['p3']).toBe(340);
    expect(result.shares['p1'] + result.shares['p2'] + result.shares['p3']).toBe(1000);

    // Invalid percent sum
    const invalid = calculateSplits(1000, 'percent', [
      { memberId: 'p1', value: 50 },
      { memberId: 'p2', value: 40 },
    ]);
    expect(invalid.isValid).toBe(false);
  });

  test('shares split: splits by share counts and distributes remainder', () => {
    // 1000 cents split with shares 1, 1, 1
    const participants = [
      { memberId: 's2', value: 1 },
      { memberId: 's1', value: 1 },
      { memberId: 's3', value: 1 },
    ];
    const result = calculateSplits(1000, 'shares', participants);

    expect(result.isValid).toBe(true);
    expect(result.shares['s1']).toBe(334);
    expect(result.shares['s2']).toBe(333);
    expect(result.shares['s3']).toBe(333);
    expect(result.shares['s1'] + result.shares['s2'] + result.shares['s3']).toBe(1000);
  });

  test('rejects negative or fractional amounts', () => {
    const res1 = calculateSplits(-500, 'equal', [{ memberId: 'm1' }]);
    expect(res1.isValid).toBe(false);

    const res2 = calculateSplits(100.5, 'equal', [{ memberId: 'm1' }]);
    expect(res2.isValid).toBe(false);
  });
});
