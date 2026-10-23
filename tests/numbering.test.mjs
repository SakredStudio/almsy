import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlmsyDb, createMemoryBacking } from '../lib/db.js';
import { SAMPLE_OFFICIAL_CHARITY_PROFILE } from '../lib/org-profile.js';
import { buildReceiptModel } from '../lib/receipt-model.js';
import {
  formatSerial,
  commitGeneratedRun,
  voidReceipt,
  exportRegisterCsv,
} from '../lib/numbering.js';

const sampleDonorItem = {
  donorFullName: 'Priya K. Sharma',
  donorAddress: '120 Bloor St E, Toronto, ON M4W 1B7',
  amountCents: 25000,
  giftDateOrYear: '2026-04-15',
  method: 'e-Transfer',
};

test('numbering: allocates sequential numbers, never reuses after void, and persists across simulated reload', async () => {
  const backing = createMemoryBacking();
  const db1 = createAlmsyDb({ backing });

  await db1.saveOrgProfile({
    ...SAMPLE_OFFICIAL_CHARITY_PROFILE,
    receiptPrefix: 'SGT-2026-',
    nextSequence: 1,
  });

  const profile1 = await db1.getOrgProfile();
  const modelsBatch1 = [
    buildReceiptModel({
      orgProfile: profile1,
      item: sampleDonorItem,
      serialNumber: formatSerial('SGT-2026-', 1, 5),
      issueDate: '2026-10-23',
    }),
    buildReceiptModel({
      orgProfile: profile1,
      item: { ...sampleDonorItem, donorFullName: 'Arjun S. Patel', amountCents: 50100 },
      serialNumber: formatSerial('SGT-2026-', 2, 5),
      issueDate: '2026-10-23',
    }),
  ];

  const run1 = await commitGeneratedRun(db1, {
    receiptModels: modelsBatch1,
    runId: 'RUN-001',
  });

  assert.equal(run1.assignedReceipts[0].serialNumber, 'SGT-2026-00001');
  assert.equal(run1.assignedReceipts[1].serialNumber, 'SGT-2026-00002');
  assert.equal(run1.nextSequenceAfter, 3);

  // Void SGT-2026-00002 -> must mark status VOID and NEVER decrement nextSequence or allow reuse
  const voided = await voidReceipt(db1, 'SGT-2026-00002', 'Incorrect donor amount');
  assert.equal(voided.status, 'VOID');
  assert.equal(voided.voidReason, 'Incorrect donor amount');

  // Simulate reload with a fresh DB instance on the same backing
  const db2 = createAlmsyDb({ backing });
  const profileAfterReload = await db2.getOrgProfile();
  assert.equal(profileAfterReload.nextSequence, 3);

  // Next run must start at SGT-2026-00003 (never reusing voided SGT-2026-00002)
  const modelsBatch2 = [
    buildReceiptModel({
      orgProfile: profileAfterReload,
      item: { ...sampleDonorItem, donorFullName: 'Meera V. Nair', amountCents: 15000 },
      serialNumber: formatSerial('SGT-2026-', 3, 5),
      issueDate: '2026-10-23',
    }),
  ];

  const run2 = await commitGeneratedRun(db2, {
    receiptModels: modelsBatch2,
    runId: 'RUN-002',
  });

  assert.equal(run2.assignedReceipts[0].serialNumber, 'SGT-2026-00003');
  assert.equal(run2.nextSequenceAfter, 4);

  const allEntries = await db2.getAllRegisterEntries();
  assert.equal(allEntries.length, 3);

  const csv = exportRegisterCsv(allEntries);
  assert.ok(csv.includes('SGT-2026-00001'));
  assert.ok(csv.includes('SGT-2026-00002,2,official,VOID'));
  assert.ok(csv.includes('SGT-2026-00003,3,official,ISSUED'));
});

test('numbering: register entries carry a re-render snapshot and the CSV has a Payment Method column', async () => {
  const backing = createMemoryBacking();
  const db = createAlmsyDb({ backing });
  await db.saveOrgProfile({ ...SAMPLE_OFFICIAL_CHARITY_PROFILE, receiptPrefix: 'SNP-2026-', nextSequence: 1 });

  const model = buildReceiptModel({
    orgProfile: { ...SAMPLE_OFFICIAL_CHARITY_PROFILE, aggregationMode: 'annual' },
    item: { ...sampleDonorItem, giftDateOrYear: '2026', giftCount: 2, gifts: [{ isoDate: '2026-01-01', amountCents: 10000 }, { isoDate: '2026-02-01', amountCents: 15000 }] },
    serialNumber: 'SNP-2026-00001',
    issueDate: '2026-10-23',
  });
  const res = await commitGeneratedRun(db, { receiptModels: [model], runId: 'RUN-SNAP' });
  const entry = res.registerEntries[0];
  assert.equal(entry.paymentMethod, 'e-Transfer');
  assert.equal(entry.receiptSnapshot.giftCount, 2);
  assert.equal(entry.receiptSnapshot.gifts.length, 2);
  assert.equal(entry.receiptSnapshot.charityName, SAMPLE_OFFICIAL_CHARITY_PROFILE.legalName);
  assert.equal(entry.receiptSnapshot.registrationNumber, SAMPLE_OFFICIAL_CHARITY_PROFILE.registrationNumber);
  assert.equal(entry.receiptSnapshot.authorizedSignerName, SAMPLE_OFFICIAL_CHARITY_PROFILE.authorizedSignerName);

  const csv = exportRegisterCsv(await db.getAllRegisterEntries());
  const [header, first] = csv.trim().split('\n');
  assert.ok(header.split(',').includes('Payment Method'));
  assert.ok(first.includes('e-Transfer'));
});
