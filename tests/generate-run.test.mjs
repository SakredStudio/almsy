import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from '../vendor/fflate.esm.js';
import { PDFDocument } from '../vendor/pdf-lib.esm.js';
import { createAlmsyDb, createMemoryBacking } from '../lib/db.js';
import { SAMPLE_OFFICIAL_CHARITY_PROFILE } from '../lib/org-profile.js';
import { executeGenerationRun } from '../lib/generate-run.js';
import { voidReceipt } from '../lib/numbering.js';

test('generate-run: produces numbered PDFs, combined file-copy PDF, register CSV, and valid ZIP archive', async () => {
  const backing = createMemoryBacking();
  const db = createAlmsyDb({ backing });

  await db.saveOrgProfile({
    ...SAMPLE_OFFICIAL_CHARITY_PROFILE,
    receiptPrefix: 'SGT-2026-',
    nextSequence: 1,
    aggregationMode: 'per-gift',
  });

  const rows = [
    {
      id: 'r1',
      fullName: 'Priya K. Sharma',
      addressLine1: '120 Bloor St E',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M4W 1B7',
      amount: '$250.00',
      date: '2026-04-15',
      method: 'e-Transfer',
    },
    {
      id: 'r2',
      fullName: 'Arjun S. Patel',
      addressLine1: '85 Bovaird Dr E',
      city: 'Brampton',
      province: 'ON',
      postalCode: 'L6V 1A4',
      amount: '$501.00',
      date: '2026-05-10',
      method: 'Cheque',
    },
  ];

  const run = await executeGenerationRun({
    db,
    rows,
    issueDate: '2026-10-23',
    runId: 'RUN-TEST-1',
  });

  assert.equal(run.receiptCount, 2);
  assert.equal(run.totalAmountCents, 75100);
  assert.equal(run.nextSequenceAfter, 3);
  assert.equal(run.individualPdfs.length, 2);
  assert.ok(run.combinedPdfBytes.length > 10000);
  assert.ok(run.zipBytes.length > 10000);

  // Verify combined PDF has 2 pages
  const combinedDoc = await PDFDocument.load(run.combinedPdfBytes);
  assert.equal(combinedDoc.getPageCount(), 2);

  // Verify ZIP contains both individual PDFs + combined file copy + register CSV
  const unzipped = unzipSync(run.zipBytes);
  const zipKeys = Object.keys(unzipped);
  assert.ok(zipKeys.some((k) => k.startsWith('receipts/SGT-2026-00001_')));
  assert.ok(zipKeys.some((k) => k.startsWith('receipts/SGT-2026-00002_')));
  assert.ok(zipKeys.includes('FILE_COPY_Combined_RUN-TEST-1.pdf'));
  assert.ok(zipKeys.includes('Receipt_Register_2026.csv'));

  // Void SGT-2026-00001 and run a second batch -> must start at SGT-2026-00003
  await voidReceipt(db, 'SGT-2026-00001', 'Typo in address');
  const run2 = await executeGenerationRun({
    db,
    rows: [rows[0]],
    issueDate: '2026-10-23',
    runId: 'RUN-TEST-2',
  });
  assert.equal(run2.assignedReceipts[0].serialNumber, 'SGT-2026-00003');
});

test('generate-run: blocks generation if any row has validation errors', async () => {
  const db = createAlmsyDb({ backing: createMemoryBacking() });
  await db.saveOrgProfile(SAMPLE_OFFICIAL_CHARITY_PROFILE);

  await assert.rejects(
    () =>
      executeGenerationRun({
        db,
        rows: [
          {
            id: 'bad-1',
            fullName: 'SingleNameOnly',
            addressLine1: '',
            postalCode: '90210',
            amount: '0',
            date: '2025-01-01',
          },
        ],
      }),
    /validation errors/i
  );
});
