import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOrgProfile,
  formatSerialNumberPreview,
  exportOrgProfileJson,
  importOrgProfileJson,
  SAMPLE_OFFICIAL_CHARITY_PROFILE,
  SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
} from '../lib/org-profile.js';

test('org-profile: validates official charity profile and requires valid CRA registration number', () => {
  const validRes = validateOrgProfile(SAMPLE_OFFICIAL_CHARITY_PROFILE);
  assert.equal(validRes.ok, true);
  assert.equal(validRes.normalized.registrationNumber, '842910374RR0001');

  const missingReg = validateOrgProfile({
    ...SAMPLE_OFFICIAL_CHARITY_PROFILE,
    registrationNumber: '',
  });
  assert.equal(missingReg.ok, false);
  assert.ok(missingReg.fieldErrors.registrationNumber);

  const badReg = validateOrgProfile({
    ...SAMPLE_OFFICIAL_CHARITY_PROFILE,
    registrationNumber: '12345RR0001',
  });
  assert.equal(badReg.ok, false);
  assert.ok(badReg.fieldErrors.registrationNumber);
});

test('org-profile: acknowledgement mode strips any registration number and validates without CRA reg number', () => {
  const res = validateOrgProfile({
    ...SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
    registrationNumber: '842910374RR0001', // Should be stripped in acknowledgement mode
  });
  assert.equal(res.ok, true);
  assert.equal(res.normalized.registrationNumber, '');
});

test('org-profile: formatSerialNumberPreview and export/import JSON round-trip', () => {
  assert.equal(
    formatSerialNumberPreview({ receiptPrefix: 'SGT-2026-', nextSequence: 42, sequencePadding: 5 }),
    'SGT-2026-00042'
  );

  const json = exportOrgProfileJson(SAMPLE_OFFICIAL_CHARITY_PROFILE);
  const restored = importOrgProfileJson(json);
  assert.equal(restored.legalName, SAMPLE_OFFICIAL_CHARITY_PROFILE.legalName);
  assert.equal(restored.registrationNumber, '842910374RR0001');
  assert.equal(restored.signatureDataUrl, SAMPLE_OFFICIAL_CHARITY_PROFILE.signatureDataUrl);
});
