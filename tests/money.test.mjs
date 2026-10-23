import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseMoneyToCents, formatMoney } from '../lib/money.js';

test('money.parseMoney: parses 12+ valid English and French-Canadian cases accurately', () => {
  const cases = [
    ['$1,250.00', 125000],
    ['1250', 125000],
    ['1 250,00', 125000],
    ['1\u00A0250,00 $', 125000],
    ['1\u202F250,00 CAD', 125000],
    ['CA$ 501.25', 50125],
    ['CAD 99.5', 9950],
    ['25,50 $', 2550],
    ['1,000,000.00', 100000000],
    ['0.05', 5],
    [250.75, 25075],
    ['-150.00', -15000],
    ['(75.50)', -7550],
    ['10 000', 1000000],
  ];

  for (const [input, expectedCents] of cases) {
    const res = parseMoney(input);
    assert.equal(res.ok, true, `Expected "${input}" to parse, got error: ${res.error}`);
    assert.equal(res.cents, expectedCents, `Mismatch for "${input}"`);
    assert.equal(parseMoneyToCents(input), expectedCents);
  }
});

test('money.parseMoney: rejects ambiguous or malformed inputs without guessing', () => {
  const invalidCases = [
    '',
    '   ',
    null,
    undefined,
    '1.250,00',     // European dot-thousands + comma-decimal
    '12.34.56',     // Multiple decimal points
    '10.555',       // > 2 decimal digits
    '1,23,456',     // Invalid comma grouping
    '12,345,6',     // Malformed grouping
    'USD 100.00',   // Foreign currency
    '€50.00',       // Foreign currency
    'approx $100',  // Text mixed in
    '$50 + $50',    // Expression
  ];

  for (const bad of invalidCases) {
    const res = parseMoney(bad);
    assert.equal(res.ok, false, `Expected "${bad}" to fail parsing`);
    assert.throws(() => parseMoneyToCents(bad));
  }
});

test('money.formatMoney: formats integer cents as en-CA CAD currency', () => {
  assert.equal(formatMoney(125000), '$1,250.00');
  assert.equal(formatMoney(500), '$5.00');
  assert.equal(formatMoney(0), '$0.00');
  assert.throws(() => formatMoney(12.5));
});
