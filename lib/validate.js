/**
 * Almsy Desk v1 — Validators & Row Validation Engine
 * Covers:
 *  - CRA Registration Number regex (^\d{9}RR\d{4}$)
 *  - Canadian Postal Code regex & normalizer
 *  - Date parsing & tax-year validation
 *  - Row validation & "Needs manual review" routing (out-of-scope CRA scenarios)
 */

import { parseMoney } from './money.js';

/** Official CRA charity registration number pattern: 9 digits + RR + 4 digits */
export const CRA_REG_NUMBER_REGEX = /^\d{9}RR\d{4}$/;

/**
 * Official Canadian Postal Code pattern:
 * First letter: A,B,C,E,G,H,J,K,L,M,N,P,R,S,T,V,X,Y (no D,F,I,O,Q,U,W,Z)
 * Other letters: no D,F,I,O,Q,U
 */
export const CANADIAN_POSTAL_REGEX =
  /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ][ -]?\d[ABCEGHJKLMNPRSTVWXYZ]\d$/i;

/**
 * Check if a string is a strictly valid CRA registration number (^\d{9}RR\d{4}$).
 * @param {string} value
 * @returns {boolean}
 */
export function isValidRegistrationNumber(value) {
  if (typeof value !== 'string') return false;
  return CRA_REG_NUMBER_REGEX.test(value.trim());
}

/**
 * Normalize a registration number (trim, uppercase, remove internal spaces).
 * @param {string} value
 * @returns {string}
 */
export function normalizeRegistrationNumber(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Check if a string is a valid Canadian postal code.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidPostalCode(value) {
  if (typeof value !== 'string') return false;
  return CANADIAN_POSTAL_REGEX.test(value.trim());
}

/**
 * Normalize a valid Canadian postal code to "A1A 1A1" uppercase format.
 * Returns trimmed uppercase input if invalid so the user can edit it inline.
 * @param {string} value
 * @returns {string}
 */
export function normalizePostalCode(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (cleaned.length === 6 && CANADIAN_POSTAL_REGEX.test(cleaned)) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  return value.trim().toUpperCase();
}

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a donation date into ISO "YYYY-MM-DD".
 * Supports:
 *  - "YYYY-MM-DD" or "YYYY/MM/DD"
 *  - "MMM D, YYYY" / "D MMM YYYY"
 *  - Excel serial numbers (e.g. 46023)
 *  - Slash dates "MM/DD/YYYY" when unambiguous or standard North American
 *
 * @param {string|number} raw
 * @returns {{ ok: boolean, isoDate?: string, year?: number, error?: string }}
 */
export function parseGiftDate(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, error: 'Date is required' };
  }

  // Excel serial date number (between 20000 and 60000)
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 25000 && raw < 65000) {
    const utcDays = Math.floor(raw - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    if (isValidCalendarDate(y, m, d)) {
      return { ok: true, isoDate: formatIsoDate(y, m, d), year: y };
    }
  }

  const str = String(raw).trim();
  if (!str) {
    return { ok: false, error: 'Date is required' };
  }

  // 1. ISO YYYY-MM-DD or YYYY/MM/DD (with optional T00:00:00 timestamp)
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (!isValidCalendarDate(y, m, d)) {
      return { ok: false, error: `Invalid calendar date: "${str}"` };
    }
    return { ok: true, isoDate: formatIsoDate(y, m, d), year: y };
  }

  // 2. Named month: "Jan 15, 2026" or "15 Jan 2026"
  const monthFirst = str.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirst) {
    const m = MONTH_NAMES[monthFirst[1].toLowerCase()];
    const d = Number(monthFirst[2]);
    const y = Number(monthFirst[3]);
    if (m && isValidCalendarDate(y, m, d)) {
      return { ok: true, isoDate: formatIsoDate(y, m, d), year: y };
    }
    return { ok: false, error: `Invalid date: "${str}"` };
  }

  const dayFirst = str.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (dayFirst) {
    const d = Number(dayFirst[1]);
    const m = MONTH_NAMES[dayFirst[2].toLowerCase()];
    const y = Number(dayFirst[3]);
    if (m && isValidCalendarDate(y, m, d)) {
      return { ok: true, isoDate: formatIsoDate(y, m, d), year: y };
    }
    return { ok: false, error: `Invalid date: "${str}"` };
  }

  // 3. Slash or dash with trailing 4-digit year: A/B/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    if (a > 12 && b <= 12) {
      // Unambiguous DD/MM/YYYY
      if (!isValidCalendarDate(y, b, a)) {
        return { ok: false, error: `Invalid calendar date: "${str}"` };
      }
      return { ok: true, isoDate: formatIsoDate(y, b, a), year: y };
    }
    if (b > 12 && a <= 12) {
      // Unambiguous MM/DD/YYYY
      if (!isValidCalendarDate(y, a, b)) {
        return { ok: false, error: `Invalid calendar date: "${str}"` };
      }
      return { ok: true, isoDate: formatIsoDate(y, a, b), year: y };
    }
    if (a === b && a >= 1 && a <= 12) {
      // Same day and month (e.g. 05/05/2026) -> unambiguous
      if (!isValidCalendarDate(y, a, b)) {
        return { ok: false, error: `Invalid calendar date: "${str}"` };
      }
      return { ok: true, isoDate: formatIsoDate(y, a, b), year: y };
    }
    // Both a <= 12 and b <= 12 and a !== b: North American MM/DD/YYYY vs DD/MM/YYYY
    // Treat as MM/DD/YYYY if valid, else error
    if (isValidCalendarDate(y, a, b)) {
      return { ok: true, isoDate: formatIsoDate(y, a, b), year: y };
    }
    return { ok: false, error: `Invalid calendar date: "${str}"` };
  }

  return { ok: false, error: `Unrecognized date format: "${str}" (use YYYY-MM-DD)` };
}

