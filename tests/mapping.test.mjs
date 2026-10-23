import test from 'node:test';
import assert from 'node:assert/strict';
import { autoGuessMapping, applyColumnMapping, buildHeaderSignature } from '../lib/mapping.js';

test('mapping.autoGuessMapping: accurately guesses columns across 5 distinct spreadsheet header styles', () => {
  // Style 1: Standard Charity Spreadsheet
  const style1 = [
    'Donor Full Name',
    'Street Address',
    'City',
    'Province',
    'Postal Code',
    'Gift Date',
    'Donation Amount',
    'Payment Method',
    'Email',
  ];
  const g1 = autoGuessMapping(style1);
  assert.equal(g1.fullName, 'Donor Full Name');
  assert.equal(g1.addressLine1, 'Street Address');
  assert.equal(g1.city, 'City');
  assert.equal(g1.province, 'Province');
  assert.equal(g1.postalCode, 'Postal Code');
  assert.equal(g1.date, 'Gift Date');
  assert.equal(g1.amount, 'Donation Amount');
  assert.equal(g1.method, 'Payment Method');
  assert.equal(g1.email, 'Email');

  // Style 2: Split First/Middle/Last Name Temple Ledger
  const style2 = [
    'First Name',
    'Middle Initial',
    'Last Name',
    'Address Line 1',
    'Apt/Suite',
    'Town',
    'Prov',
    'Postal',
    'Date Received',
    'Amount (CAD)',
    'Mode of Payment',
    'E-mail',
  ];
  const g2 = autoGuessMapping(style2);
  assert.equal(g2.firstName, 'First Name');
  assert.equal(g2.middleInitial, 'Middle Initial');
  assert.equal(g2.lastName, 'Last Name');
  assert.equal(g2.addressLine1, 'Address Line 1');
  assert.equal(g2.addressLine2, 'Apt/Suite');
  assert.equal(g2.city, 'Town');
  assert.equal(g2.province, 'Prov');
  assert.equal(g2.postalCode, 'Postal');
  assert.equal(g2.date, 'Date Received');
  assert.equal(g2.amount, 'Amount (CAD)');
  assert.equal(g2.method, 'Mode of Payment');
  assert.equal(g2.email, 'E-mail');

  // Style 3: Interac e-Transfer / Bank Export Style
  const style3 = [
    'Sender Name',
    'Mailing Address',
    'Municipality',
    'Province/State',
    'Zip/Postal Code',
    'Transaction Date',
    'Credit Amount',
    'Transfer Type',
    'Sender Email',
    'Memo/Notes',
  ];
  const g3 = autoGuessMapping(style3);
  assert.equal(g3.fullName, 'Sender Name');
  assert.equal(g3.addressLine1, 'Mailing Address');
  assert.equal(g3.city, 'Municipality');
  assert.equal(g3.province, 'Province/State');
  assert.equal(g3.postalCode, 'Zip/Postal Code');
  assert.equal(g3.date, 'Transaction Date');
  assert.equal(g3.amount, 'Credit Amount');
  assert.equal(g3.method, 'Transfer Type');
  assert.equal(g3.email, 'Sender Email');
  assert.equal(g3.notes, 'Memo/Notes');

  // Style 4: Snake_case Database / CRM Export
  const style4 = [
    'donor_name',
    'street_1',
    'street_2',
    'city_name',
    'prov_code',
    'postal_code',
    'date_of_gift',
    'gift_amount',
    'payment_method',
    'email_address',
    'advantage_amount',
  ];
  const g4 = autoGuessMapping(style4);
  assert.equal(g4.fullName, 'donor_name');
  assert.equal(g4.addressLine1, 'street_1');
  assert.equal(g4.addressLine2, 'street_2');
  assert.equal(g4.city, 'city_name');
  assert.equal(g4.province, 'prov_code');
  assert.equal(g4.postalCode, 'postal_code');
  assert.equal(g4.date, 'date_of_gift');
  assert.equal(g4.amount, 'gift_amount');
  assert.equal(g4.method, 'payment_method');
  assert.equal(g4.email, 'email_address');
  assert.equal(g4.advantage, 'advantage_amount');

  // Style 5: Bilingual / Compact Community Club Sheet
  const style5 = [
    'Given Name',
    'Surname',
    'Street',
    'City',
    'Province',
    'Code Postal',
    'Date',
    'Montant ($)',
    'Method',
    'Courriel / Email',
    'Notes',
  ];
  const g5 = autoGuessMapping(style5);
  assert.equal(g5.firstName, 'Given Name');
  assert.equal(g5.lastName, 'Surname');
  assert.equal(g5.addressLine1, 'Street');
  assert.equal(g5.city, 'City');
  assert.equal(g5.province, 'Province');
  assert.equal(g5.postalCode, 'Code Postal');
  assert.equal(g5.date, 'Date');
  assert.equal(g5.amount, 'Montant ($)');
  assert.equal(g5.method, 'Method');
  assert.equal(g5.email, 'Courriel / Email');
  assert.equal(g5.notes, 'Notes');
});

test('mapping.applyColumnMapping: combines split first/middle/last names into fullName', () => {
  const headers = ['First Name', 'Middle Initial', 'Last Name', 'Street', 'City', 'Prov', 'Postal', 'Date', 'Amount'];
  const mapping = autoGuessMapping(headers);
  const mapped = applyColumnMapping(
    [
      {
        'First Name': 'Aarav',
        'Middle Initial': 'K.',
        'Last Name': 'Sharma',
        Street: '120 Bloor St E',
        City: 'Toronto',
        Prov: 'ON',
        Postal: 'M4W 1B7',
        Date: '2026-04-01',
        Amount: '$250.00',
      },
    ],
    mapping
  );
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].fullName, 'Aarav K. Sharma');
  assert.equal(mapped[0].postalCode, 'M4W 1B7');
  assert.ok(buildHeaderSignature(headers).includes('first name|middle initial'));
});
