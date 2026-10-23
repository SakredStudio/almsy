/**
 * Almsy Desk v1 — Organization Profile Validation, Import/Export & Sample Presets
 * Supports both receipt types:
 *  - 'official' (registered charity with CRA registration number ^\d{9}RR\d{4}$)
 *  - 'acknowledgement' (non-registered club, temple, community group — no registration number allowed)
 */

import { DEFAULT_ORG_PROFILE } from './db.js';
import { isValidRegistrationNumber, normalizeRegistrationNumber } from './validate.js';

export const SAMPLE_LOGO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAByklEQVR4nO3YsVEDQQyFYVdCB2R0QTPUQ5kEEMIQ4uHOJ+lpn1Z6mlFo3+43/znw7abRaE7m+fX9m32G0vMLFF32HZYOAmwk6Aq4lpAMuBaQbLRtIdGX/vr8mAMZQfJuC8SVYGhQtp0JLxMuAlkeLwLx9PK2BLIkngXJu0jIrfAiaF7MEohRvAw4CyQVsTocEnI8XjlEDx4T7irkEsDd8aiInleXDWVFTH2VO+F5EYXHQuyK50FUfasr7I6XWqGlPjZABmK4win1pVQ4rT54hdPqg1c4sT5rhQLMApz6+2cFPEScjAepUIACFCB7BShAAW69bkDhCZGLJ0ABCrDCClCAAtx6UwCnIIb/D5xeYag+AS4G7Ib43/2ggN0rhPz+Ta0QVt/UCqH1TasQXp+nwl0RLXhmwAkVptU3ocL0+jojLsN7BLgjohUvDOipsCri0VlT8bogUvEeAZ4hsiHPzpX+6u6OWArvKmIFyAhcKh4KMQvy0TNL4CEREZhXn1EKz4JogTzCjXz+6hmX41kRo5BZcFQ8D2I2pPUsbLs/Yz08AtT7TLbV4XgvdIaL/k620aVBX3oM3P2w0baFux/BgUZw4BFY8gio+fwAyTjCwFIGRY8AAAAASUVORK5CYII=';

export const SAMPLE_SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAAA4CAYAAACWj5YVAAABi0lEQVR4nO3bzW3DMAwGUK/RITJJJ+lKnaP7pVejqOFYFiVSeQ/wNRQlfv45ZNsAAAAAAAAAAAAAIIGPx9dzf81eDyzpb9AEDwKcBW2F4K3cG4VcDVu1wVy9Pwq5MmgVh7I1bJV6pIjWwaowkC0BEjzC3B2mzMPYIyyCRzc9hyfbIPYOx8zgZdrX6are+SLWm2UPIs9jVPCqzlWI6h/akeub3fuo/Y8484qzFOZKyDJv1uhhjKpxVnfkq17L+VeeoVB3g5Zt02bc/aPqHNUcUe+o9mrzMkyPzci2iTPv/qNqRda5uhYhe1HvzciwsTPqjn6aRtVoJWQnojdk1kZned2q9NsEmXHnebfXrYg1ZOiLC2Y/4kfUzDSUPXvN1BcHMr5LR9bPOJR3e/XdU0DGoJ2tMdvv9dS6tsw9sZM5aHu91pa1v71XzyL7mfGPSgd2Z8Aq9bn5MyiZvDpw1QdT2EjjnZ4AK/ZEUauHDVISNAAAAAAAACp4fH7/uFyzrtnzDwAAAAAAAAAAQGq/PQBE+FMN/L8AAAAASUVORK5CYII=';

export const SAMPLE_OFFICIAL_CHARITY_PROFILE = Object.freeze({
  ...DEFAULT_ORG_PROFILE,
  receiptType: 'official',
  legalName: 'Sri Ganesha Cultural & Charitable Foundation',
  address: '2400 Markham Rd, Scarborough, ON M1B 2W6',
  registrationNumber: '842910374RR0001',
  placeOfIssue: 'Toronto, ON',
  authorizedSignerName: 'Ramesh Subramanian',
  authorizedSignerTitle: 'Honorary Treasurer',
  signatureDataUrl: SAMPLE_SIGNATURE_DATA_URL,
  logoDataUrl: SAMPLE_LOGO_DATA_URL,
  receiptPrefix: 'SGT-2026-',
  nextSequence: 1,
  sequencePadding: 5,
  aggregationMode: 'per-gift',
  taxYear: 2026,
  includeDuplicateStub: false,
});

export const SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE = Object.freeze({
  ...DEFAULT_ORG_PROFILE,
  receiptType: 'acknowledgement',
  legalName: 'Brampton Heritage Youth Cricket & Cultural Club',
  address: '85 Bovaird Dr E, Brampton, ON L6V 1A4',
  registrationNumber: '', // Non-registered orgs must never show a registration number
  placeOfIssue: 'Brampton, ON',
  authorizedSignerName: 'Harpreet Gill',
  authorizedSignerTitle: 'Club Treasurer',
  signatureDataUrl: SAMPLE_SIGNATURE_DATA_URL,
  logoDataUrl: SAMPLE_LOGO_DATA_URL,
  receiptPrefix: 'BHC-2026-',
  nextSequence: 1,
  sequencePadding: 5,
  aggregationMode: 'per-gift',
  taxYear: 2026,
  includeDuplicateStub: false,
});

