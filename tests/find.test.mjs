import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldText, findText, findMatches, findRows } from '../lib/find.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const donors = [
  { id: 1, fullName: 'Élise Lévesque', addressLine1: '12 rue Saint-Paul', city: 'Montréal', province: 'QC', postalCode: 'H2Y 1G6', date: '2026-03-14', amount: '$1,250.00', method: 'Cheque' },
  { id: 2, fullName: 'Harpreet Kaur', addressLine1: '88 King St W', city: 'Toronto', province: 'ON', postalCode: 'M5V 2T6', date: '2026-11-02', amount: '$50.00', method: 'e-Transfer' },
  { id: 3, fullName: 'Dan Okafor', addressLine1: '9 Elm Street', city: 'Mississauga', province: 'ON', postalCode: 'L5B2C9', date: '2026-11-20', amount: '$125.50', method: 'Cash' },
];
const fieldsOf = (r) => [r.fullName, r.addressLine1, r.city, r.province, r.postalCode, r.date, r.amount, r.method];
const ids = (q) => findRows(donors, q, fieldsOf).map((r) => r.id);

test('find: an empty box shows every row', () => {
  assert.deepEqual(ids(''), [1, 2, 3]);
  assert.deepEqual(ids('   '), [1, 2, 3]);
  assert.deepEqual(findRows(null, 'x', fieldsOf), []);
});

test('find: a name in any case, with or without accents, by any part of it', () => {
  assert.deepEqual(ids('levesque'), [1]);
  assert.deepEqual(ids('ÉLISE'), [1]);
  assert.deepEqual(ids('kaur'), [2]);
  assert.deepEqual(ids('okaf'), [3]);
  assert.equal(foldText('  Élise   LÉVESQUE '), 'elise levesque');
});

test('find: every word must match, in any order', () => {
  assert.deepEqual(ids('toronto kaur'), [2]);
  assert.deepEqual(ids('kaur toronto'), [2]);
  assert.deepEqual(ids('kaur montreal'), []);
  assert.deepEqual(ids('on cash'), [3]);
});

test('find: a postal code with or without its space', () => {
  assert.deepEqual(ids('M5V 2T6'), [2]);
  assert.deepEqual(ids('m5v2t6'), [2]);
  assert.deepEqual(ids('l5b 2c9'), [3], 'stored without a space, typed with one');
  assert.deepEqual(ids('h2y'), [1]);
});

test('find: an amount with or without the dollar sign and commas, a date, a method', () => {
  assert.deepEqual(ids('1250'), [1]);
  assert.deepEqual(ids('1,250.00'), [1]);
  assert.deepEqual(ids('$125.50'), [3]);
  assert.deepEqual(ids('2026-11'), [2, 3]);
  assert.deepEqual(ids('e-transfer'), [2]);
  assert.deepEqual(ids('etransfer'), [2]);
});

test('find: nothing matches nonsense, and empty fields are harmless', () => {
  assert.deepEqual(ids('zzzz'), []);
  assert.equal(findMatches(findText([null, undefined, '', 'Only Name']), 'only'), true);
  assert.equal(findMatches(findText([]), 'x'), false);
});

test('find: a register row by serial number (with or without dashes), status or void reason', () => {
  const register = [
    { serialNumber: 'ALM-2026-00012', status: 'ISSUED', donorName: 'Harpreet Kaur', runId: 'run-7' },
    { serialNumber: 'ALM-2026-00013', status: 'VOID', donorName: 'Dan Okafor', voidReason: 'Wrong amount', runId: 'run-7' },
  ];
  const of = (e) => [e.serialNumber, e.status, e.donorName, e.voidReason, e.runId];
  const serials = (q) => findRows(register, q, of).map((e) => e.serialNumber.slice(-2));
  assert.deepEqual(serials('ALM-2026-00013'), ['13']);
  assert.deepEqual(serials('alm202600013'), ['13']);
  assert.deepEqual(serials('00012'), ['12']);
  assert.deepEqual(serials('void'), ['13']);
  assert.deepEqual(serials('wrong amount'), ['13']);
  assert.deepEqual(serials('run-7'), ['12', '13']);
});

test('find: both tables have the box, and the offline copy includes the new file', () => {
  const app = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
  assert.ok(app.includes("findBox('review'"), 'donor review table');
  assert.ok(app.includes("findBox('register'"), 'receipt register');
  assert.ok(app.includes("wireFind(root, 'review')") && app.includes("wireFind(root, 'register')"));
  const sw = fs.readFileSync(path.join(appRoot, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'./lib/find.js'"), 'sw.js precaches lib/find.js');
  assert.doesNotMatch(sw, /almsy-desk-v11'/, 'the cache name was bumped so installed copies fetch the new files');
});
