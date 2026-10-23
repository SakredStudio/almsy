import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvText, parseXlsxBuffer } from '../lib/parse.js';
import { autoGuessMapping, applyColumnMapping } from '../lib/mapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures');

test('parse: parses sample-140.csv (140 rows) and messy.csv (12 rows) accurately', () => {
  const csv140 = fs.readFileSync(path.join(fixturesDir, 'sample-140.csv'), 'utf8');
  const parsed140 = parseCsvText(csv140);
  assert.equal(parsed140.rows.length, 140);
  assert.ok(parsed140.headers.includes('Donor Full Name'));

  const messyCsv = fs.readFileSync(path.join(fixturesDir, 'messy.csv'), 'utf8');
  const parsedMessy = parseCsvText(messyCsv);
  assert.equal(parsedMessy.rows.length, 12);
});

test('parse: parses sample.xlsx via vendored SheetJS and maps split name columns', () => {
  const xlsxBuf = fs.readFileSync(path.join(fixturesDir, 'sample.xlsx'));
  const parsedXlsx = parseXlsxBuffer(xlsxBuf);
  assert.equal(parsedXlsx.rows.length, 25);
  const mapping = autoGuessMapping(parsedXlsx.headers);
  const mapped = applyColumnMapping(parsedXlsx.rows, mapping);
  assert.equal(mapped.length, 25);
  assert.ok(mapped[0].fullName.includes(' '));
});
