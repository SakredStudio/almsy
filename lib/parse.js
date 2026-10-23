/**
 * Almsy Desk v1 — Spreadsheet Parser (CSV + XLSX)
 * Uses RFC-4180 CSV parsing and vendored SheetJS 0.18.5 (vendor/xlsx.mjs) for .xlsx files.
 */

import * as XLSX from '../vendor/xlsx.mjs';

/**
 * Parse RFC-4180 CSV text into headers and row objects.
 * Strips UTF-8 BOM if present, handles quoted fields with commas/newlines and escaped quotes.
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: Array<Record<string, string>>, rawMatrix: string[][] }}
 */
export function parseCsvText(text) {
  if (typeof text !== 'string') {
    throw new Error('CSV input must be a string');
  }
  const cleaned = text.replace(/^\uFEFF/, '');
  const matrix = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        matrix.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        matrix.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    matrix.push(row);
  }

  // Filter out completely blank rows
  const nonEmptyRows = matrix.filter((r) => r.some((cell) => cell !== ''));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] };
  }

  const headers = nonEmptyRows[0].map((h, idx) => h || `Column_${idx + 1}`);
  const rows = nonEmptyRows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    return obj;
  });

  return { headers, rows, rawMatrix: nonEmptyRows };
}

/**
 * Parse an XLSX ArrayBuffer or Uint8Array into headers and row objects.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ headers: string[], rows: Array<Record<string, string>>, sheetName: string }}
 */
export function parseXlsxBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], sheetName: '' };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const nonEmptyRows = matrix
    .map((r) => r.map((cell) => String(cell ?? '').trim()))
    .filter((r) => r.some((cell) => cell !== ''));

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], sheetName };
  }

  const headers = nonEmptyRows[0].map((h, idx) => h || `Column_${idx + 1}`);
  const rows = nonEmptyRows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    return obj;
  });

  return { headers, rows, sheetName };
}
