import { test } from 'node:test';
import assert from 'node:assert/strict';
const { retry } = await import(`${process.env.FIXTURE}/src/async.js`);
const { chunk } = await import(`${process.env.FIXTURE}/src/array.js`);

test('retry: first success', async () => assert.equal(await retry(async () => 7), 7));
test('retry: succeeds on third call', async () => {
  let n = 0;
  assert.equal(await retry(async () => { if (++n < 3) throw new Error('x' + n); return n; }, { retries: 3 }), 3);
});
test('retry: rejects with the last error', async () => {
  let n = 0;
  await assert.rejects(retry(async () => { throw new Error('e' + (++n)); }, { retries: 2 }), /e3/);
  assert.equal(n, 3);
});
test('retry: retries 0 means one call', async () => {
  let n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error('no'); }, { retries: 0 }));
  assert.equal(n, 1);
});
test('retry: bad retries rejects without calling fn', async () => {
  let n = 0;
  await assert.rejects(retry(async () => { n++; }, { retries: -1 }), RangeError);
  assert.equal(n, 0);
});
test('chunk: basic', () => assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]));
test('chunk: empty', () => assert.deepEqual(chunk([], 3), []));
test('chunk: bad size', () => { assert.throws(() => chunk([1], 0), RangeError); assert.throws(() => chunk([1], 1.5), RangeError); });
test('chunk: does not mutate', () => { const a = [1, 2, 3]; chunk(a, 2); assert.deepEqual(a, [1, 2, 3]); });
