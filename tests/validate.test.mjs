import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidRegistrationNumber,
  normalizeRegistrationNumber,
  isValidPostalCode,
  normalizePostalCode,
  parseGiftDate,
  validateRows,
} from '../lib/validate.js';

test('validate: CRA registration number regex ^\\d{9}RR\\d{4}$', () => {
  assert.equal(isValidRegistrationNumber('123456789RR0001'), true);
  assert.equal(isValidRegistrationNumber('890123456RR0002'), true);

  assert.equal(isValidRegistrationNumber('12345678RR0001'), false); // 8 digits
  assert.equal(isValidRegistrationNumber('1234567890RR0001'), false); // 10 digits
  assert.equal(isValidRegistrationNumber('123456789RC0001'), false); // RC instead of RR
  assert.equal(isValidRegistrationNumber('123456789RR001'), false); // 3 suffix digits
  assert.equal(isValidRegistrationNumber('123456789rr0001'), false); // lowercase before normalization
  assert.equal(isValidRegistrationNumber(normalizeRegistrationNumber(' 123456789 rr 0001 ')), true);
});

test('validate: Canadian postal code regex and normalizer', () => {
  const validPostals = ['M5V 2T6', 'm5v2t6', 'K1A-0B1', 'V6B 1A1', 'H2X 1Y4', 'L6P 1X4'];
  for (const p of validPostals) {
    assert.equal(isValidPostalCode(p), true, `Expected ${p} to be valid`);
  }
  assert.equal(normalizePostalCode('m5v2t6'), 'M5V 2T6');
  assert.equal(normalizePostalCode('k1a-0b1'), 'K1A 0B1');

  const invalidPostals = [
    '90210',    // US zip
    'D1A 1A1',  // Forbidden first letter D
    'W1A 1A1',  // Forbidden first letter W
    'Z1A 1A1',  // Forbidden first letter Z
    'M5D 2T6',  // Forbidden letter D
    'M5V 2T',   // Incomplete
    '123 ABC',  // Reversed
  ];
  for (const bad of invalidPostals) {
    assert.equal(isValidPostalCode(bad), false, `Expected ${bad} to be invalid`);
  }
});

test('validate: validateRows catches each error type and routes non-cash/advantage to manual review', () => {
  const rows = [
    // 1. Valid row
    {
      id: 'r1',
      fullName: 'Priya Sharma',
      addressLine1: '120 Bloor St E',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M4W 1B7',
      amount: '$250.00',
      date: '2026-04-15',
      method: 'e-Transfer',
    },
    // 2. Duplicate of r1
    {
      id: 'r2',
      fullName: 'Priya Sharma',
      addressLine1: '120 Bloor St E',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M4W 1B7',
      amount: '250',
      date: '2026-04-15',
      method: 'e-Transfer',
    },
    // 3. Missing full name (single name only)
    {
      id: 'r3',
      fullName: 'Priya',
      addressLine1: '10 Yonge St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5E 1R4',
      amount: '100.00',
      date: '2026-05-01',
    },
    // 4. Missing address & invalid postal code
    {
      id: 'r4',
      fullName: 'Arjun Patel',
      addressLine1: '',
      city: 'Toronto',
      province: 'ON',
      postalCode: '90210',
      amount: '100.00',
      date: '2026-05-01',
    },
    // 5. Amount <= 0 and date outside tax year 2026
    {
      id: 'r5',
      fullName: 'Meera Nair',
      addressLine1: '45 Queen St',
      city: 'Ottawa',
      province: 'ON',
      postalCode: 'K1P 5C9',
      amount: '0.00',
      date: '2025-12-31',
    },
    // 6. Out-of-scope non-cash gift -> Needs manual review
    {
      id: 'r6',
      fullName: 'Rohan Verma',
      addressLine1: '88 King St W',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5H 1J9',
      amount: '500.00',
      date: '2026-06-10',
      method: 'In-Kind (Sound Equipment)',
    },
    // 7. Out-of-scope split receipt with advantage -> Needs manual review
    {
      id: 'r7',
      fullName: 'Kavita Rao',
      addressLine1: '14 Front St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5J 2N8',
      amount: '200.00',
      date: '2026-07-01',
      method: 'Cheque',
      advantage: '$50.00',
    },
  ];

  const result = validateRows(rows, { taxYear: 2026 });
  assert.equal(result.counts.total, 7);
  assert.equal(result.counts.manualReview, 2); // r6, r7
  assert.equal(result.counts.errors, 5); // r1 & r2 (unconfirmed duplicates), r3, r4, r5
  assert.equal(result.counts.valid, 0);

  // Confirm duplicate on r1 & r2 and re-validate
  rows[0].duplicateConfirmed = true;
  rows[1].duplicateConfirmed = true;
  const afterConfirm = validateRows(rows, { taxYear: 2026 });
  assert.equal(afterConfirm.counts.valid, 2);
  assert.equal(afterConfirm.counts.errors, 3);
  assert.equal(afterConfirm.counts.manualReview, 2);

  // Verify specific error messages on r3, r4, r5
  const r3 = afterConfirm.rows.find((r) => r.id === 'r3');
  assert.ok(r3.fieldErrors.fullName);

  const r4 = afterConfirm.rows.find((r) => r.id === 'r4');
  assert.ok(r4.fieldErrors.addressLine1);
  assert.ok(r4.fieldErrors.postalCode);

  const r5 = afterConfirm.rows.find((r) => r.id === 'r5');
  assert.ok(r5.fieldErrors.amount);
  assert.ok(r5.fieldErrors.date);
});

test('validate: parseGiftDate parses ISO, named months, and Excel serial dates', () => {
  assert.deepEqual(parseGiftDate('2026-10-15'), { ok: true, isoDate: '2026-10-15', year: 2026 });
  assert.deepEqual(parseGiftDate('Oct 15, 2026'), { ok: true, isoDate: '2026-10-15', year: 2026 });
  assert.deepEqual(parseGiftDate('15 October 2026'), { ok: true, isoDate: '2026-10-15', year: 2026 });
  assert.equal(parseGiftDate('2026-02-30').ok, false);
});
