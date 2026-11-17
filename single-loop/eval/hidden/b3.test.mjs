import { test } from 'node:test';
import assert from 'node:assert/strict';
const { parseDuration } = await import(`${process.env.FIXTURE}/src/duration.js`);

test('h m', () => assert.equal(parseDuration('1h30m'), 5400));
test('h m s', () => assert.equal(parseDuration('2h5m10s'), 7510));
test('single', () => { assert.equal(parseDuration('90m'), 5400); assert.equal(parseDuration('45s'), 45); });
test('bad input throws', () => assert.throws(() => parseDuration('soon')));
