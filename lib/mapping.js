/**
 * Almsy Desk v1 — Column Mapping & Auto-Guess Engine
 * Guesses canonical donor & gift fields across diverse spreadsheet header styles
 * and transforms raw imported rows into canonical row objects.
 */

export const CANONICAL_FIELDS = Object.freeze([
  { key: 'fullName', label: 'Donor Full Name (if in 1 column)', group: 'name' },
  { key: 'firstName', label: 'First / Given Name (if split)', group: 'name' },
  { key: 'middleInitial', label: 'Middle Initial (optional)', group: 'name' },
  { key: 'lastName', label: 'Last / Family Name (if split)', group: 'name' },
  { key: 'addressLine1', label: 'Street Address (Line 1)', group: 'address', required: true },
  { key: 'addressLine2', label: 'Apt / Suite / Line 2 (optional)', group: 'address' },
  { key: 'city', label: 'City / Municipality', group: 'address', required: true },
  { key: 'province', label: 'Province / Territory', group: 'address', required: true },
  { key: 'postalCode', label: 'Postal Code', group: 'address', required: true },
  { key: 'date', label: 'Date Gift Received', group: 'gift', required: true },
  { key: 'amount', label: 'Gift Amount (CAD)', group: 'gift', required: true },
  { key: 'method', label: 'Payment Method (Cash/Cheque/e-Transfer)', group: 'gift' },
  { key: 'email', label: 'Donor Email (optional)', group: 'other' },
  { key: 'advantage', label: 'Advantage / Benefit Amount (optional)', group: 'other' },
  { key: 'notes', label: 'Notes / Memo (optional)', group: 'other' },
]);

const FIELD_PATTERNS = {
  fullName: [
    /^donor\s*full\s*name$/i,
    /^full\s*name$/i,
    /^donor\s*name$/i,
    /^donor$/i,
    /^sender\s*name$/i,
    /^contributor\s*name$/i,
    /^member\s*name$/i,
    /^name$/i,
    /^nom\s*complet$/i,
  ],
  firstName: [
    /^first\s*name$/i,
    /^given\s*name$/i,
    /^fname$/i,
    /^first$/i,
    /^pr[eé]nom$/i,
    /^donor\s*first\s*name$/i,
  ],
  middleInitial: [
    /^middle\s*initial$/i,
    /^middle\s*name$/i,
    /^m\.?i\.?$/i,
    /^initial$/i,
  ],
  lastName: [
    /^last\s*name$/i,
    /^surname$/i,
    /^family\s*name$/i,
    /^lname$/i,
    /^last$/i,
    /^nom\s*de\s*famille$/i,
    /^donor\s*last\s*name$/i,
  ],
  addressLine1: [
    /^street\s*address$/i,
    /^address\s*line\s*1$/i,
    /^address\s*1$/i,
    /^street\s*1$/i,
    /^mailing\s*address$/i,
    /^home\s*address$/i,
    /^street$/i,
    /^address$/i,
    /^adresse$/i,
  ],
  addressLine2: [
    /^address\s*line\s*2$/i,
    /^address\s*2$/i,
    /^street\s*2$/i,
    /^apt\s*\/?\s*suite$/i,
    /^apt$/i,
    /^suite$/i,
    /^unit$/i,
  ],
  city: [
    /^city$/i,
    /^city\s*name$/i,
    /^municipality$/i,
    /^town$/i,
    /^ville$/i,
    /^city\s*\/?\s*town$/i,
  ],
  province: [
    /^province$/i,
    /^prov\.?$/i,
    /^prov\s*code$/i,
    /^province\s*\/?\s*state$/i,
    /^state\s*\/?\s*province$/i,
    /^state$/i,
    /^province\s*\/?\s*territory$/i,
  ],
  postalCode: [
    /^postal\s*code$/i,
    /^postal$/i,
    /^code\s*postal$/i,
    /^zip\s*\/?\s*postal\s*code$/i,
    /^postal\s*\/?\s*zip$/i,
    /^zip\s*code$/i,
    /^zip$/i,
    /^postcode$/i,
  ],
  date: [
    /^gift\s*date$/i,
    /^donation\s*date$/i,
    /^date\s*received$/i,
    /^date\s*of\s*gift$/i,
    /^transaction\s*date$/i,
    /^payment\s*date$/i,
    /^received\s*date$/i,
    /^date$/i,
  ],
  amount: [
    /^donation\s*amount$/i,
    /^gift\s*amount$/i,
    /^eligible\s*amount$/i,
    /^amount\s*\(?cad\)?$/i,
    /^amount\s*\(\$\)$/i,
    /^credit\s*amount$/i,
    /^montant(?:\s*\(\$\))?$/i,
    /^contribution\s*amount$/i,
    /^amount$/i,
    /^donation$/i,
  ],
  method: [
    /^payment\s*method$/i,
    /^mode\s*of\s*payment$/i,
    /^payment\s*mode$/i,
    /^payment\s*type$/i,
    /^transfer\s*type$/i,
    /^gift\s*type$/i,
    /^method$/i,
    /^mode$/i,
    /^type$/i,
  ],
  email: [
    /^email\s*address$/i,
    /^donor\s*email$/i,
    /^sender\s*email$/i,
    /^courriel\s*\/?\s*email$/i,
    /^courriel$/i,
    /^e[\s-]*mail(?:\s*address)?$/i,
  ],
  advantage: [
    /^advantage\s*amount$/i,
    /^advantage$/i,
    /^benefit\s*amount$/i,
    /^benefit$/i,
    /^split\s*advantage$/i,
  ],
  notes: [
    /^memo\s*\/?\s*notes$/i,
    /^notes$/i,
    /^memo$/i,
    /^remarks$/i,
    /^comments$/i,
    /^fund$/i,
    /^description$/i,
  ],
};