/**
 * Determine if a row requires manual review (out of scope for Almsy v1 automated receipts).
 * Out of scope per AG-ALMSY.md §1:
 *  - Non-cash / in-kind gifts (property, securities, goods, appraisal, FMV)
 *  - Split receipting with an advantage / benefit > 0
 *  - Replacement receipts for lost/incorrect ones
 *  - French language receipts
 *
 * @param {object} row
 * @returns {{ manualReview: boolean, reasons: string[] }}
 */
export function checkManualReview(row) {
  const reasons = [];
  const method = String(row.method || '').trim().toLowerCase();
  const notes = String(row.notes || '').trim().toLowerCase();
  const advantageRaw = String(row.advantage ?? '').trim();

  // 1. Check non-cash gift methods
  if (
    /in[- ]?kind|non[- ]?cash|property|securities|shares|stock|crypto|goods|gift[- ]?in[- ]?kind|appraisal|fmv|equipment|food|clothing/i.test(
      method
    ) ||
    /in[- ]?kind|non[- ]?cash|appraisal|fair market value|\bfmv\b|securities|shares/i.test(notes)
  ) {
    reasons.push('Non-cash / in-kind gift (requires FMV / appraisal handling)');
  }

  // 2. Check split receipting / advantage
  if (advantageRaw && advantageRaw !== '0' && advantageRaw !== '$0.00' && advantageRaw !== '0.00') {
    const advParsed = parseMoney(advantageRaw);
    if (!advParsed.ok || advParsed.cents !== 0) {
      reasons.push('Split receipting with an advantage / benefit received');
    }
  } else if (/advantage|gala ticket|dinner ticket|split receipt|benefit received/i.test(notes)) {
    reasons.push('Split receipting / advantage noted');
  }

  // 3. Check replacement receipt
  if (
    row.isReplacement === true ||
    /replacement|re-?issue|replaces receipt|lost receipt/i.test(notes) ||
    /replacement/i.test(method)
  ) {
    reasons.push('Replacement receipt request (requires prior serial reference)');
  }

  // 4. Check French receipt flag
  if (String(row.language || '').trim().toLowerCase() === 'fr' || /\bfrench receipt\b/i.test(notes)) {
    reasons.push('French-language receipt requested (English only in v1)');
  }

  return {
    manualReview: reasons.length > 0,
    reasons,
  };
}

