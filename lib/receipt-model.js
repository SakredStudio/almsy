/**
 * Almsy Desk v1 — Receipt Domain Model & Strict CRA §3 Field Enforcement
 *
 * Every CRA-mandated field in AG-ALMSY.md §3 is represented as an explicit named property:
 *  1. officialStatement       (Official receipt statement for income tax purposes)
 *  2. charityName             (Charity's legal name as on file with CRA)
 *     charityAddress          (Charity's address as on file with CRA)
 *  3. registrationNumber      (Charity's CRA registration number ^\d{9}RR\d{4}$)
 *  4. serialNumber            (Unique sequential receipt serial number)
 *  5. placeOfIssue            (Place or locality where the receipt was issued)
 *  6. giftDateOrYear          (Date the gift was received, or calendar year for annual receipts)
 *  7. issueDate               (Date the receipt was issued)
 *  8. donorFullName           (Donor's full name)
 *     donorAddress            (Donor's full address)
 *  9. amountCents             (Amount of the gift in integer cents)
 *     amountFormatted         (Formatted CAD currency string)
 * 10. authorizedSignerName    (Name of individual authorized by the charity)
 *     signatureDataUrl        (Authorized signature image data URL)
 * 11. craNameAndWebsite       (Constant: "Canada Revenue Agency — canada.ca/charities-giving")
 *
 * Plus:
 *  - disclaimerFooter         (Mandatory footer on every PDF and screen)
 */

import {
  CRA_OFFICIAL_STATEMENT,
  CRA_NAME_AND_WEBSITE,
  ACKNOWLEDGEMENT_STATEMENT,
  ALMSY_DISCLAIMER_FOOTER,
} from './cra-text.js';
import { formatMoney } from './money.js';
import { isValidRegistrationNumber } from './validate.js';

/**
 * The 14 named fields representing the 11 CRA requirements in AG-ALMSY.md §3.
 * Any official receipt missing any of these throws immediately.
 */
export const MANDATORY_OFFICIAL_RECEIPT_FIELDS = Object.freeze([
  'officialStatement',
  'charityName',
  'charityAddress',
  'registrationNumber',
  'serialNumber',
  'placeOfIssue',
  'giftDateOrYear',
  'issueDate',
  'donorFullName',
  'donorAddress',
  'amountCents',
  'amountFormatted',
  'authorizedSignerName',
  'signatureDataUrl',
  'craNameAndWebsite',
]);

/**
 * Build a validated receipt model from an organization profile and a donor receipt item.
 *
 * @param {{
 *   orgProfile: object,
 *   item: object,
 *   serialNumber: string,
 *   issueDate?: string
 * }} params
 * @returns {object}
 */
