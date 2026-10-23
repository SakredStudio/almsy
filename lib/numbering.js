/**
 * Almsy Desk v1 — Sequential Receipt Numbering & Register Management
 * Rules (AG-ALMSY.md §4):
 *  - Prefix + zero-padded sequence (e.g. SGT-2026-00001), stored in IndexedDB
 *  - Incremented ONLY when a receipt is actually generated
 *  - Never reused, never decremented
 *  - A "Void" action marks a number VOID in the register; it is never reused
 */

import { formatMoney } from './money.js';

/**
 * Format a serial number from prefix, sequence integer, and zero-padding width.
 * @param {string} prefix
 * @param {number} sequenceNumber
 * @param {number} [padding=5]
 * @returns {string}
 */
export function formatSerial(prefix, sequenceNumber, padding = 5) {
  const cleanPrefix = String(prefix ?? '').trim();
  if (!cleanPrefix) {
    throw new Error('Receipt prefix is required');
  }
  const seq = Number(sequenceNumber);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Invalid receipt sequence number: ${sequenceNumber}`);
  }
  const pad = Math.max(3, Math.min(8, Number(padding) || 5));
  return `${cleanPrefix}${String(seq).padStart(pad, '0')}`;
}

/**
 * Allocate and commit a batch of generated receipts to the register in IndexedDB,
 * advancing nextSequence atomically so numbers are never reused or decremented.
 *
 * @param {ReturnType<import('./db.js').createAlmsyDb>} db
 * @param {{
 *   receiptModels: Array<object>,
 *   runId?: string,
 *   createdAt?: string
 * }} params
 * @returns {Promise<{
 *   runId: string,
 *   assignedReceipts: Array<object>,
 *   registerEntries: Array<object>,
 *   nextSequenceAfter: number
 * }>}
 */
export async function commitGeneratedRun(db, params = {}) {
  const { receiptModels = [] } = params;
  if (!Array.isArray(receiptModels) || receiptModels.length === 0) {
    throw new Error('No receipts provided to commitGeneratedRun');
  }

  const profile = await db.getOrgProfile();
  const prefix = String(profile.receiptPrefix || `ALM-${new Date().getFullYear()}-`).trim();
  const padding = Number(profile.sequencePadding) || 5;

  const existingEntries = await db.getAllRegisterEntries();
  const usedSerials = new Set(existingEntries.map((e) => e.serialNumber));
  const highestSeq = await db.getHighestSequence(prefix);

  let currentSeq = Math.max(Number(profile.nextSequence) || 1, highestSeq + 1);
  const runId = params.runId || `RUN-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const createdAt = params.createdAt || new Date().toISOString();

  const assignedReceipts = [];
  const registerEntries = [];

  for (const model of receiptModels) {
    // Advance until we find an unused serial number (defensive against any prior manual prefix jump)
    let serialNumber = formatSerial(prefix, currentSeq, padding);
    while (usedSerials.has(serialNumber)) {
      currentSeq++;
      serialNumber = formatSerial(prefix, currentSeq, padding);
    }

    usedSerials.add(serialNumber);
    const seqUsed = currentSeq;
    currentSeq++;

    const assignedModel = {
      ...model,
      serialNumber,
      sequenceNumber: seqUsed,
      runId,
    };
    assignedReceipts.push(assignedModel);

    registerEntries.push({
      serialNumber,
      prefix,
      sequenceNumber: seqUsed,
      donorName: assignedModel.donorFullName,
      donorAddress: assignedModel.donorAddress,
      amountCents: assignedModel.amountCents,
      amountFormatted: assignedModel.amountFormatted || formatMoney(assignedModel.amountCents),
      giftDateOrYear: assignedModel.giftDateOrYear,
      issueDate: assignedModel.issueDate,
      placeOfIssue: assignedModel.placeOfIssue,
      receiptType: assignedModel.receiptType,
      paymentMethod: assignedModel.paymentMethod || 'Cash',
      // Snapshot of everything needed to re-render this exact receipt later (images excluded:
      // the current profile's logo/signature are used on re-render to keep the register small).
      receiptSnapshot: {
        aggregationMode: assignedModel.aggregationMode || 'per-gift',
        giftCount: Number(assignedModel.giftCount) || 1,
        gifts: Array.isArray(assignedModel.gifts) ? assignedModel.gifts : [],
        charityName: assignedModel.charityName,
        charityAddress: assignedModel.charityAddress,
        registrationNumber: assignedModel.registrationNumber || '',
        authorizedSignerName: assignedModel.authorizedSignerName,
        authorizedSignerTitle: assignedModel.authorizedSignerTitle || '',
        includeDuplicateStub: Boolean(assignedModel.includeDuplicateStub),
      },
      status: 'ISSUED',
      voidReason: '',
      voidedAt: null,
      runId,
      createdAt,
    });
  }

  await db.appendRegisterEntries(registerEntries);
  const updatedProfile = await db.saveOrgProfile({
    nextSequence: currentSeq,
  });

  return {
    runId,
    assignedReceipts,
    registerEntries,
    nextSequenceAfter: updatedProfile.nextSequence,
  };
}

/**
 * Mark an issued receipt as VOID in the register.
 * Never decrements nextSequence and never deletes the record so the number can never be reused.
 *
 * @param {ReturnType<import('./db.js').createAlmsyDb>} db
 * @param {string} serialNumber
 * @param {string} [reason='Voided by treasurer']
 * @returns {Promise<object>}
 */
export async function voidReceipt(db, serialNumber, reason = 'Voided by treasurer') {
  if (!serialNumber) {
    throw new Error('Serial number is required to void a receipt');
  }
  const voidedAt = new Date().toISOString();
  const updated = await db.updateRegisterEntry(serialNumber, {
    status: 'VOID',
    voidReason: String(reason || 'Voided by treasurer').trim(),
    voidedAt,
  });
  return updated;
}

function csvCell(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export register entries as RFC-4180 CSV text.
 * @param {Array<object>} entries
 * @returns {string}
 */
export function exportRegisterCsv(entries = []) {
  const headers = [
    'Serial Number',
    'Sequence',
    'Receipt Type',
    'Status',
    'Donor Full Name',
    'Donor Address',
    'Amount (CAD)',
    'Amount Cents',
    'Gift Date / Year',
    'Issue Date',
    'Place of Issue',
    'Payment Method',
    'Run ID',
    'Created At',
    'Void Reason',
    'Voided At',
  ];

  const sorted = [...entries].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
  const lines = [
    headers.map(csvCell).join(','),
    ...sorted.map((e) =>
      [
        e.serialNumber,
        e.sequenceNumber,
        e.receiptType,
        e.status,
        e.donorName,
        e.donorAddress,
        e.amountFormatted || (Number.isInteger(e.amountCents) ? formatMoney(e.amountCents) : ''),
        e.amountCents,
        e.giftDateOrYear,
        e.issueDate,
        e.placeOfIssue,
        e.paymentMethod || '',
        e.runId,
        e.createdAt,
        e.voidReason || '',
        e.voidedAt || '',
      ]
        .map(csvCell)
        .join(',')
    ),
  ];

  return lines.join('\n') + '\n';
}
