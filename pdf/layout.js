/**
 * Almsy Desk v1 — Browser & Node PDF Layout Engine (pdf-lib)
 * Consumes validated receipt-model output and draws Letter (612 x 792 pt) pages.
 * Embeds self-hosted OFL fonts (IBM Plex Serif + IBM Plex Sans), organization logo,
 * and authorized signature PNG. Supports optional detachable "Organization File Copy" stub.
 */

import { PDFDocument, rgb } from '../vendor/pdf-lib.esm.js';
import fontkit from '../vendor/fontkit.esm.js';
import { assertValidReceiptModel } from '../lib/receipt-model.js';
import { VOID_RECEIPT_BANNER } from '../lib/cra-text.js';

export const LETTER_WIDTH = 612;
export const LETTER_HEIGHT = 792;

const COLORS = {
  ink: rgb(0.082, 0.094, 0.118),       // #15181E
  blue: rgb(0.176, 0.294, 0.604),      // #2D4B9A
  blueDark: rgb(0.118, 0.204, 0.439),  // #1E3470
  blueTint: rgb(0.933, 0.949, 0.980),  // #EEF2FA
  green: rgb(0.173, 0.478, 0.357),     // #2C7A5B
  amber: rgb(0.620, 0.384, 0.086),     // #9E6216
  amberTint: rgb(0.992, 0.957, 0.906), // #FDF4E7
  red: rgb(0.643, 0.224, 0.173),       // #A4392C
  paper: rgb(0.969, 0.965, 0.949),     // #F7F6F2
  line: rgb(0.847, 0.831, 0.780),      // #D8D4C7
  muted: rgb(0.361, 0.373, 0.400),     // #5C5F66
  white: rgb(1, 1, 1),
};

let cachedFontBytesPromise = null;

/**
 * Load the self-hosted OFL TTF font bytes (works in both Browser via fetch and Node via fs).
 * @param {object} [customFontBytes]
 * @returns {Promise<{ serifRegular: Uint8Array, serifBold: Uint8Array, sansRegular: Uint8Array, sansBold: Uint8Array }>}
 */