export function buildReceiptModel(params = {}) {
  const { orgProfile = {}, item = {}, serialNumber } = params;
  const receiptType =
    orgProfile.receiptType === 'acknowledgement' ? 'acknowledgement' : 'official';
  const issueDate = String(params.issueDate || new Date().toISOString().slice(0, 10)).trim();

  const amountCents = Number(item.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Invalid receipt amountCents: ${item.amountCents}`);
  }
  const amountFormatted = formatMoney(amountCents);

  const model = {
    receiptType,
    // 1. Statement
    officialStatement: receiptType === 'official' ? CRA_OFFICIAL_STATEMENT : '',
    acknowledgementStatement: receiptType === 'acknowledgement' ? ACKNOWLEDGEMENT_STATEMENT : '',
    bannerStatement:
      receiptType === 'official' ? CRA_OFFICIAL_STATEMENT : ACKNOWLEDGEMENT_STATEMENT,
    // 2. Charity / Org Name & Address
    charityName: String(orgProfile.legalName || '').trim(),
    charityAddress: String(orgProfile.address || '').trim(),
    // 3. CRA Registration Number (strictly empty on acknowledgement)
    registrationNumber:
      receiptType === 'official' ? String(orgProfile.registrationNumber || '').trim() : '',
    // 4. Serial Number
    serialNumber: String(serialNumber || item.serialNumber || '').trim(),
    // 5. Place of Issue
    placeOfIssue: String(orgProfile.placeOfIssue || '').trim(),
    // 6. Date Gift Received or Year for Annual Receipts
    giftDateOrYear: String(item.giftDateOrYear || item.isoDate || '').trim(),
    // 7. Date Receipt Issued
    issueDate,
    // 8. Donor Full Name & Address
    donorFullName: String(item.donorFullName || item.fullName || '').trim(),
    donorAddress: String(item.donorAddress || '').trim(),
    // 9. Amount of Gift. Almsy v1 issues receipts only for cash gifts with no advantage, so the
    //    amount received equals the eligible amount and the advantage is always zero.
    amountCents,
    amountFormatted,
    advantageCents: 0,
    eligibleAmountCents: amountCents,
    // 10. Authorized Signer Name & Signature
    authorizedSignerName: String(orgProfile.authorizedSignerName || '').trim(),
    authorizedSignerTitle: String(orgProfile.authorizedSignerTitle || '').trim(),
    signatureDataUrl: String(orgProfile.signatureDataUrl || '').trim(),
    // 11. CRA Name and Website (constant on official receipts; empty on acknowledgement)
    craNameAndWebsite: receiptType === 'official' ? CRA_NAME_AND_WEBSITE : '',
    // Additional metadata
    logoDataUrl: String(orgProfile.logoDataUrl || '').trim(),
    paymentMethod: String(item.method || 'Cash').trim(),
    aggregationMode: orgProfile.aggregationMode === 'annual' ? 'annual' : 'per-gift',
    giftCount: Number(item.giftCount) || 1,
    gifts: Array.isArray(item.gifts) ? item.gifts : [],
    includeDuplicateStub: Boolean(orgProfile.includeDuplicateStub),
    status: item.status || 'ISSUED',
    disclaimerFooter: ALMSY_DISCLAIMER_FOOTER,
  };

  assertValidReceiptModel(model);
  return model;
}

/**
 * Validate a built receipt model.
 * Throws if:
 *  - An official receipt is missing any mandatory §3 field or has an invalid CRA reg number.
 *  - An acknowledgement contains a registration number or the "official receipt" phrase.
 *
 * @param {object} model
 */
export function assertValidReceiptModel(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('Receipt model must be an object');
  }

  if (model.receiptType === 'official') {
    for (const field of MANDATORY_OFFICIAL_RECEIPT_FIELDS) {
      const val = model[field];
      if (val === undefined || val === null || val === '') {
        throw new Error(`Official receipt is missing mandatory CRA §3 field: "${field}"`);
      }
    }
    if (!isValidRegistrationNumber(model.registrationNumber)) {
      throw new Error(
        `Official receipt has invalid CRA registration number: "${model.registrationNumber}"`
      );
    }
    if (model.amountCents <= 0) {
      throw new Error('Official receipt amountCents must be > 0');
    }
    if (Number(model.advantageCents || 0) !== 0) {
      throw new Error('Official receipts with an advantage are out of scope (manual review)');
    }
  } else if (model.receiptType === 'acknowledgement') {
    // Non-registered acknowledgement rules:
    // 1. Must never contain a registration number
    if (model.registrationNumber) {
      throw new Error('Acknowledgement receipt must never contain a CRA registration number');
    }
    if (model.officialStatement) {
      throw new Error('Acknowledgement receipt must not carry officialStatement');
    }
    // 2. Must never contain a CRA registration number pattern or "official receipt" phrase anywhere in its serialized fields
    const serialized = JSON.stringify(model);
    if (/\d{9}RR\d{4}/i.test(serialized)) {
      throw new Error('Acknowledgement receipt contains a CRA registration number pattern');
    }
    if (/official\s+(?:donation\s+)?receipt/i.test(serialized)) {
      throw new Error('Acknowledgement receipt must never contain "official receipt" phrase');
    }
    // Basic required fields for acknowledgement
    const ackRequired = [
      'acknowledgementStatement',
      'charityName',
      'charityAddress',
      'serialNumber',
      'placeOfIssue',
      'giftDateOrYear',
      'issueDate',
      'donorFullName',
      'donorAddress',
      'amountFormatted',
      'authorizedSignerName',
    ];
    for (const f of ackRequired) {
      if (!model[f]) {
        throw new Error(`Acknowledgement is missing required field: "${f}"`);
      }
    }
  } else {
    throw new Error(`Unknown receiptType: "${model.receiptType}"`);
  }
}
