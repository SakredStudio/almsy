/**
 * Almsy Desk v1 — CAD Money Parsing & Formatting
 * Stores integer cents internally.
 * Displays via Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).
 * Parses English ("$1,250.00", "1250") and French-Canadian ("1 250,00", "1 250,00 $") formats.
 * Rejects anything ambiguous rather than guessing.
 */

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format integer cents as CAD currency string (e.g. 125000 -> "$1,250.00").
 * @param {number} cents
 * @returns {string}
 */
export function formatMoney(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new Error(`formatMoney requires integer cents, got: ${cents}`);
  }
  return cadFormatter.format(cents / 100);
}

/**
 * Parse a money value (string or number) into integer cents.
 * Returns { ok: true, cents } or { ok: false, error }.
 * Never guesses on ambiguous strings.
 *
 * @param {string|number} raw
 * @returns {{ ok: boolean, cents?: number, error?: string }}
 */
export function parseMoney(raw) {
  if (raw === null || raw === undefined) {
    return { ok: false, error: 'Amount is required' };
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: 'Amount is not a finite number' };
    }
    const rounded = Math.round(raw * 100);
    if (Math.abs(raw * 100 - rounded) > 1e-6) {
      return { ok: false, error: 'Amount has more than 2 decimal places' };
    }
    return { ok: true, cents: rounded };
  }

  if (typeof raw !== 'string') {
    return { ok: false, error: 'Invalid amount type' };
  }

  // Normalize non-breaking spaces to regular space and trim
  let str = raw.replace(/[\u00A0\u202F]/g, ' ').trim();
  if (!str) {
    return { ok: false, error: 'Amount is empty' };
  }

  // Check sign (leading '-' or trailing '-' or parentheses)
  let sign = 1;
  if (/^\(.*\)$/.test(str)) {
    sign = -1;
    str = str.slice(1, -1).trim();
  } else if (str.startsWith('-')) {
    sign = -1;
    str = str.slice(1).trim();
  } else if (str.startsWith('+')) {
    str = str.slice(1).trim();
  }

  // Strip leading or trailing CAD / CA$ / $ symbols (and optional space around them)
  // Reject other currency symbols (€, £, ₹, US$, USD) as ambiguous/unsupported
  if (/[€£₹¥]|US\$|USD/i.test(str)) {
    return { ok: false, error: 'Only CAD currency is supported' };
  }

  str = str
    .replace(/^(?:CA\$|CAD|\$)\s*/i, '')
    .replace(/\s*(?:CA\$|CAD|\$)$/i, '')
    .trim();

  if (str.startsWith('-')) {
    if (sign === -1) return { ok: false, error: 'Ambiguous double negative sign' };
    sign = -1;
    str = str.slice(1).trim();
  }

  if (!str) {
    return { ok: false, error: 'Amount has no digits' };
  }

  // Reject any remaining letters or unexpected characters
  if (/[^0-9., ]/.test(str)) {
    return { ok: false, error: `Ambiguous characters in amount: "${raw}"` };
  }

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  const hasSpace = str.includes(' ');

  let integerPart = '';
  let fracPart = '';

  if (hasDot && hasComma) {
    // Only valid in Canada if comma is thousands separator and dot is decimal: e.g. "1,250.00"
    // Reject European "1.250,00" or mixed spaces
    if (hasSpace) {
      return { ok: false, error: `Ambiguous mixed separators in "${raw}"` };
    }
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      return { ok: false, error: `Ambiguous dot/comma order in "${raw}"` };
    }
    const dotParts = str.split('.');
    if (dotParts.length !== 2) {
      return { ok: false, error: `Multiple decimal points in "${raw}"` };
    }
    const [left, right] = dotParts;
    if (!/^\d{1,3}(,\d{3})+$/.test(left)) {
      return { ok: false, error: `Invalid comma grouping in "${raw}"` };
    }
    if (!/^\d{1,2}$/.test(right)) {
      return { ok: false, error: `Invalid decimal digits in "${raw}"` };
    }
    integerPart = left.replace(/,/g, '');
    fracPart = right;
  } else if (hasDot) {
    // Dot is decimal separator. Spaces or commas may be thousands separators.
    const dotParts = str.split('.');
    if (dotParts.length !== 2) {
      return { ok: false, error: `Multiple decimal points in "${raw}"` };
    }
    const [left, right] = dotParts;
    if (hasSpace) {
      if (!/^\d{1,3}( \d{3})+$/.test(left)) {
        return { ok: false, error: `Invalid space grouping in "${raw}"` };
      }
      integerPart = left.replace(/ /g, '');
    } else {
      if (!/^\d+$/.test(left)) {
        return { ok: false, error: `Invalid integer part in "${raw}"` };
      }
      integerPart = left;
    }
    if (!/^\d{1,2}$/.test(right)) {
      return { ok: false, error: `Decimal places must be 1 or 2 digits in "${raw}"` };
    }
    fracPart = right;
  } else if (hasComma) {
    // Could be French decimal ("1 250,00" or "25,50") OR English thousands ("1,250" or "1,250,000")
    const commaParts = str.split(',');
    if (hasSpace) {
      // French format with space thousands and comma decimal: "1 250,00"
      if (commaParts.length !== 2) {
        return { ok: false, error: `Ambiguous commas and spaces in "${raw}"` };
      }
      const [left, right] = commaParts;
      if (!/^\d{1,3}( \d{3})+$/.test(left)) {
        return { ok: false, error: `Invalid space grouping in "${raw}"` };
      }
      if (!/^\d{1,2}$/.test(right)) {
        return { ok: false, error: `Invalid French decimal digits in "${raw}"` };
      }
      integerPart = left.replace(/ /g, '');
      fracPart = right;
    } else if (commaParts.length === 2 && commaParts[1].length <= 2) {
      // Single comma followed by 1 or 2 digits (e.g. "1250,50" or "25,00") -> French decimal
      const [left, right] = commaParts;
      if (!/^\d+$/.test(left) || !/^\d{1,2}$/.test(right)) {
        return { ok: false, error: `Invalid French decimal format in "${raw}"` };
      }
      integerPart = left;
      fracPart = right;
    } else if (/^\d{1,3}(,\d{3})+$/.test(str)) {
      // English comma-grouped integer: "1,250" or "10,000"
      integerPart = str.replace(/,/g, '');
      fracPart = '';
    } else {
      return { ok: false, error: `Ambiguous comma placement in "${raw}"` };
    }
  } else if (hasSpace) {
    // Space-grouped integer: "1 250"
    if (!/^\d{1,3}( \d{3})+$/.test(str)) {
      return { ok: false, error: `Invalid space grouping in "${raw}"` };
    }
    integerPart = str.replace(/ /g, '');
    fracPart = '';
  } else {
    // Plain digits: "1250"
    if (!/^\d+$/.test(str)) {
      return { ok: false, error: `Invalid digits in "${raw}"` };
    }
    integerPart = str;
    fracPart = '';
  }

  const paddedFrac = (fracPart + '00').slice(0, 2);
  const dollars = Number.parseInt(integerPart, 10);
  const centsPart = Number.parseInt(paddedFrac, 10);

  if (!Number.isSafeInteger(dollars) || dollars > 999_999_999) {
    return { ok: false, error: `Amount out of supported range: "${raw}"` };
  }

  const totalCents = sign * (dollars * 100 + centsPart);
  return { ok: true, cents: totalCents === 0 ? 0 : totalCents };
}

/**
 * Parse a money value into integer cents or throw an Error if invalid/ambiguous.
 * @param {string|number} raw
 * @returns {number}
 */
export function parseMoneyToCents(raw) {
  const res = parseMoney(raw);
  if (!res.ok) {
    throw new Error(res.error);
  }
  return res.cents;
}