/**
 * Normalize donor full name for display and matching.
 * Can combine firstName + middleInitial + lastName if fullName is not provided directly.
 * @param {object} row
 * @returns {string}
 */
export function resolveDonorFullName(row) {
  if (row.fullName && String(row.fullName).trim()) {
    return String(row.fullName).trim().replace(/\s+/g, ' ');
  }
  const parts = [row.firstName, row.middleInitial, row.lastName]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ');
}

/**
 * Normalize donor full address line for display.
 * @param {object} row
 * @returns {string}
 */
export function resolveDonorAddress(row) {
  const street = [row.addressLine1 || row.address, row.addressLine2]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');
  const city = String(row.city || '').trim();
  const province = String(row.province || '').trim().toUpperCase();
  const postal = normalizePostalCode(row.postalCode || row.postal || '');

  const locality = [city, province].filter(Boolean).join(', ');
  const tail = [locality, postal].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}

/**
 * Validate a batch of mapped donor rows against the chosen taxYear.
 * Returns enriched rows with status:
 *  - 'valid'
 *  - 'error' (fixable inline: missing name, missing address/postal, invalid postal, amount <= 0 or ambiguous, date outside taxYear, unconfirmed duplicate)
 *  - 'manual_review' (out-of-scope CRA gift types: non-cash, split advantage, replacement, etc.)
 *
 * @param {Array<object>} rows
 * @param {{ taxYear: number|string }} options
 * @returns {{
 *   rows: Array<object>,
 *   validRows: Array<object>,
 *   errorRows: Array<object>,
 *   manualReviewRows: Array<object>,
 *   counts: { total: number, valid: number, errors: number, manualReview: number, duplicates: number }
 * }}
 */
