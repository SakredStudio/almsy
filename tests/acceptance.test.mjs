import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from '../vendor/fflate.esm.js';
import { PDFDocument } from '../vendor/pdf-lib.esm.js';
import { createAlmsyDb, createMemoryBacking } from '../lib/db.js';
import {
  SAMPLE_OFFICIAL_CHARITY_PROFILE,
  SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
} from '../lib/org-profile.js';
import { parseCsvText } from '../lib/parse.js';
import { autoGuessMapping, applyColumnMapping } from '../lib/mapping.js';
import { validateRows } from '../lib/validate.js';
import { executeGenerationRun } from '../lib/generate-run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
const fixturesDir = path.join(appRoot, 'fixtures');

test('acceptance: sample-140.csv -> 140 numbered PDFs + combined PDF + register in under 30s, and reload continues numbering', async () => {
  const backing = createMemoryBacking();
  const db1 = createAlmsyDb({ backing });

  await db1.saveOrgProfile({
    ...SAMPLE_OFFICIAL_CHARITY_PROFILE,
    receiptPrefix: 'SGT-2026-',
    nextSequence: 1,
    aggregationMode: 'per-gift',
  });

  const csv140 = fs.readFileSync(path.join(fixturesDir, 'sample-140.csv'), 'utf8');
  const parsed = parseCsvText(csv140);
  assert.equal(parsed.rows.length, 140);

  const mapping = autoGuessMapping(parsed.headers);
  const mappedRows = applyColumnMapping(parsed.rows, mapping);

  const run = await executeGenerationRun({
    db: db1,
    rows: mappedRows,
    issueDate: '2026-10-23',
    runId: 'RUN-140',
  });

  assert.equal(run.receiptCount, 140);
  assert.equal(run.individualPdfs.length, 140);
  assert.ok(
    run.elapsedMs < 30000,
    `Expected 140-row generation in < 30000ms, took ${run.elapsedMs}ms`
  );
  assert.equal(run.assignedReceipts[0].serialNumber, 'SGT-2026-00001');
  assert.equal(run.assignedReceipts[139].serialNumber, 'SGT-2026-00140');
  assert.equal(run.nextSequenceAfter, 141);

  const combinedDoc = await PDFDocument.load(run.combinedPdfBytes);
  assert.equal(combinedDoc.getPageCount(), 140);

  const unzipped = unzipSync(run.zipBytes);
  const pdfFilesInZip = Object.keys(unzipped).filter((k) => k.startsWith('receipts/'));
  assert.equal(pdfFilesInZip.length, 140);

  // Simulate mid-way browser reload: new DB instance on same backing must continue at SGT-2026-00141
  const db2 = createAlmsyDb({ backing });
  const runAfterReload = await executeGenerationRun({
    db: db2,
    rows: [mappedRows[0]],
    issueDate: '2026-10-23',
    runId: 'RUN-141',
  });
  assert.equal(runAfterReload.assignedReceipts[0].serialNumber, 'SGT-2026-00141');
});

test('acceptance: messy.csv catches every bad row, routes out-of-scope rows to manual review, and generates cleanly after inline fixes', async () => {
  const backing = createMemoryBacking();
  const db = createAlmsyDb({ backing });
  await db.saveOrgProfile({
    ...SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
    receiptPrefix: 'BHC-2026-',
    nextSequence: 1,
    aggregationMode: 'per-gift',
  });

  const messyText = fs.readFileSync(path.join(fixturesDir, 'messy.csv'), 'utf8');
  const parsed = parseCsvText(messyText);
  assert.equal(parsed.rows.length, 12);

  const mapping = autoGuessMapping(parsed.headers);
  const mappedRows = applyColumnMapping(parsed.rows, mapping);

  // Initial validation on messy.csv:
  // - 3 out-of-scope rows (Row 9 in-kind, Row 10 split advantage, Row 11 replacement) -> manualReview
  // - 8 error rows (Row 1 & Row 8 duplicate pair, Row 2 single name, Row 3 missing street, Row 4 US zip, Row 5 $0, Row 6 European 1.250,00, Row 7 2025 date)
  // - 1 valid row (Row 12 French-formatted 1 250,00 $)
  const initialVal = validateRows(mappedRows, { taxYear: 2026 });
  assert.equal(initialVal.counts.manualReview, 3);
  assert.equal(initialVal.counts.errors, 8);
  assert.equal(initialVal.counts.valid, 1);

  // Attempting to generate before fixing inline errors MUST throw
  await assert.rejects(() => executeGenerationRun({ db, rows: mappedRows }));

  // Apply inline fixes to the error rows (just as a treasurer does in Step 3):
  // Fix Row 2 (index 1): add last name
  mappedRows[1].fullName = 'Priya M. Kapoor';
  // Fix Row 3 (index 2): add street address
  mappedRows[2].addressLine1 = '55 Queen St E';
  // Fix Row 4 (index 3): fix postal code to Canadian M5H 2N2
  mappedRows[3].postalCode = 'M5H 2N2';
  // Fix Row 5 (index 4): fix amount from $0.00 to $75.00
  mappedRows[4].amount = '$75.00';
  // Fix Row 6 (index 5): fix ambiguous amount from 1.250,00 to $1,250.00
  mappedRows[5].amount = '$1,250.00';
  // Fix Row 7 (index 6): fix date from 2025-12-28 to 2026-01-05
  mappedRows[6].date = '2026-01-05';
  // Remove accidental duplicate Row 8 (index 7)
  mappedRows.splice(7, 1);

  const afterFixVal = validateRows(mappedRows, { taxYear: 2026 });
  assert.equal(afterFixVal.counts.errors, 0);
  assert.equal(afterFixVal.counts.manualReview, 3); // 3 manual review rows remain isolated
  assert.equal(afterFixVal.counts.valid, 8); // 8 valid rows ready

  const run = await executeGenerationRun({
    db,
    rows: mappedRows,
    issueDate: '2026-10-23',
    runId: 'RUN-MESSY-FIXED',
  });

  // Only the 8 valid rows reach PDFs; the 3 manual review rows never enter generated receipts
  assert.equal(run.receiptCount, 8);
  for (const r of run.assignedReceipts) {
    assert.equal(r.receiptType, 'acknowledgement');
    assert.equal(r.registrationNumber, '');
    assert.equal(/official\s+(?:donation\s+)?receipt/i.test(JSON.stringify(r)), false);
  }
});

test('acceptance: PWA manifest and sw.js cache list reference existing relative files', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'manifest.webmanifest'), 'utf8')
  );
  assert.equal(manifest.start_url, './index.html');
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(appRoot, icon.src)));
  }

  const swSource = fs.readFileSync(path.join(appRoot, 'sw.js'), 'utf8');
  const assetMatch = swSource.match(/const APP_SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(assetMatch);
  const paths = Array.from(assetMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  for (const rel of paths) {
    if (rel === './') continue;
    assert.ok(fs.existsSync(path.join(appRoot, rel)), `Missing SW asset: ${rel}`);
  }
});
