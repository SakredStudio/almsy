/**
 * Almsy Desk v1 — Centralized CRA & Compliance Wording
 * All user-facing CRA and receipt compliance text lives here so it can be corrected in one place.
 *
 * WORDING VERIFIED 2026-10-23 (Claude) against canada.ca:
 *  - "What information must be on an official donation receipt from a registered charity?"
 *    canada.ca/en/revenue-agency/services/charities-giving/charities/operating-a-registered-charity/
 *    issuing-receipts/what-information-must-on-official-donation-receipt-a-registered-charity.html
 *  - "Sample official donation receipts"
 *    canada.ca/en/revenue-agency/services/charities-giving/charities/sample-official-donation-receipts.html
 *  - "Computer-generated receipts" (same section)
 *
 * CRA requires, for a cash gift: a statement that it is an official receipt for income tax purposes;
 * charity name and address as on file with the CRA; registration number; unique serial number;
 * place of issue; date or year the gift was received; date the receipt was issued; donor's full name
 * (including middle initial) and address; the amount of the gift; the amount and description of any
 * advantage; the eligible amount of the gift; an authorized signature; and the name and website
 * address of the CRA (canada.ca/charities-giving). The CRA states the samples need not be copied
 * exactly, but a receipt must contain the same information.
 */

// CRA item 1: statement that it is an official receipt for income tax purposes.
// Matches the CRA sample title ("Official Donation Receipt For Income Tax Purposes").
export const CRA_OFFICIAL_STATEMENT =
  'Official donation receipt for income tax purposes';

// CRA item 13: name and website address of the Canada Revenue Agency.
// The CRA sample prints: "For information on all registered charities in Canada under the
// Income Tax Act please contact: Canada Revenue Agency www.canada.ca/charities-giving".
export const CRA_INFO_LEAD =
  'For information on all registered charities in Canada under the Income Tax Act, please contact:';
export const CRA_NAME_AND_WEBSITE =
  'Canada Revenue Agency — canada.ca/charities-giving';

// Amount block labels. Almsy v1 only issues receipts for cash gifts with NO advantage, so the
// amount received and the eligible amount are identical and the advantage is printed as none.
export const AMOUNT_RECEIVED_LABEL = 'Amount received';
export const ADVANTAGE_LABEL = 'Advantage received';
export const ADVANTAGE_NONE_TEXT = 'None';
export const ELIGIBLE_AMOUNT_LABEL = 'Eligible amount of gift for tax purposes';

// Non-registered acknowledgement statement: must clearly state it is NOT for income tax purposes
// and must never contain the phrase "official receipt".
export const ACKNOWLEDGEMENT_STATEMENT =
  'Thank-you acknowledgement — Not a tax receipt for income tax purposes.';

// Mandatory footer on every PDF and screen (AG-ALMSY.md §3)
export const ALMSY_DISCLAIMER_FOOTER =
  'Almsy formats receipts from your records. Your organization is responsible for receipt eligibility. This is not tax advice.';

// Void banner. CRA: a cancelled receipt stays in the register; the serial number is never reused.
export const VOID_RECEIPT_BANNER =
  'VOID — CANCELLED IN REGISTER (DO NOT SUBMIT FOR INCOME TAX PURPOSES)';

// Session & privacy notice (AG-ALMSY.md §4)
export const PRIVACY_SESSION_NOTICE =
  'Donor rows live in memory for the session unless you click "Save this session". Donor data never leaves this device.';

export const CRA_FIELD_LABELS = Object.freeze({
  officialStatement: 'Official Receipt Statement',
  charityName: 'Charity Legal Name (as on file with CRA)',
  charityAddress: 'Charity Address (as on file with CRA)',
  registrationNumber: 'CRA Registration Number',
  serialNumber: 'Receipt Serial Number',
  placeOfIssue: 'Place / Locality of Issue',
  giftDateOrYear: 'Date Gift Received / Tax Year',
  issueDate: 'Date Receipt Issued',
  donorFullName: 'Donor Full Name',
  donorAddress: 'Donor Address',
  amount: 'Eligible Amount of Gift (CAD)',
  authorizedSigner: 'Authorized Signer Name & Signature',
  craInfo: 'Canada Revenue Agency Reference',
});