export function validateRows(rows, options = {}) {
  const targetYear = Number(options.taxYear || new Date().getFullYear());

  // First pass: parse fields and detect duplicate keys (normalized name + isoDate + amountCents)
  const seenKeys = new Map();
  const parsedList = rows.map((rawRow, idx) => {
    const id = rawRow.id || `row-${idx + 1}`;
    const fullName = resolveDonorFullName(rawRow);
    const street = String(rawRow.addressLine1 ?? rawRow.address ?? '').trim();
    const city = String(rawRow.city ?? '').trim();
    const province = String(rawRow.province ?? '').trim().toUpperCase();
    const rawPostal = String(rawRow.postalCode ?? rawRow.postal ?? '').trim();
    const normalizedPostal = normalizePostalCode(rawPostal);
    const rawAmount = rawRow.amount ?? rawRow.amountRaw ?? '';
    const rawDate = rawRow.date ?? rawRow.giftDate ?? '';
    const method = String(rawRow.method ?? 'Cash').trim() || 'Cash';

    const moneyRes = parseMoney(rawAmount);
    const dateRes = parseGiftDate(rawDate);
    const manualRes = checkManualReview(rawRow);

    const dupKey =
      fullName && dateRes.ok && moneyRes.ok && moneyRes.cents > 0
        ? `${fullName.toLowerCase()}|${dateRes.isoDate}|${moneyRes.cents}`
        : null;

    if (dupKey) {
      seenKeys.set(dupKey, (seenKeys.get(dupKey) || 0) + 1);
    }

    return {
      ...rawRow,
      id,
      rowIndex: idx + 1,
      fullName,
      addressLine1: street,
      city,
      province,
      postalCode: normalizedPostal,
      amountRaw: String(rawAmount),
      dateRaw: String(rawDate),
      method,
      _moneyRes: moneyRes,
      _dateRes: dateRes,
      _manualRes: manualRes,
      _dupKey: dupKey,
    };
  });

  let duplicateCount = 0;

  // Second pass: classify each row and collect field-level errors
  const enriched = parsedList.map((item) => {
    const errors = [];
    const fieldErrors = {};

    // Check manual review first (if explicitly flagged or out-of-scope)
    if (item.forceManualReview || item._manualRes.manualReview) {
      const reasons = item.forceManualReview
        ? ['Moved to manual review by treasurer', ...item._manualRes.reasons]
        : item._manualRes.reasons;
      return {
        ...stripInternal(item),
        amountCents: item._moneyRes.ok ? item._moneyRes.cents : null,
        isoDate: item._dateRes.ok ? item._dateRes.isoDate : null,
        status: 'manual_review',
        manualReviewReasons: reasons,
        errors: [],
        fieldErrors: {},
        isDuplicate: false,
      };
    }

    // 1. Donor Full Name (CRA requires full name; reject empty or single-character/missing)
    if (!item.fullName) {
      errors.push('Missing donor full name');
      fieldErrors.fullName = 'Donor full name is required';
    } else if (item.fullName.split(/\s+/).length < 2) {
      errors.push('Donor full name must include first and last name');
      fieldErrors.fullName = 'Include both first and last name';
    }

    // 2. Street Address
    if (!item.addressLine1) {
      errors.push('Missing street address');
      fieldErrors.addressLine1 = 'Street address is required';
    }

    // 3. Canadian Postal Code
    if (!item.postalCode) {
      errors.push('Missing postal code');
      fieldErrors.postalCode = 'Postal code is required';
    } else if (!isValidPostalCode(item.postalCode)) {
      errors.push(`Invalid Canadian postal code "${item.postalCode}"`);
      fieldErrors.postalCode = 'Must be valid Canadian postal code (e.g. M5V 2T6)';
    }

    // 4. Amount
    if (!item._moneyRes.ok) {
      errors.push(item._moneyRes.error || 'Invalid donation amount');
      fieldErrors.amount = item._moneyRes.error || 'Invalid amount';
    } else if (item._moneyRes.cents <= 0) {
      errors.push('Amount must be greater than $0.00');
      fieldErrors.amount = 'Amount must be > $0.00';
    }

    // 5. Date & Tax Year
    if (!item._dateRes.ok) {
      errors.push(item._dateRes.error || 'Invalid gift date');
      fieldErrors.date = item._dateRes.error || 'Invalid date';
    } else if (item._dateRes.year !== targetYear) {
      errors.push(`Gift date (${item._dateRes.isoDate}) is outside tax year ${targetYear}`);
      fieldErrors.date = `Must be within tax year ${targetYear}`;
    }

    // 6. Duplicate detection (same donor + date + amount)
    const isDuplicate = Boolean(item._dupKey && seenKeys.get(item._dupKey) > 1);
    if (isDuplicate && !item.duplicateConfirmed) {
      duplicateCount++;
      errors.push('Potential duplicate gift (same donor, date, and amount) — confirm or remove');
      fieldErrors.duplicate = 'Confirm if this donor gave two identical gifts on the same day';
    }

    const status = errors.length > 0 ? 'error' : 'valid';
    return {
      ...stripInternal(item),
      amountCents: item._moneyRes.ok ? item._moneyRes.cents : null,
      isoDate: item._dateRes.ok ? item._dateRes.isoDate : null,
      donorAddress: resolveDonorAddress(item),
      status,
      manualReviewReasons: [],
      errors,
      fieldErrors,
      isDuplicate,
    };
  });

  const validRows = enriched.filter((r) => r.status === 'valid');
  const errorRows = enriched.filter((r) => r.status === 'error');
  const manualReviewRows = enriched.filter((r) => r.status === 'manual_review');

  return {
    rows: enriched,
    validRows,
    errorRows,
    manualReviewRows,
    counts: {
      total: enriched.length,
      valid: validRows.length,
      errors: errorRows.length,
      manualReview: manualReviewRows.length,
      duplicates: duplicateCount,
    },
  };
}

function stripInternal(item) {
  const copy = { ...item };
  delete copy._moneyRes;
  delete copy._dateRes;
  delete copy._manualRes;
  delete copy._dupKey;
  return copy;
}
