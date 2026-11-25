// Find boxes on the donor review table and the receipt register. Pure functions, no DOM.
//
// Every word typed must be somewhere on the row, in any order; case and accents do not matter
// ("levesque" finds "Lévesque"). A postal code matches with or without its space, an amount with
// or without its dollar sign and commas, and a serial number with or without its dashes.

/** Lower case, accents removed, spaces collapsed. */
export function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const squeeze = (value) => foldText(value).replace(/[^a-z0-9.]/g, '');

/** The searchable text of one row: its fields joined, then the same fields with spaces and punctuation removed. */
export function findText(fields) {
  const parts = (fields || []).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  return `${foldText(parts.join(' \n '))} \n ${parts.map(squeeze).join(' \n ')}`;
}

/**
 * @param {string} text made by findText()
 * @param {string} query what the person typed
 * @returns {boolean} true when the query is empty or every word of it is in the text
 */
export function findMatches(text, query) {
  const words = foldText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = String(text ?? '');
  const whole = squeeze(query);
  // "M5V 2T6" typed with its space: the two halves are also tried as one.
  if (whole.length >= 3 && hay.includes(whole)) return true;
  return words.every((w) => hay.includes(w) || (squeeze(w).length >= 2 && hay.includes(squeeze(w))));
}

/** Rows whose text matches. `textOf(row)` returns the row's fields as an array. */
export function findRows(rows, query, textOf) {
  return (rows || []).filter((row) => findMatches(findText(textOf(row)), query));
}
