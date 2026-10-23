/**
 * Almsy Desk v1 — Centralized CRA & Compliance Wording
 * All user-facing CRA and receipt compliance text lives here so Claude can verify
 * exact wording against canada.ca in one place before release.
 */

// VERIFY WORDING — CRA §3 item 1: Statement that it is an official receipt for income tax purposes
export const CRA_OFFICIAL_STATEMENT =
  'Official donation receipt for income tax purposes';

// VERIFY WORDING — CRA §3 item 11: Name and website of the Canada Revenue Agency
export const CRA_NAME_AND_WEBSITE =
  'Canada Revenue Agency — canada.ca/charities-giving'; // VERIFY WORDING

// VERIFY WORDING — Non-registered acknowledgement statement (must clearly state NOT for income tax purposes and never contain "official receipt")
export const ACKNOWLEDGEMENT_STATEMENT =
  'Thank-you acknowledgement — Not a tax receipt for income tax purposes.';

// VERIFY WORDING — Mandatory footer on every PDF and screen (§3)
export const ALMSY_DISCLAIMER_FOOTER =
  'Almsy formats receipts from your records. Your organization is responsible for receipt eligibility. This is not tax advice.';

// VERIFY WORDING — Void watermark and note
export const VOID_RECEIPT_BANNER =
  'VOID — CANCELLED IN REGISTER (DO NOT SUBMIT FOR INCOME TAX PURPOSES)';

// Session & privacy notice (§4)
export const PRIVACY_SESSION_NOTICE =
  'Donor rows live in memory for the session unless you click "Save this session". Donor data never leaves this computer.';

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
