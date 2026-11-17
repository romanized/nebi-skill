import { test } from 'node:test';
import assert from 'node:assert/strict';
const { slugify } = await import(`${process.env.FIXTURE}/src/text.js`);

test('basic', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('accents', () => assert.equal(slugify('Crème Brûlée'), 'creme-brulee'));
test('collapse and trim', () => assert.equal(slugify('  --a  &  b--  '), 'a-b'));
test('digits kept', () => assert.equal(slugify('Top 10 Tips'), 'top-10-tips'));
test('empty', () => assert.equal(slugify('!!!'), ''));
test('cut at dash', () => assert.equal(slugify('alpha beta gamma', 12), 'alpha-beta'));
test('cut exactly at a dash boundary', () => assert.equal(slugify('alpha beta gamma', 10), 'alpha-beta'));
test('no dash in range', () => assert.equal(slugify('abcdefghijkl', 5), 'abcde'));
test('default max 60', () => assert.ok(slugify('word '.repeat(40)).length <= 60));