export async function loadAlmsyFontBytes(customFontBytes = null) {
  if (customFontBytes) return customFontBytes;
  if (cachedFontBytesPromise) return cachedFontBytesPromise;

  cachedFontBytesPromise = (async () => {
    // Browser environment
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const [serifRegular, serifBold, sansRegular, sansBold] = await Promise.all([
        fetch('./fonts/IBMPlexSerif-Regular.ttf').then((r) => r.arrayBuffer()),
        fetch('./fonts/IBMPlexSerif-Bold.ttf').then((r) => r.arrayBuffer()),
        fetch('./fonts/IBMPlexSans-Regular.ttf').then((r) => r.arrayBuffer()),
        fetch('./fonts/IBMPlexSans-SemiBold.ttf').then((r) => r.arrayBuffer()),
      ]);
      return {
        serifRegular: new Uint8Array(serifRegular),
        serifBold: new Uint8Array(serifBold),
        sansRegular: new Uint8Array(sansRegular),
        sansBold: new Uint8Array(sansBold),
      };
    }

    // Node test environment
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fontsDir = path.join(__dirname, '..', 'fonts');
    return {
      serifRegular: new Uint8Array(fs.readFileSync(path.join(fontsDir, 'IBMPlexSerif-Regular.ttf'))),
      serifBold: new Uint8Array(fs.readFileSync(path.join(fontsDir, 'IBMPlexSerif-Bold.ttf'))),
      sansRegular: new Uint8Array(fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Regular.ttf'))),
      sansBold: new Uint8Array(fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-SemiBold.ttf'))),
    };
  })();

  return cachedFontBytesPromise;
}

function decodeDataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[2];
  if (typeof Buffer !== 'undefined') {
    return { mime, bytes: new Uint8Array(Buffer.from(b64, 'base64')) };
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

async function embedDocResources(pdfDoc, sampleModel, fontBytes) {
  pdfDoc.registerFontkit(fontkit);
  const [serifRegular, serifBold, sansRegular, sansBold] = await Promise.all([
    pdfDoc.embedFont(fontBytes.serifRegular, { subset: true }),
    pdfDoc.embedFont(fontBytes.serifBold, { subset: true }),
    pdfDoc.embedFont(fontBytes.sansRegular, { subset: true }),
    pdfDoc.embedFont(fontBytes.sansBold, { subset: true }),
  ]);

  let logoImage = null;
  let signatureImage = null;

  const logoDecoded = decodeDataUrlToBytes(sampleModel?.logoDataUrl);
  if (logoDecoded) {
    try {
      logoImage = logoDecoded.mime.includes('png')
        ? await pdfDoc.embedPng(logoDecoded.bytes)
        : await pdfDoc.embedJpg(logoDecoded.bytes);
    } catch {
      logoImage = null;
    }
  }

  const sigDecoded = decodeDataUrlToBytes(sampleModel?.signatureDataUrl);
  if (sigDecoded) {
    try {
      signatureImage = sigDecoded.mime.includes('png')
        ? await pdfDoc.embedPng(sigDecoded.bytes)
        : await pdfDoc.embedJpg(sigDecoded.bytes);
    } catch {
      signatureImage = null;
    }
  }

  return {
    serifRegular,
    serifBold,
    sansRegular,
    sansBold,
    logoImage,
    signatureImage,
  };
}

/**
 * Draw a single receipt onto a Letter page inside `pdfDoc`.
 */
export function drawReceiptOnPage(page, model, resources) {
  assertValidReceiptModel(model);

  const { serifRegular, serifBold, sansRegular, sansBold, logoImage, signatureImage } = resources;
  const isOfficial = model.receiptType === 'official';
  const margin = 42;
  const contentWidth = LETTER_WIDTH - margin * 2;

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: LETTER_HEIGHT - 10,
    width: LETTER_WIDTH,
    height: 10,
    color: isOfficial ? COLORS.blue : COLORS.green,
  });

  let cursorY = LETTER_HEIGHT - 46;

  // 1. Organization Letterhead Header
  let orgTextX = margin;
  if (logoImage) {
    const logoDim = 44;
    page.drawImage(logoImage, {
      x: margin,
      y: cursorY - 30,
      width: logoDim,
      height: logoDim,
    });
    orgTextX = margin + logoDim + 12;
  }

  page.drawText(model.charityName, {
    x: orgTextX,
    y: cursorY,
    font: serifBold,
    size: 15,
    color: COLORS.ink,
  });

  page.drawText(model.charityAddress, {
    x: orgTextX,
    y: cursorY - 16,
    font: sansRegular,
    size: 9.5,
    color: COLORS.muted,
  });

  if (isOfficial) {
    page.drawText(`CRA Charity Registration No.: ${model.registrationNumber}`, {
      x: orgTextX,
      y: cursorY - 30,
      font: sansBold,
      size: 9.5,
      color: COLORS.blueDark,
    });
  }

  // Right-aligned Serial Number Box
  const serialBoxW = 165;
  const serialBoxX = LETTER_WIDTH - margin - serialBoxW;
  page.drawRectangle({
    x: serialBoxX,
    y: cursorY - 34,
    width: serialBoxW,
    height: 46,
    color: COLORS.paper,
    borderColor: COLORS.line,
    borderWidth: 1,
  });

  page.drawText('RECEIPT SERIAL NO.', {
    x: serialBoxX + 10,
    y: cursorY - 2,
    font: sansBold,
    size: 7.5,
    color: COLORS.muted,
  });

  page.drawText(model.serialNumber, {
    x: serialBoxX + 10,
    y: cursorY - 20,
    font: serifBold,
    size: 13,
    color: COLORS.ink,
  });

  cursorY -= 50;

  // Horizontal divider
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: LETTER_WIDTH - margin, y: cursorY },
    thickness: 1,
    color: COLORS.line,
  });

  cursorY -= 34;

  // 2. Statement Banner (Official Receipt vs Thank-You Acknowledgement)
  page.drawRectangle({
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: 26,
    color: isOfficial ? COLORS.blueTint : COLORS.amberTint,
    borderColor: isOfficial ? COLORS.blue : COLORS.amber,
    borderWidth: 0.8,
  });

  page.drawText(model.bannerStatement.toUpperCase(), {
    x: margin + 12,
    y: cursorY + 8,
    font: sansBold,
    size: 9.5,
    color: isOfficial ? COLORS.blueDark : COLORS.amber,
  });

  // Void Banner if status === 'VOID'
  if (model.status === 'VOID') {
    cursorY -= 30;
    page.drawRectangle({
      x: margin,
      y: cursorY,
      width: contentWidth,
      height: 24,
      color: rgb(0.988, 0.933, 0.922),
      borderColor: COLORS.red,
      borderWidth: 1.2,
    });
    page.drawText(VOID_RECEIPT_BANNER, {
      x: margin + 12,
      y: cursorY + 7,
      font: sansBold,
      size: 9.5,
      color: COLORS.red,
    });
  }

  cursorY -= 86;

  // 3. Two-Column Donor & Gift Amount Boxes
  const colGap = 14;
  const colW = (contentWidth - colGap) / 2;

  // Left Box: Donor Full Name & Address
  page.drawRectangle({
    x: margin,
    y: cursorY,
    width: colW,
    height: 74,
    color: COLORS.paper,
    borderColor: COLORS.line,
    borderWidth: 1,
  });

  page.drawText('DONOR FULL NAME & ADDRESS', {
    x: margin + 12,
    y: cursorY + 56,
    font: sansBold,
    size: 8,
    color: COLORS.muted,
  });

  page.drawText(model.donorFullName, {
    x: margin + 12,
    y: cursorY + 38,
    font: serifBold,
    size: 12.5,
    color: COLORS.ink,
  });

  // Wrap donor address if longer than 44 chars
  const addrLines = wrapText(model.donorAddress, 46);
  addrLines.slice(0, 2).forEach((line, idx) => {
    page.drawText(line, {
      x: margin + 12,
      y: cursorY + 21 - idx * 12,
      font: sansRegular,
      size: 9.5,
      color: COLORS.ink,
    });
  });

  // Right Box: Eligible Gift Amount
  const rightBoxX = margin + colW + colGap;
  page.drawRectangle({
    x: rightBoxX,
    y: cursorY,
    width: colW,
    height: 74,
    color: COLORS.paper,
    borderColor: COLORS.line,
    borderWidth: 1,
  });

  page.drawText(
    isOfficial ? 'ELIGIBLE AMOUNT OF GIFT (CAD)' : 'CONTRIBUTION AMOUNT (CAD)',
    {
      x: rightBoxX + 12,
      y: cursorY + 56,
      font: sansBold,
      size: 8,
      color: COLORS.muted,
    }
  );

  page.drawText(model.amountFormatted, {
    x: rightBoxX + 12,
    y: cursorY + 30,
    font: serifBold,
    size: 20,
    color: isOfficial ? COLORS.blueDark : COLORS.green,
  });

  page.drawText(`Payment Method: ${model.paymentMethod || 'Cash'}`, {
    x: rightBoxX + 12,
    y: cursorY + 12,
    font: sansRegular,
    size: 9,
    color: COLORS.muted,
  });

  cursorY -= 64;

  // 4. Dates & Locality Row (Date Gift Received / Tax Year, Issue Date, Place of Issue)
  const thirdW = (contentWidth - colGap * 2) / 3;
  const metaBoxes = [
    {
      label:
        model.aggregationMode === 'annual' && model.giftCount > 1
          ? 'CALENDAR YEAR OF GIFTS'
          : 'DATE GIFT RECEIVED',
      value:
        model.aggregationMode === 'annual' && model.giftCount > 1
          ? `${model.giftDateOrYear} (${model.giftCount} gifts consolidated)`
          : model.giftDateOrYear,
    },
    {
      label: 'DATE RECEIPT ISSUED',
      value: model.issueDate,
    },
    {
      label: 'PLACE / LOCALITY OF ISSUE',
      value: model.placeOfIssue,
    },
  ];

  metaBoxes.forEach((b, idx) => {
    const bx = margin + idx * (thirdW + colGap);
    page.drawRectangle({
      x: bx,
      y: cursorY,
      width: thirdW,
      height: 50,
      color: COLORS.white,
      borderColor: COLORS.line,
      borderWidth: 1,
    });
    page.drawText(b.label, {
      x: bx + 10,
      y: cursorY + 34,
      font: sansBold,
      size: 7.5,
      color: COLORS.muted,
    });
    page.drawText(String(b.value || ''), {
      x: bx + 10,
      y: cursorY + 15,
      font: sansBold,
      size: 10,
      color: COLORS.ink,
    });
  });

  // Optional breakdown table if annual consolidated with multiple gifts
  if (model.aggregationMode === 'annual' && model.gifts && model.gifts.length > 1) {
    cursorY -= 44;
    page.drawRectangle({
      x: margin,
      y: cursorY,
      width: contentWidth,
      height: 34,
      color: COLORS.paper,
      borderColor: COLORS.line,
      borderWidth: 0.8,
    });
    const summaryStr = model.gifts
      .slice(0, 6)
      .map((g) => `${g.isoDate}: ${g.amountFormatted || ''}`)
      .join('  ·  ');
    page.drawText(`Consolidated Gifts (${model.gifts.length}): ${summaryStr}`, {
      x: margin + 10,
      y: cursorY + 12,
      font: sansRegular,
      size: 8.5,
      color: COLORS.muted,
    });
  }

  cursorY -= 85;

  // 5. Authorized Signature & CRA Reference Row
  if (isOfficial) {
    page.drawText('TAX REGULATOR INFORMATION', {
      x: margin,
      y: cursorY + 38,
      font: sansBold,
      size: 7.5,
      color: COLORS.muted,
    });
    page.drawText(model.craNameAndWebsite, {
      x: margin,
      y: cursorY + 22,
      font: sansBold,
      size: 9.5,
      color: COLORS.ink,
    });
  } else {
    page.drawText('NON-TAX ACKNOWLEDGEMENT NOTICE', {
      x: margin,
      y: cursorY + 38,
      font: sansBold,
      size: 7.5,
      color: COLORS.amber,
    });
    page.drawText(model.acknowledgementStatement, {
      x: margin,
      y: cursorY + 22,
      font: sansRegular,
      size: 9,
      color: COLORS.ink,
    });
  }

  // Authorized Signer & Signature Image on Right
  const sigBlockWidth = 200;
  const sigBlockX = LETTER_WIDTH - margin - sigBlockWidth;
  if (signatureImage) {
    page.drawImage(signatureImage, {
      x: sigBlockX + 10,
      y: cursorY + 22,
      width: 150,
      height: 36,
    });
  }

  page.drawLine({
    start: { x: sigBlockX, y: cursorY + 18 },
    end: { x: LETTER_WIDTH - margin, y: cursorY + 18 },
    thickness: 1,
    color: COLORS.ink,
  });

  const signerLine = model.authorizedSignerTitle
    ? `${model.authorizedSignerName} · ${model.authorizedSignerTitle}`
    : model.authorizedSignerName;

  page.drawText(`Authorized Signer: ${signerLine}`, {
    x: sigBlockX,
    y: cursorY + 4,
    font: sansBold,
    size: 8.5,
    color: COLORS.ink,
  });

  // 6. Optional Detachable Duplicate Stub ("Organization File Copy")
  if (model.includeDuplicateStub) {
    const stubTopY = 215;
    // Perforated cut line
    for (let dx = margin; dx < LETTER_WIDTH - margin; dx += 10) {
      page.drawLine({
        start: { x: dx, y: stubTopY },
        end: { x: dx + 5, y: stubTopY },
        thickness: 0.8,
        color: COLORS.muted,
      });
    }
    page.drawText('✂ DETACHABLE ORGANIZATION FILE COPY (DUPLICATE STUB)', {
      x: margin,
      y: stubTopY + 5,
      font: sansBold,
      size: 7.5,
      color: COLORS.muted,
    });

    page.drawRectangle({
      x: margin,
      y: 72,
      width: contentWidth,
      height: 128,
      color: COLORS.paper,
      borderColor: COLORS.line,
      borderWidth: 1,
    });

    page.drawText(`${model.charityName} — ORGANIZATION FILE COPY`, {
      x: margin + 12,
      y: 180,
      font: serifBold,
      size: 11,
      color: COLORS.ink,
    });

    page.drawText(`Serial No.: ${model.serialNumber}   |   Amount: ${model.amountFormatted}   |   Method: ${model.paymentMethod}`, {
      x: margin + 12,
      y: 158,
      font: sansBold,
      size: 9.5,
      color: COLORS.blueDark,
    });

    page.drawText(`Donor: ${model.donorFullName} — ${model.donorAddress}`, {
      x: margin + 12,
      y: 138,
      font: sansRegular,
      size: 9,
      color: COLORS.ink,
    });

    page.drawText(
      `Gift Date/Year: ${model.giftDateOrYear}   |   Issued: ${model.issueDate} (${model.placeOfIssue})   |   Signer: ${model.authorizedSignerName}`,
      {
        x: margin + 12,
        y: 118,
        font: sansRegular,
        size: 8.5,
        color: COLORS.muted,
      }
    );

    if (isOfficial) {
      page.drawText(
        `CRA Reg. No.: ${model.registrationNumber} · ${model.officialStatement} · ${model.craNameAndWebsite}`,
        {
          x: margin + 12,
          y: 96,
          font: sansRegular,
          size: 8,
          color: COLORS.muted,
        }
      );
    } else {
      page.drawText(model.acknowledgementStatement, {
        x: margin + 12,
        y: 96,
        font: sansRegular,
        size: 8,
        color: COLORS.amber,
      });
    }
  }

  // 7. Mandatory Footer on every PDF page (§3)
  page.drawLine({
    start: { x: margin, y: 46 },
    end: { x: LETTER_WIDTH - margin, y: 46 },
    thickness: 0.7,
    color: COLORS.line,
  });

  page.drawText(model.disclaimerFooter, {
    x: margin,
    y: 32,
    font: sansRegular,
    size: 8,
    color: COLORS.muted,
  });
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Render a single receipt model into a standalone 1-page Letter PDF Uint8Array.
 *
 * @param {object} model
 * @param {object} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function renderSingleReceiptPdf(model, options = {}) {
  assertValidReceiptModel(model);
  const fontBytes = await loadAlmsyFontBytes(options.fontBytes);
  const pdfDoc = await PDFDocument.create();
  const resources = await embedDocResources(pdfDoc, model, fontBytes);
  const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawReceiptOnPage(page, model, resources);
  return await pdfDoc.save();
}

