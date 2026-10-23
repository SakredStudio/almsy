/**
 * Almsy Desk v1 — Per-Gift vs Annual Consolidated Aggregation Engine
 * Per AG-ALMSY.md §4:
 *  "Annual vs per-gift: org setting. Annual = aggregate per donor per calendar year
 *   (match on normalized name + postal code; show the merge list for the treasurer
 *   to confirm before generating)."
 */

import { normalizePostalCode, resolveDonorAddress, resolveDonorFullName } from './validate.js';
import { formatMoney } from './money.js';

/**
 * Compute a normalized donor matching key from full name + Canadian postal code.
 * Normalizes case, whitespace, and punctuation on initials so "Priya K. Sharma"
 * and "priya k sharma" at "m4w 1b7" match reliably.
 *
 * @param {object} row
 * @returns {string}
 */
export function normalizeDonorMergeKey(row) {
  const name = resolveDonorFullName(row)
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const postal = normalizePostalCode(row.postalCode || row.postal || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return `${name}|${postal}`;
}

/**
 * Build receipt items and merge confirmation list from validated rows.
 *
 * @param {Array<object>} validRows - Only rows with status === 'valid'
 * @param {{ mode?: 'per-gift'|'annual', taxYear?: number|string }} options
 * @returns {{
 *   mode: 'per-gift'|'annual',
 *   taxYear: number,
 *   receiptItems: Array<object>,
 *   mergeGroups: Array<object>,
 *   requiresMergeConfirmation: boolean,
 *   totalAmountCents: number
 * }}
 */
export function buildAggregationPlan(validRows = [], options = {}) {
  const mode = options.mode === 'annual' ? 'annual' : 'per-gift';
  const taxYear = Number(options.taxYear || new Date().getFullYear());

  // Defensive guard: never allow non-valid rows into aggregation
  const cleanRows = validRows.filter((r) => r && r.status === 'valid' && r.amountCents > 0);

  if (mode === 'per-gift') {
    let totalAmountCents = 0;
    const receiptItems = cleanRows.map((r) => {
      totalAmountCents += r.amountCents;
      const donorFullName = resolveDonorFullName(r);
      const donorAddress = r.donorAddress || resolveDonorAddress(r);
      return {
        itemId: r.id,
        sourceRowIds: [r.id],
        donorFullName,
        donorAddress,
        addressLine1: r.addressLine1,
        city: r.city,
        province: r.province,
        postalCode: normalizePostalCode(r.postalCode),
        amountCents: r.amountCents,
        amountFormatted: formatMoney(r.amountCents),
        giftDateOrYear: r.isoDate,
        method: r.method || 'Cash',
        giftCount: 1,
        gifts: [
          {
            id: r.id,
            isoDate: r.isoDate,
            amountCents: r.amountCents,
            method: r.method || 'Cash',
          },
        ],
      };
    });

    return {
      mode: 'per-gift',
      taxYear,
      receiptItems,
      mergeGroups: [],
      requiresMergeConfirmation: false,
      totalAmountCents,
    };
  }

  // Annual mode: group by normalizeDonorMergeKey(row)
  const groupsMap = new Map();
  for (const r of cleanRows) {
    const key = normalizeDonorMergeKey(r);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(r);
  }

  const receiptItems = [];
  const mergeGroups = [];
  let totalAmountCents = 0;

  for (const [mergeKey, groupRows] of groupsMap.entries()) {
    const first = groupRows[0];
    const donorFullName = resolveDonorFullName(first);
    const postalCode = normalizePostalCode(first.postalCode);
    const donorAddress = first.donorAddress || resolveDonorAddress(first);

    let groupSumCents = 0;
    const gifts = groupRows.map((g) => {
      groupSumCents += g.amountCents;
      return {
        id: g.id,
        rowIndex: g.rowIndex,
        isoDate: g.isoDate,
        amountCents: g.amountCents,
        amountFormatted: formatMoney(g.amountCents),
        method: g.method || 'Cash',
      };
    });

    totalAmountCents += groupSumCents;
    const methodsSet = Array.from(new Set(groupRows.map((g) => g.method || 'Cash')));
    const giftDateOrYear = groupRows.length > 1 ? String(taxYear) : first.isoDate;

    const item = {
      itemId: `annual-${first.id}`,
      mergeKey,
      sourceRowIds: groupRows.map((g) => g.id),
      donorFullName,
      donorAddress,
      addressLine1: first.addressLine1,
      city: first.city,
      province: first.province,
      postalCode,
      amountCents: groupSumCents,
      amountFormatted: formatMoney(groupSumCents),
      giftDateOrYear,
      method: methodsSet.join(', '),
      giftCount: groupRows.length,
      gifts,
    };

    receiptItems.push(item);
    if (groupRows.length > 1) {
      mergeGroups.push(item);
    }
  }

  return {
    mode: 'annual',
    taxYear,
    receiptItems,
    mergeGroups,
    requiresMergeConfirmation: mergeGroups.length > 0,
    totalAmountCents,
  };
}