function normalizeHeaderForMatch(header) {
  return String(header || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Automatically guess which spreadsheet header corresponds to each canonical Almsy field.
 * Never assigns the same spreadsheet column to two different canonical fields.
 *
 * @param {string[]} headers
 * @returns {Record<string, string>}
 */
export function autoGuessMapping(headers = []) {
  const result = {};
  for (const f of CANONICAL_FIELDS) {
    result[f.key] = '';
  }

  const usedHeaders = new Set();

  for (const field of CANONICAL_FIELDS) {
    const patterns = FIELD_PATTERNS[field.key] || [];
    for (const pat of patterns) {
      const matched = headers.find((h) => {
        if (usedHeaders.has(h)) return false;
        const norm = normalizeHeaderForMatch(h);
        return pat.test(norm);
      });
      if (matched) {
        result[field.key] = matched;
        usedHeaders.add(matched);
        break;
      }
    }
  }

  return result;
}

/**
 * Create a stable signature string for a set of headers so saved mappings can auto-load.
 * @param {string[]} headers
 * @returns {string}
 */
export function buildHeaderSignature(headers = []) {
  return headers
    .map((h) => normalizeHeaderForMatch(h).toLowerCase())
    .join('|');
}

/**
 * Transform raw parsed spreadsheet rows into canonical Almsy rows using the chosen mapping.
 *
 * @param {Array<Record<string, string>>} rawRows
 * @param {Record<string, string>} mapping
 * @returns {Array<object>}
 */
export function applyColumnMapping(rawRows = [], mapping = {}) {
  return rawRows.map((raw, idx) => {
    const get = (fieldKey) => {
      const col = mapping[fieldKey];
      if (!col) return '';
      return String(raw[col] ?? '').trim();
    };

    const firstName = get('firstName');
    const middleInitial = get('middleInitial');
    const lastName = get('lastName');
    let fullName = get('fullName');
    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, middleInitial, lastName].filter(Boolean).join(' ');
    }

    return {
      id: `row-${idx + 1}`,
      rowIndex: idx + 1,
      fullName,
      firstName,
      middleInitial,
      lastName,
      addressLine1: get('addressLine1'),
      addressLine2: get('addressLine2'),
      city: get('city'),
      province: get('province'),
      postalCode: get('postalCode'),
      date: get('date'),
      amount: get('amount'),
      method: get('method') || 'Cash',
      email: get('email'),
      advantage: get('advantage'),
      notes: get('notes'),
    };
  });
}
