import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRows } from '../lib/validate.js';
import { buildAggregationPlan, normalizeDonorMergeKey } from '../lib/aggregate.js';

test('aggregate: normalizes donor name and postal code and merges multiple gifts in annual mode with confirm list', () => {
  const raw = [
    {
      id: 'g1',
      fullName: 'Priya K. Sharma',
      addressLine1: '120 Bloor St E',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'm4w 1b7',
      amount: '$100.00',
      date: '2026-03-10',
      method: 'e-Transfer',
    },
    {
      id: 'g2',
      fullName: 'priya k sharma',
      addressLine1: '120 Bloor St E',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M4W-1B7',
      amount: '$150.00',
      date: '2026-11-05',
      method: 'Cheque',
    },
    {
      id: 'g3',
      fullName: 'Arjun S. Patel',
      addressLine1: '85 Bovaird Dr E',
      city: 'Brampton',
      province: 'ON',
      postalCode: 'L6V 1A4',
      amount: '$501.00',
      date: '2026-06-15',
      method: 'Cash',
    },
  ];

  assert.equal(normalizeDonorMergeKey(raw[0]), normalizeDonorMergeKey(raw[1]));

  const validated = validateRows(raw, { taxYear: 2026 });
  assert.equal(validated.counts.valid, 3);

  // Per-gift mode: 3 separate receipt items, no merge confirmation needed
  const perGift = buildAggregationPlan(validated.validRows, { mode: 'per-gift', taxYear: 2026 });
  assert.equal(perGift.receiptItems.length, 3);
  assert.equal(perGift.mergeGroups.length, 0);
  assert.equal(perGift.requiresMergeConfirmation, false);
  assert.equal(perGift.totalAmountCents, 75100);

  // Annual mode: 2 receipt items (Priya merged into $250.00 across 2 gifts, Arjun $501.00)
  const annual = buildAggregationPlan(validated.validRows, { mode: 'annual', taxYear: 2026 });
  assert.equal(annual.receiptItems.length, 2);
  assert.equal(annual.mergeGroups.length, 1);
  assert.equal(annual.requiresMergeConfirmation, true);
  assert.equal(annual.totalAmountCents, 75100);

  const priyaGroup = annual.mergeGroups[0];
  assert.equal(priyaGroup.giftCount, 2);
  assert.equal(priyaGroup.amountCents, 25000);
  assert.equal(priyaGroup.giftDateOrYear, '2026');
});