/**
 * Preview how the next receipt serial number will look.
 * @param {object} profile
 * @returns {string}
 */
export function formatSerialNumberPreview(profile = {}) {
  const prefix = String(profile.receiptPrefix ?? 'ALM-2026-').trim();
  const seq = Math.max(1, Number.parseInt(profile.nextSequence, 10) || 1);
  const pad = Math.max(3, Math.min(8, Number.parseInt(profile.sequencePadding, 10) || 5));
  return `${prefix}${String(seq).padStart(pad, '0')}`;
}

/**
 * Validate an organization profile before allowing receipt generation.
 * Enforces:
 *  - Official mode requires a valid CRA registration number (^\d{9}RR\d{4}$).
 *  - Acknowledgement mode prohibits a CRA registration number on the output.
 *
 * @param {object} rawProfile
 * @returns {{ ok: boolean, errors: string[], fieldErrors: Record<string, string>, normalized: object }}
 */
export function validateOrgProfile(rawProfile = {}) {
  const profile = {
    ...DEFAULT_ORG_PROFILE,
    ...rawProfile,
  };

  const errors = [];
  const fieldErrors = {};

  if (profile.receiptType !== 'official' && profile.receiptType !== 'acknowledgement') {
    errors.push('Receipt type must be "official" or "acknowledgement"');
    fieldErrors.receiptType = 'Invalid receipt type';
  }

  profile.legalName = String(profile.legalName || '').trim();
  if (!profile.legalName) {
    errors.push('Organization legal name is required');
    fieldErrors.legalName = 'Organization legal name is required';
  }

  profile.address = String(profile.address || '').trim();
  if (!profile.address) {
    errors.push('Organization mailing address is required');
    fieldErrors.address = 'Organization address is required';
  }

  profile.placeOfIssue = String(profile.placeOfIssue || '').trim();
  if (!profile.placeOfIssue) {
    errors.push('Place / locality of issue is required');
    fieldErrors.placeOfIssue = 'Place of issue is required (e.g. Toronto, ON)';
  }

  profile.authorizedSignerName = String(profile.authorizedSignerName || '').trim();
  if (!profile.authorizedSignerName) {
    errors.push('Authorized signer name is required');
    fieldErrors.authorizedSignerName = 'Authorized signer name is required';
  }

  profile.receiptPrefix = String(profile.receiptPrefix || '').trim();
  if (!profile.receiptPrefix) {
    errors.push('Receipt serial prefix is required');
    fieldErrors.receiptPrefix = 'Serial prefix is required (e.g. SGT-2026-)';
  }

  const nextSeq = Number.parseInt(profile.nextSequence, 10);
  if (!Number.isInteger(nextSeq) || nextSeq < 1) {
    errors.push('Next receipt sequence number must be an integer >= 1');
    fieldErrors.nextSequence = 'Must be an integer >= 1';
  } else {
    profile.nextSequence = nextSeq;
  }

  const taxYear = Number.parseInt(profile.taxYear, 10);
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    errors.push('Tax year must be between 2000 and 2100');
    fieldErrors.taxYear = 'Enter a valid 4-digit tax year';
  } else {
    profile.taxYear = taxYear;
  }

  if (profile.receiptType === 'official') {
    profile.registrationNumber = normalizeRegistrationNumber(profile.registrationNumber);
    if (!profile.registrationNumber) {
      errors.push('CRA registration number is required for official tax receipts');
      fieldErrors.registrationNumber = 'Required for official receipts (e.g. 123456789RR0001)';
    } else if (!isValidRegistrationNumber(profile.registrationNumber)) {
      errors.push('CRA registration number must match 9 digits + RR + 4 digits (e.g. 123456789RR0001)');
      fieldErrors.registrationNumber = 'Format must be 9 digits + RR + 4 digits (e.g. 123456789RR0001)';
    }
  } else {
    // Non-registered acknowledgement mode must NEVER carry a registration number
    profile.registrationNumber = '';
  }

  return {
    ok: errors.length === 0,
    errors,
    fieldErrors,
    normalized: profile,
  };
}

/**
 * Export org profile to formatted JSON string.
 * @param {object} profile
 * @returns {string}
 */
export function exportOrgProfileJson(profile) {
  const { normalized } = validateOrgProfile(profile);
  return JSON.stringify(
    {
      schema: 'almsy.orgProfile.v1',
      exportedAt: new Date().toISOString(),
      orgProfile: normalized,
    },
    null,
    2
  );
}

/**
 * Import org profile from a JSON string.
 * @param {string} jsonText
 * @returns {object}
 */
export function importOrgProfileJson(jsonText) {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    throw new Error('Profile JSON is empty');
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file');
  }
  const candidate = parsed.orgProfile || parsed;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('JSON does not contain an organization profile');
  }
  return {
    ...DEFAULT_ORG_PROFILE,
    ...candidate,
    registrationNumber:
      candidate.receiptType === 'acknowledgement'
        ? ''
        : normalizeRegistrationNumber(candidate.registrationNumber || ''),
  };
}