/**
 * Render a batch of receipt models into:
 *  - `combinedPdfBytes`: one multi-page Letter PDF containing all receipts (charity file copy)
 *  - `individualPdfs`: Array<{ fileName: string, serialNumber: string, bytes: Uint8Array }>
 *
 * Optimized so the 4 TTF fonts + logo + signature are embedded ONCE in the combined document,
 * and each individual receipt PDF copies its rendered page — allowing 140 PDFs + combined PDF
 * to generate in ~1–2 seconds!
 *
 * @param {Array<object>} models
 * @param {object} [options]
 * @returns {Promise<{
 *   combinedPdfBytes: Uint8Array,
 *   individualPdfs: Array<{ fileName: string, serialNumber: string, donorFullName: string, bytes: Uint8Array }>
 * }>}
 */
export async function renderReceiptBatchPdfs(models = [], options = {}) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('renderReceiptBatchPdfs requires at least 1 receipt model');
  }

  for (const m of models) {
    assertValidReceiptModel(m);
  }

  const fontBytes = await loadAlmsyFontBytes(options.fontBytes);
  const combinedDoc = await PDFDocument.create();
  const resources = await embedDocResources(combinedDoc, models[0], fontBytes);

  for (const model of models) {
    const page = combinedDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    drawReceiptOnPage(page, model, resources);
  }

  const combinedPdfBytes = await combinedDoc.save();
  const loadedCombined = await PDFDocument.load(combinedPdfBytes);

  // Extract each page into its own standalone PDF document (using pre-compressed streams from loadedCombined)
  const individualPdfs = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(loadedCombined, [i]);
    singleDoc.addPage(copiedPage);
    const bytes = await singleDoc.save();
    const safeDonor = model.donorFullName
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const fileName = `${model.serialNumber}_${safeDonor || 'Donor'}.pdf`;
    individualPdfs.push({
      fileName,
      serialNumber: model.serialNumber,
      donorFullName: model.donorFullName,
      bytes,
    });
  }

  return {
    combinedPdfBytes,
    individualPdfs,
  };
}
