import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_OFFICIAL_CHARITY_PROFILE,
  SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
} from '../lib/org-profile.js';
import {
  MANDATORY_OFFICIAL_RECEIPT_FIELDS,
  buildReceiptModel,
  assertValidReceiptModel,
} from '../lib/receipt-model.js';
import { renderSingleReceiptPdf } from '../pdf/layout.js';

const validItem = {
  donorFullName: 'Priya K. Sharma',
  donorAddress: '120 Bloor St E, Toronto, ON M4W 1B7',
  amountCents: 25000,
  giftDateOrYear: '2026-04-15',
  method: 'e-Transfer',
};

test('receipt-model: official receipt missing any mandatory CRA §3 field throws', () => {
  const baseModel = buildReceiptModel({
    orgProfile: SAMPLE_OFFICIAL_CHARITY_PROFILE,
    item: validItem,
    serialNumber: 'SGT-2026-00001',
    issueDate: '2026-10-23',
  });

  // Verify every single mandatory field is present and non-empty
  for (const field of MANDATORY_OFFICIAL_RECEIPT_FIELDS) {
    assert.ok(baseModel[field], `Expected field ${field} to be present`);
    const broken = { ...baseModel, [field]: '' };
    assert.throws(
      () => assertValidReceiptModel(broken),
      new RegExp(field),
      `Expected missing "${field}" on official receipt to throw`
    );
  }
});

test('receipt-model: acknowledgement never contains a registration number or "official receipt" phrase', () => {
  const ackModel = buildReceiptModel({
    orgProfile: {
      ...SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
      registrationNumber: '842910374RR0001', // Even if passed accidentally, must be stripped
    },
    item: validItem,
    serialNumber: 'BHC-2026-00001',
    issueDate: '2026-10-23',
  });

  assert.equal(ackModel.receiptType, 'acknowledgement');
  assert.equal(ackModel.registrationNumber, '');
  assert.equal(ackModel.officialStatement, '');

  const serialized = JSON.stringify(ackModel);
  assert.equal(/\d{9}RR\d{4}/i.test(serialized), false);
  assert.equal(/official\s+(?:donation\s+)?receipt/i.test(serialized), false);

  // Also verify assertValidReceiptModel throws if someone injects a reg number or "official receipt" into an acknowledgement
  assert.throws(() =>
    assertValidReceiptModel({
      ...ackModel,
      registrationNumber: '842910374RR0001',
    })
  );
  assert.throws(() =>
    assertValidReceiptModel({
      ...ackModel,
      acknowledgementStatement: 'This is an official receipt for tax purposes',
    })
  );
});

test('pdf/layout: renders valid Letter PDFs for both official (with duplicate stub) and acknowledgement models', async () => {
  const officialModel = buildReceiptModel({
    orgProfile: { ...SAMPLE_OFFICIAL_CHARITY_PROFILE, includeDuplicateStub: true },
    item: validItem,
    serialNumber: 'SGT-2026-00001',
    issueDate: '2026-10-23',
  });
  const officialPdf = await renderSingleReceiptPdf(officialModel);
  assert.ok(officialPdf instanceof Uint8Array);
  assert.ok(officialPdf.length > 10000);
  assert.equal(Buffer.from(officialPdf.slice(0, 5)).toString('ascii'), '%PDF-');

  const ackModel = buildReceiptModel({
    orgProfile: SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
    item: validItem,
    serialNumber: 'BHC-2026-00001',
    issueDate: '2026-10-23',
  });
  const ackPdf = await renderSingleReceiptPdf(ackModel);
  assert.ok(ackPdf instanceof Uint8Array);
  assert.equal(Buffer.from(ackPdf.slice(0, 5)).toString('ascii'), '%PDF-');
});
