/**
 * Almsy Desk v1 — End-to-End Receipt Generation Run, ZIP Packaging, & Register Export
 * Uses:
 *  - lib/numbering.js (commitGeneratedRun, voidReceipt, exportRegisterCsv)
 *  - lib/receipt-model.js (buildReceiptModel)
 *  - pdf/layout.js (renderReceiptBatchPdfs, renderSingleReceiptPdf)
 *  - vendor/fflate.esm.js (zipSync)
 */

import { zipSync, strToU8 } from '../vendor/fflate.esm.js';
import { validateOrgProfile } from './org-profile.js';
import { validateRows } from './validate.js';
import { buildAggregationPlan } from './aggregate.js';
import { formatSerial, commitGeneratedRun, exportRegisterCsv } from './numbering.js';
import { buildReceiptModel } from './receipt-model.js';
import { renderReceiptBatchPdfs } from '../pdf/layout.js';

/**
 * Execute a full receipt generation run for validated donor rows:
 *  1. Validates the organization profile.
 *  2. Enforces 0 validation errors on donor rows.
 *  3. Aggregates rows (per-gift or annual consolidated).
 *  4. Allocates sequential serial numbers in IndexedDB and appends to the receipt register.
 *  5. Renders all individual Letter PDFs + 1 combined multi-page file-copy PDF.
 *  6. Packages individual PDFs + combined PDF + register CSV into a single .zip archive.
 *
 * @param {{
 *   db: ReturnType<import('./db.js').createAlmsyDb>,
 *   rows: Array<object>,
 *   issueDate?: string,
 *   runId?: string
 * }} params
 * @returns {Promise<{
 *   runId: string,
 *   elapsedMs: number,
 *   receiptCount: number,
 *   totalAmountCents: number,
 *   assignedReceipts: Array<object>,
 *   individualPdfs: Array<{ fileName: string, serialNumber: string, donorFullName: string, bytes: Uint8Array }>,
 *   combinedPdfBytes: Uint8Array,
 *   registerCsvText: string,
 *   zipBytes: Uint8Array,
 *   nextSequenceAfter: number
 * }>}
 */
export async function executeGenerationRun(params = {}) {
  const startTime = Date.now();
  const { db, rows = [] } = params;
  if (!db) throw new Error('Database instance is required');

  const rawProfile = await db.getOrgProfile();
  const profileCheck = validateOrgProfile(rawProfile);
  if (!profileCheck.ok) {
    throw new Error(`Invalid organization profile: ${profileCheck.errors.join('; ')}`);
  }
  const orgProfile = profileCheck.normalized;

  const valResult = validateRows(rows, { taxYear: orgProfile.taxYear });
  if (valResult.counts.errors > 0) {
    throw new Error(
      `Cannot generate receipts while ${valResult.counts.errors} row(s) have validation errors.`
    );
  }
  if (valResult.counts.valid === 0) {
    throw new Error('No valid donor rows available to generate receipts.');
  }

  const aggPlan = buildAggregationPlan(valResult.validRows, {
    mode: orgProfile.aggregationMode,
    taxYear: orgProfile.taxYear,
  });

  const issueDate = params.issueDate || new Date().toISOString().slice(0, 10);
  const highestSeq = await db.getHighestSequence(orgProfile.receiptPrefix);
  const startSeq = Math.max(Number(orgProfile.nextSequence) || 1, highestSeq + 1);
  const padding = Number(orgProfile.sequencePadding) || 5;

  // Build preliminary models with provisional serial numbers; commitGeneratedRun locks final serials
  const preliminaryModels = aggPlan.receiptItems.map((item, idx) =>
    buildReceiptModel({
      orgProfile,
      item,
      serialNumber: formatSerial(orgProfile.receiptPrefix, startSeq + idx, padding),
      issueDate,
    })
  );

  const committed = await commitGeneratedRun(db, {
    receiptModels: preliminaryModels,
    runId: params.runId,
  });

  const { combinedPdfBytes, individualPdfs } = await renderReceiptBatchPdfs(
    committed.assignedReceipts
  );

  const allRegisterEntries = await db.getAllRegisterEntries();
  const registerCsvText = exportRegisterCsv(allRegisterEntries);

  // Build ZIP structure (level 1 fast compression since PDFs are already compressed streams)
  const zipTree = {};
  for (const pdf of individualPdfs) {
    zipTree[`receipts/${pdf.fileName}`] = [pdf.bytes, { level: 1 }];
  }
  zipTree[`FILE_COPY_Combined_${committed.runId}.pdf`] = [combinedPdfBytes, { level: 1 }];
  zipTree[`Receipt_Register_${orgProfile.taxYear}.csv`] = [strToU8(registerCsvText), { level: 6 }];

  const zipBytes = zipSync(zipTree);
  const elapsedMs = Date.now() - startTime;

  return {
    runId: committed.runId,
    elapsedMs,
    receiptCount: committed.assignedReceipts.length,
    totalAmountCents: aggPlan.totalAmountCents,
    assignedReceipts: committed.assignedReceipts,
    individualPdfs,
    combinedPdfBytes,
    registerCsvText,
    zipBytes,
    nextSequenceAfter: committed.nextSequenceAfter,
  };
}
