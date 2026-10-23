import {
  ALMSY_DISCLAIMER_FOOTER,
  CRA_OFFICIAL_STATEMENT,
  CRA_NAME_AND_WEBSITE,
  ACKNOWLEDGEMENT_STATEMENT,
  PRIVACY_SESSION_NOTICE,
} from './lib/cra-text.js';
import { createAlmsyDb } from './lib/db.js';
import { formatMoney } from './lib/money.js';
import {
  validateOrgProfile,
  formatSerialNumberPreview,
  exportOrgProfileJson,
  importOrgProfileJson,
  SAMPLE_OFFICIAL_CHARITY_PROFILE,
  SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE,
  SAMPLE_SIGNATURE_DATA_URL,
} from './lib/org-profile.js';
import { parseCsvText, parseXlsxBuffer } from './lib/parse.js';
import {
  CANONICAL_FIELDS,
  autoGuessMapping,
  buildHeaderSignature,
  applyColumnMapping,
} from './lib/mapping.js';
import { validateRows } from './lib/validate.js';
import { buildAggregationPlan } from './lib/aggregate.js';
import { formatSerial, voidReceipt, exportRegisterCsv } from './lib/numbering.js';
import { buildReceiptModel } from './lib/receipt-model.js';
import { renderSingleReceiptPdf } from './pdf/layout.js';
import { executeGenerationRun } from './lib/generate-run.js';

const db = createAlmsyDb();

const state = {
  step: 'profile',
  orgProfile: null,
  highestSequence: 0,
  profileFeedback: null,
  // Import & Mapping state
  fileName: '',
  rawHeaders: [],
  rawRows: [],
  columnMapping: {},
  savedMappings: {},
  mappedRows: [],
  importFeedback: null,
  sessionSavedAt: null,
  // Validate & Review state
  validationFilter: 'all',
  annualMergeConfirmed: false,
  // Generate & Register state
  isGenerating: false,
  lastRunResult: null,
  generateFeedback: null,
  registerEntries: [],
};

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(bytesOrText, fileName, mimeType) {
  const blob =
    bytesOrText instanceof Uint8Array
      ? new Blob([bytesOrText], { type: mimeType })
      : new Blob([String(bytesOrText)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshRegisterState() {
  state.orgProfile = await db.getOrgProfile();
  state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
  state.registerEntries = await db.getAllRegisterEntries();
}

async function init() {
  const footerDisclaimer = document.getElementById('footer-disclaimer');
  if (footerDisclaimer) footerDisclaimer.textContent = ALMSY_DISCLAIMER_FOOTER;

  const sessionNotice = document.getElementById('footer-session-notice');
  if (sessionNotice) sessionNotice.textContent = PRIVACY_SESSION_NOTICE;

  await refreshRegisterState();
  state.savedMappings = await db.getSavedMappings();

  const savedSession = await db.getSavedDonorSession();
  if (savedSession && Array.isArray(savedSession.mappedRows) && savedSession.mappedRows.length > 0) {
    state.fileName = savedSession.fileName || 'Saved Session';
    state.rawHeaders = savedSession.rawHeaders || [];
    state.rawRows = savedSession.rawRows || [];
    state.columnMapping = savedSession.columnMapping || {};
    state.mappedRows = savedSession.mappedRows;
    state.sessionSavedAt = savedSession.savedAt;
  }

  const nav = document.getElementById('step-nav');
  if (nav) {
    nav.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-step]');
      if (!btn) return;
      state.step = btn.dataset.step;
      if (state.step === 'generate' || state.step === 'profile') {
        await refreshRegisterState();
      }
      render();
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

function render() {
  const tabs = document.querySelectorAll('.step-tab');
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.step === state.step);
  });

  const root = document.getElementById('app-root');
  if (!root) return;

  if (state.step === 'profile') {
    renderProfileScreen(root);
    return;
  }

  if (state.step === 'import') {
    renderImportScreen(root);
    return;
  }

  if (state.step === 'validate') {
    renderValidateScreen(root);
    return;
  }

  if (state.step === 'generate') {
    renderGenerateScreen(root);
    return;
  }
}

/* ============================================================================
 * STEP 1: ORGANIZATION PROFILE SCREEN
 * ========================================================================== */
function renderProfileScreen(root) {
  const p = state.orgProfile;
  const validation = validateOrgProfile(p);
  const isOfficial = p.receiptType === 'official';
  const serialPreview = formatSerialNumberPreview(p);
  const minSeq = Math.max(1, state.highestSequence + 1);

  root.innerHTML = `
    <div class="grid-2">
      <div>
        <div class="card">
          <div class="card-header">
            <div>
              <h2>1. Organization Profile &amp; Receipt Mode</h2>
              <p class="card-subtitle">Configure your organization's letterhead, numbering, and CRA compliance mode.</p>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn" id="btn-load-sample-charity">Load Sample Charity</button>
              <button type="button" class="btn" id="btn-load-sample-club">Load Sample Club</button>
            </div>
          </div>

          ${
            state.profileFeedback
              ? `<div class="callout ${
                  state.profileFeedback.type === 'error' ? 'callout-warn' : 'callout-success'
                }" id="profile-feedback">${escapeHtml(state.profileFeedback.message)}</div>`
              : ''
          }

          <div class="field">
            <label>Receipt Mode (Choose carefully)</label>
            <div class="mode-selector">
              <button type="button" class="mode-card ${isOfficial ? 'active' : ''}" data-receipt-type="official">
                <div class="mode-card-title">
                  <span>Official Donation Receipt</span>
                  ${isOfficial ? '<span class="badge badge-blue">Selected</span>' : ''}
                </div>
                <div class="mode-card-desc">
                  For registered Canadian charities with a valid CRA registration number (<code>123456789RR0001</code>). Includes all mandatory CRA tax fields.
                </div>
              </button>
              <button type="button" class="mode-card ${!isOfficial ? 'active' : ''}" data-receipt-type="acknowledgement">
                <div class="mode-card-title">
                  <span>Thank-You Acknowledgement</span>
                  ${!isOfficial ? '<span class="badge badge-valid">Selected</span>' : ''}
                </div>
                <div class="mode-card-desc">
                  For clubs, unregistered temples, and community groups. Clearly states it is <strong>not</strong> a tax receipt for income tax purposes.
                </div>
              </button>
            </div>
          </div>

          ${
            !isOfficial
              ? `<div class="callout callout-warn">
                  <strong>Non-Registered Organization Mode:</strong> Non-registered groups cannot issue income tax receipts. Almsy will omit any CRA registration number and print an explicit non-tax acknowledgement statement on every PDF.
                </div>`
              : ''
          }

          <div class="field">
            <label for="inp-legalName">Organization Legal Name ${isOfficial ? '(as on file with CRA)' : ''}</label>
            <input type="text" id="inp-legalName" value="${escapeHtml(p.legalName)}" placeholder="e.g. Sri Ganesha Cultural & Charitable Foundation" />
          </div>

          <div class="field">
            <label for="inp-address">Organization Mailing Address ${isOfficial ? '(as on file with CRA)' : ''}</label>
            <input type="text" id="inp-address" value="${escapeHtml(p.address)}" placeholder="e.g. 2400 Markham Rd, Scarborough, ON M1B 2W6" />
          </div>

          ${
            isOfficial
              ? `<div class="field">
                  <label for="inp-regNumber">
                    CRA Charity Registration Number
                    ${
                      validation.fieldErrors.registrationNumber
                        ? `<span class="badge badge-error">${escapeHtml(validation.fieldErrors.registrationNumber)}</span>`
                        : `<span class="badge badge-valid">Valid 9 digits + RR + 4 digits</span>`
                    }
                  </label>
                  <input type="text" id="inp-regNumber" value="${escapeHtml(p.registrationNumber)}" placeholder="e.g. 842910374RR0001" maxlength="15" />
                  <span class="hint">Format strictly validated against <code>^\\d{9}RR\\d{4}$</code></span>
                </div>`
              : ''
          }

          <div class="grid-2">
            <div class="field">
              <label for="inp-placeOfIssue">Place / Locality of Issue</label>
              <input type="text" id="inp-placeOfIssue" value="${escapeHtml(p.placeOfIssue)}" placeholder="e.g. Toronto, ON" />
            </div>
            <div class="field">
              <label for="inp-taxYear">Tax Year</label>
              <input type="number" id="inp-taxYear" value="${escapeHtml(p.taxYear)}" min="2000" max="2100" />
            </div>
          </div>

          <div class="grid-3">
            <div class="field">
              <label for="inp-prefix">Receipt Serial Prefix</label>
              <input type="text" id="inp-prefix" value="${escapeHtml(p.receiptPrefix)}" placeholder="e.g. SGT-2026-" />
            </div>
            <div class="field">
              <label for="inp-nextSequence">Next Sequence # (Min: ${minSeq})</label>
              <input type="number" id="inp-nextSequence" value="${escapeHtml(p.nextSequence)}" min="${minSeq}" />
              <span class="hint">Preview: <strong>${escapeHtml(serialPreview)}</strong></span>
            </div>
            <div class="field">
              <label for="sel-aggregation">Receipt Grouping Mode</label>
              <select id="sel-aggregation">
                <option value="per-gift" ${p.aggregationMode === 'per-gift' ? 'selected' : ''}>One receipt per gift</option>
                <option value="annual" ${p.aggregationMode === 'annual' ? 'selected' : ''}>Annual consolidated (per donor)</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="inp-signerName">Authorized Signer Full Name</label>
              <input type="text" id="inp-signerName" value="${escapeHtml(p.authorizedSignerName)}" placeholder="e.g. Ramesh Subramanian" />
            </div>
            <div class="field">
              <label for="inp-signerTitle">Authorized Signer Title</label>
              <input type="text" id="inp-signerTitle" value="${escapeHtml(p.authorizedSignerTitle)}" placeholder="e.g. Honorary Treasurer" />
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label>Authorized Signature Image (PNG)</label>
              <div class="upload-box">
                ${
                  p.signatureDataUrl
                    ? `<img src="${escapeHtml(p.signatureDataUrl)}" alt="Authorized signature preview" class="upload-preview" />`
                    : `<span class="hint">No signature PNG uploaded yet</span>`
                }
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <label class="btn" style="cursor:pointer;">
                    Upload PNG
                    <input type="file" id="file-signature" accept="image/png,image/jpeg" style="display:none;" />
                  </label>
                  <button type="button" class="btn" id="btn-sample-sig">Use Sample</button>
                  ${
                    p.signatureDataUrl
                      ? `<button type="button" class="btn btn-danger" id="btn-clear-sig">Clear</button>`
                      : ''
                  }
                </div>
              </div>
            </div>

            <div class="field">
              <label>Organization Logo (PNG/JPG)</label>
              <div class="upload-box">
                ${
                  p.logoDataUrl
                    ? `<img src="${escapeHtml(p.logoDataUrl)}" alt="Organization logo preview" class="upload-preview" />`
                    : `<span class="hint">Optional letterhead logo</span>`
                }
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <label class="btn" style="cursor:pointer;">
                    Upload Logo
                    <input type="file" id="file-logo" accept="image/png,image/jpeg" style="display:none;" />
                  </label>
                  ${
                    p.logoDataUrl
                      ? `<button type="button" class="btn btn-danger" id="btn-clear-logo">Clear</button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          </div>

          <div class="field" style="margin-top:6px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="chk-duplicate-stub" ${p.includeDuplicateStub ? 'checked' : ''} />
              Include detachable "Organization File Copy" stub on the bottom of each Letter PDF page
            </label>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:18px; padding-top:16px; border-top:1px solid var(--line);">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn" id="btn-export-profile">Export Profile JSON</button>
              <label class="btn" style="cursor:pointer;">
                Import Profile JSON
                <input type="file" id="file-import-profile" accept="application/json,.json" style="display:none;" />
              </label>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" id="btn-save-profile">Save Profile &amp; Continue →</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Live Letterhead &amp; Receipt Preview</h3>
              <p class="card-subtitle">Preview of how each Letter PDF receipt will look with your current profile.</p>
            </div>
            <span class="badge ${validation.ok ? 'badge-valid' : 'badge-warn'}">
              ${validation.ok ? '✓ Profile Ready' : `${validation.errors.length} field(s) needed`}
            </span>
          </div>

          <div class="receipt-preview-paper ${isOfficial ? 'official-mode' : 'ack-mode'}" id="live-receipt-preview">
            <div class="rp-header">
              <div class="rp-org-block">
                ${
                  p.logoDataUrl
                    ? `<img src="${escapeHtml(p.logoDataUrl)}" alt="Logo" class="rp-logo" />`
                    : ''
                }
                <div>
                  <div class="rp-org-name">${escapeHtml(p.legalName || 'Your Organization Legal Name')}</div>
                  <div class="rp-org-meta">${escapeHtml(p.address || 'Organization Mailing Address')}</div>
                  ${
                    isOfficial
                      ? `<div class="rp-org-meta"><strong>CRA Registration No.:</strong> ${escapeHtml(
                          p.registrationNumber || '123456789RR0001'
                        )}</div>`
                      : ''
                  }
                </div>
              </div>
              <div style="text-align:right;">
                <div class="rp-label">Receipt Serial No.</div>
                <div class="rp-val" style="font-family:var(--font-mono); font-size:14px;">${escapeHtml(serialPreview)}</div>
              </div>
            </div>

            <div class="rp-statement-banner">
              ${escapeHtml(isOfficial ? CRA_OFFICIAL_STATEMENT : ACKNOWLEDGEMENT_STATEMENT)}
            </div>

            <div class="rp-grid">
              <div class="rp-box">
                <div class="rp-label">Donor Full Name &amp; Address</div>
                <div class="rp-val">Priya K. Sharma</div>
                <div class="rp-org-meta">120 Bloor St E, Toronto, ON M4W 1B7</div>
              </div>
              <div class="rp-box">
                <div class="rp-label">${isOfficial ? 'Eligible Amount of Gift (CAD)' : 'Contribution Amount (CAD)'}</div>
                <div class="rp-amount-val">${formatMoney(25000)}</div>
                <div class="rp-org-meta">Payment Method: e-Transfer</div>
              </div>
            </div>

            <div class="rp-grid">
              <div class="rp-box">
                <div class="rp-label">${
                  p.aggregationMode === 'annual' ? 'Calendar Year of Gifts' : 'Date Gift Received'
                }</div>
                <div class="rp-val">${
                  p.aggregationMode === 'annual'
                    ? `${escapeHtml(p.taxYear)} (Annual Consolidated)`
                    : `${escapeHtml(p.taxYear)}-04-15`
                }</div>
              </div>
              <div class="rp-box">
                <div class="rp-label">Date &amp; Place Receipt Issued</div>
                <div class="rp-val">${new Date().toISOString().slice(0, 10)} · ${escapeHtml(
                  p.placeOfIssue || 'City, Province'
                )}</div>
              </div>
            </div>

            <div class="rp-footer-row">
              <div>
                ${
                  isOfficial
                    ? `<div class="rp-label">Tax Regulator Reference</div>
                       <div class="rp-val" style="font-size:12px;">${escapeHtml(CRA_NAME_AND_WEBSITE)}</div>`
                    : `<div class="rp-label">Non-Tax Notice</div>
                       <div class="rp-val" style="font-size:12px; color:var(--amber);">Not a tax receipt for income tax purposes.</div>`
                }
              </div>
              <div style="text-align:right;">
                ${
                  p.signatureDataUrl
                    ? `<img src="${escapeHtml(p.signatureDataUrl)}" alt="Authorized Signature" class="rp-sig-img" />`
                    : ''
                }
                <div class="rp-sig-line">
                  <strong>${escapeHtml(p.authorizedSignerName || 'Authorized Signer')}</strong>
                  ${p.authorizedSignerTitle ? ` · ${escapeHtml(p.authorizedSignerTitle)}` : ''}
                </div>
              </div>
            </div>

            <div class="rp-disclaimer">
              ${escapeHtml(ALMSY_DISCLAIMER_FOOTER)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  wireProfileEvents(root);
}

function readProfileInputsFromDom(root) {
  const p = { ...state.orgProfile };
  const val = (id) => {
    const el = root.querySelector(`#${id}`);
    return el ? el.value : undefined;
  };
  if (val('inp-legalName') !== undefined) p.legalName = val('inp-legalName');
  if (val('inp-address') !== undefined) p.address = val('inp-address');
  if (val('inp-regNumber') !== undefined) p.registrationNumber = val('inp-regNumber');
  if (val('inp-placeOfIssue') !== undefined) p.placeOfIssue = val('inp-placeOfIssue');
  if (val('inp-taxYear') !== undefined) p.taxYear = Number(val('inp-taxYear')) || p.taxYear;
  if (val('inp-prefix') !== undefined) p.receiptPrefix = val('inp-prefix');
  if (val('inp-nextSequence') !== undefined) p.nextSequence = Number(val('inp-nextSequence')) || 1;
  if (val('sel-aggregation') !== undefined) p.aggregationMode = val('sel-aggregation');
  if (val('inp-signerName') !== undefined) p.authorizedSignerName = val('inp-signerName');
  if (val('inp-signerTitle') !== undefined) p.authorizedSignerTitle = val('inp-signerTitle');
  const dupChk = root.querySelector('#chk-duplicate-stub');
  if (dupChk) p.includeDuplicateStub = dupChk.checked;
  return p;
}

function wireProfileEvents(root) {
  root.querySelectorAll('[data-receipt-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      state.orgProfile.receiptType = btn.dataset.receiptType;
      if (state.orgProfile.receiptType === 'acknowledgement') {
        state.orgProfile.registrationNumber = '';
      }
      state.profileFeedback = null;
      renderProfileScreen(root);
    });
  });

  const inputIds = [
    'inp-legalName',
    'inp-address',
    'inp-regNumber',
    'inp-placeOfIssue',
    'inp-taxYear',
    'inp-prefix',
    'inp-nextSequence',
    'sel-aggregation',
    'inp-signerName',
    'inp-signerTitle',
    'chk-duplicate-stub',
  ];
  inputIds.forEach((id) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('change', async () => {
      state.orgProfile = readProfileInputsFromDom(root);
      state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
      renderProfileScreen(root);
    });
  });

  const btnCharity = root.querySelector('#btn-load-sample-charity');
  if (btnCharity) {
    btnCharity.addEventListener('click', async () => {
      state.orgProfile = await db.saveOrgProfile({ ...SAMPLE_OFFICIAL_CHARITY_PROFILE });
      state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
      state.profileFeedback = {
        type: 'success',
        message: 'Loaded sample Registered Charity profile (Official Donation Receipt mode).',
      };
      renderProfileScreen(root);
    });
  }

  const btnClub = root.querySelector('#btn-load-sample-club');
  if (btnClub) {
    btnClub.addEventListener('click', async () => {
      state.orgProfile = await db.saveOrgProfile({ ...SAMPLE_ACKNOWLEDGEMENT_CLUB_PROFILE });
      state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
      state.profileFeedback = {
        type: 'success',
        message: 'Loaded sample Community Club profile (Non-Tax Thank-You Acknowledgement mode).',
      };
      renderProfileScreen(root);
    });
  }

  const fileSig = root.querySelector('#file-signature');
  if (fileSig) {
    fileSig.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.orgProfile = readProfileInputsFromDom(root);
        state.orgProfile.signatureDataUrl = String(reader.result || '');
        renderProfileScreen(root);
      };
      reader.readAsDataURL(file);
    });
  }

  const btnSampleSig = root.querySelector('#btn-sample-sig');
  if (btnSampleSig) {
    btnSampleSig.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      state.orgProfile.signatureDataUrl = SAMPLE_SIGNATURE_DATA_URL;
      renderProfileScreen(root);
    });
  }

  const btnClearSig = root.querySelector('#btn-clear-sig');
  if (btnClearSig) {
    btnClearSig.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      state.orgProfile.signatureDataUrl = '';
      renderProfileScreen(root);
    });
  }

  const fileLogo = root.querySelector('#file-logo');
  if (fileLogo) {
    fileLogo.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.orgProfile = readProfileInputsFromDom(root);
        state.orgProfile.logoDataUrl = String(reader.result || '');
        renderProfileScreen(root);
      };
      reader.readAsDataURL(file);
    });
  }

  const btnClearLogo = root.querySelector('#btn-clear-logo');
  if (btnClearLogo) {
    btnClearLogo.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      state.orgProfile.logoDataUrl = '';
      renderProfileScreen(root);
    });
  }

  const btnExport = root.querySelector('#btn-export-profile');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      const jsonStr = exportOrgProfileJson(state.orgProfile);
      triggerDownload(
        jsonStr,
        `almsy-org-profile-${state.orgProfile.taxYear || 2026}.json`,
        'application/json'
      );
    });
  }

  const fileImport = root.querySelector('#file-import-profile');
  if (fileImport) {
    fileImport.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const imported = importOrgProfileJson(String(reader.result || ''));
          state.orgProfile = await db.saveOrgProfile(imported);
          state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
          state.profileFeedback = {
            type: 'success',
            message: 'Organization profile imported and saved locally.',
          };
        } catch (err) {
          state.profileFeedback = {
            type: 'error',
            message: `Import failed: ${err.message}`,
          };
        }
        renderProfileScreen(root);
      };
      reader.readAsText(file);
    });
  }

  const btnSave = root.querySelector('#btn-save-profile');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      state.orgProfile = readProfileInputsFromDom(root);
      const check = validateOrgProfile(state.orgProfile);
      if (!check.ok) {
        state.profileFeedback = {
          type: 'error',
          message: `Please fix before continuing: ${check.errors.join(' · ')}`,
        };
        renderProfileScreen(root);
        return;
      }
      state.orgProfile = await db.saveOrgProfile(check.normalized);
      state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);
      state.profileFeedback = {
        type: 'success',
        message: 'Organization profile saved to local IndexedDB.',
      };
      state.step = 'import';
      render();
    });
  }
}

/* ============================================================================
 * STEP 2: IMPORT SPREADSHEET & MAP COLUMNS
 * ========================================================================== */
function renderImportScreen(root) {
  const hasFile = state.rawHeaders.length > 0 && state.rawRows.length > 0;
  const savedMappingNames = Object.keys(state.savedMappings || {});

  root.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>2. Import Donation Spreadsheet &amp; Map Columns</h2>
          <p class="card-subtitle">
            Upload a <code>.csv</code> or <code>.xlsx</code> spreadsheet. Everything is parsed in your browser memory — donor data never leaves your computer.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn" id="btn-load-sample-140">Load sample-140.csv (140 rows)</button>
          <button type="button" class="btn" id="btn-load-messy">Load messy.csv (Error QA)</button>
          <button type="button" class="btn" id="btn-load-sample-xlsx">Load sample.xlsx (25 rows)</button>
        </div>
      </div>

      ${
        state.importFeedback
          ? `<div class="callout ${
              state.importFeedback.type === 'error' ? 'callout-warn' : 'callout-success'
            }">${escapeHtml(state.importFeedback.message)}</div>`
          : ''
      }

      <label class="dropzone" style="display:block;">
        <div class="dropzone-title">
          ${
            hasFile
              ? `📄 Loaded: ${escapeHtml(state.fileName)} (${state.rawRows.length} rows, ${state.rawHeaders.length} columns)`
              : 'Click to select a Donation Spreadsheet (.csv or .xlsx)'
          }
        </div>
        <div class="card-subtitle">
          Supports Excel (.xlsx) and CSV exports from Interac e-Transfer, bank ledgers, or Google Sheets.
        </div>
        <input type="file" id="file-spreadsheet" accept=".csv,.xlsx,.xls,text/csv" style="display:none;" />
      </label>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <div class="hint">
          🔒 <strong>Session Privacy:</strong> ${escapeHtml(PRIVACY_SESSION_NOTICE)}
          ${
            state.sessionSavedAt
              ? ` <span class="badge badge-valid">Session saved (${escapeHtml(state.sessionSavedAt.slice(0, 19))})</span>`
              : ''
          }
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${
            hasFile
              ? `<button type="button" class="btn" id="btn-save-session">Save this session</button>`
              : ''
          }
          ${
            state.sessionSavedAt
              ? `<button type="button" class="btn btn-danger" id="btn-clear-session">Clear saved session</button>`
              : ''
          }
        </div>
      </div>
    </div>

    ${
      hasFile
        ? `<div class="card">
            <div class="card-header">
              <div>
                <h3>Column Mapping (${state.rawHeaders.length} columns detected)</h3>
                <p class="card-subtitle">
                  Almsy auto-guessed your columns below. Adjust any dropdown if needed, or save this mapping for future runs.
                </p>
              </div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                ${
                  savedMappingNames.length > 0
                    ? `<select id="sel-saved-mapping" style="padding:7px 10px; border-radius:6px; border:1px solid var(--line);">
                        <option value="">Load saved mapping…</option>
                        ${savedMappingNames
                          .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
                          .join('')}
                       </select>`
                    : ''
                }
                <button type="button" class="btn" id="btn-auto-guess">Re-run Auto-Guess</button>
                <button type="button" class="btn" id="btn-save-mapping">Save Mapping Preset</button>
              </div>
            </div>

            <div class="mapping-grid">
              ${CANONICAL_FIELDS.map((field) => {
                const selectedCol = state.columnMapping[field.key] || '';
                const sampleVal =
                  selectedCol && state.rawRows[0] ? state.rawRows[0][selectedCol] || '' : '';
                const isMapped = Boolean(selectedCol);
                return `
                  <div class="mapping-card ${isMapped ? 'mapped' : field.required ? 'missing-req' : ''}">
                    <div class="field" style="margin-bottom:0;">
                      <label for="map-${escapeHtml(field.key)}">
                        ${escapeHtml(field.label)}
                        ${field.required ? '<span class="badge badge-warn">Required</span>' : ''}
                      </label>
                      <select id="map-${escapeHtml(field.key)}" data-map-field="${escapeHtml(field.key)}">
                        <option value="">— Not mapped —</option>
                        ${state.rawHeaders
                          .map(
                            (h) =>
                              `<option value="${escapeHtml(h)}" ${
                                selectedCol === h ? 'selected' : ''
                              }>${escapeHtml(h)}</option>`
                          )
                          .join('')}
                      </select>
                      <span class="hint">
                        ${
                          isMapped
                            ? `Row 1 sample: <strong>${escapeHtml(sampleVal || '(empty)')}</strong>`
                            : 'Select column if present'
                        }
                      </span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="margin-top:20px;">
              <h4>Preview of Mapped Donor Rows (First 5 of ${state.mappedRows.length})</h4>
              <div class="table-scroll" style="margin-top:8px;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Donor Full Name</th>
                      <th>Street Address</th>
                      <th>City / Prov</th>
                      <th>Postal Code</th>
                      <th>Gift Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.mappedRows
                      .slice(0, 5)
                      .map(
                        (r) => `
                          <tr>
                            <td>${r.rowIndex}</td>
                            <td><strong>${escapeHtml(r.fullName || '—')}</strong></td>
                            <td>${escapeHtml(r.addressLine1 || '—')}</td>
                            <td>${escapeHtml([r.city, r.province].filter(Boolean).join(', ') || '—')}</td>
                            <td><code>${escapeHtml(r.postalCode || '—')}</code></td>
                            <td>${escapeHtml(r.date || '—')}</td>
                            <td><strong>${escapeHtml(r.amount || '—')}</strong></td>
                            <td>${escapeHtml(r.method || '—')}</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:18px; padding-top:16px; border-top:1px solid var(--line);">
              <button type="button" class="btn" id="btn-back-profile">← Back to Profile</button>
              <button type="button" class="btn btn-primary" id="btn-proceed-validate">
                Validate ${state.mappedRows.length} Rows →
              </button>
            </div>
          </div>`
        : ''
    }
  `;

  wireImportEvents(root);
}

async function ingestParsedSheet(fileName, headers, rows) {
  state.fileName = fileName;
  state.rawHeaders = headers;
  state.rawRows = rows;

  const sig = buildHeaderSignature(headers);
  if (state.savedMappings && state.savedMappings[sig]) {
    state.columnMapping = { ...state.savedMappings[sig] };
  } else {
    state.columnMapping = autoGuessMapping(headers);
  }
  state.mappedRows = applyColumnMapping(state.rawRows, state.columnMapping);
  state.annualMergeConfirmed = false;
  state.lastRunResult = null;
  state.importFeedback = {
    type: 'success',
    message: `Loaded "${fileName}" (${rows.length} donor rows) and auto-mapped columns.`,
  };
}

function wireImportEvents(root) {
  const fileInput = root.querySelector('#file-spreadsheet');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (/\.xlsx?$/i.test(file.name)) {
          const buf = await file.arrayBuffer();
          const parsed = parseXlsxBuffer(buf);
          await ingestParsedSheet(file.name, parsed.headers, parsed.rows);
        } else {
          const text = await file.text();
          const parsed = parseCsvText(text);
          await ingestParsedSheet(file.name, parsed.headers, parsed.rows);
        }
      } catch (err) {
        state.importFeedback = {
          type: 'error',
          message: `Failed to parse file: ${err.message}`,
        };
      }
      renderImportScreen(root);
    });
  }

  const loadFixture = async (url, label, isXlsx = false) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (isXlsx) {
        const buf = await res.arrayBuffer();
        const parsed = parseXlsxBuffer(buf);
        await ingestParsedSheet(label, parsed.headers, parsed.rows);
      } else {
        const text = await res.text();
        const parsed = parseCsvText(text);
        await ingestParsedSheet(label, parsed.headers, parsed.rows);
      }
    } catch (err) {
      state.importFeedback = {
        type: 'error',
        message: `Could not load fixture ${label}: ${err.message}`,
      };
    }
    renderImportScreen(root);
  };

  root.querySelector('#btn-load-sample-140')?.addEventListener('click', () =>
    loadFixture('./fixtures/sample-140.csv', 'sample-140.csv', false)
  );
  root.querySelector('#btn-load-messy')?.addEventListener('click', () =>
    loadFixture('./fixtures/messy.csv', 'messy.csv', false)
  );
  root.querySelector('#btn-load-sample-xlsx')?.addEventListener('click', () =>
    loadFixture('./fixtures/sample.xlsx', 'sample.xlsx', true)
  );

  root.querySelectorAll('[data-map-field]').forEach((sel) => {
    sel.addEventListener('change', () => {
      state.columnMapping[sel.dataset.mapField] = sel.value;
      state.mappedRows = applyColumnMapping(state.rawRows, state.columnMapping);
      renderImportScreen(root);
    });
  });

  root.querySelector('#btn-auto-guess')?.addEventListener('click', () => {
    state.columnMapping = autoGuessMapping(state.rawHeaders);
    state.mappedRows = applyColumnMapping(state.rawRows, state.columnMapping);
    renderImportScreen(root);
  });

  root.querySelector('#btn-save-mapping')?.addEventListener('click', async () => {
    const presetName = state.fileName ? `Mapping (${state.fileName})` : 'Default Mapping';
    const sig = buildHeaderSignature(state.rawHeaders);
    await db.saveColumnMapping(presetName, state.columnMapping);
    await db.saveColumnMapping(sig, state.columnMapping);
    state.savedMappings = await db.getSavedMappings();
    state.importFeedback = {
      type: 'success',
      message: `Saved column mapping preset "${presetName}".`,
    };
    renderImportScreen(root);
  });

  root.querySelector('#sel-saved-mapping')?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (!key || !state.savedMappings[key]) return;
    state.columnMapping = { ...state.savedMappings[key] };
    state.mappedRows = applyColumnMapping(state.rawRows, state.columnMapping);
    renderImportScreen(root);
  });

  root.querySelector('#btn-save-session')?.addEventListener('click', async () => {
    await db.saveDonorSession({
      fileName: state.fileName,
      rawHeaders: state.rawHeaders,
      rawRows: state.rawRows,
      columnMapping: state.columnMapping,
      mappedRows: state.mappedRows,
    });
    const saved = await db.getSavedDonorSession();
    state.sessionSavedAt = saved?.savedAt || new Date().toISOString();
    state.importFeedback = {
      type: 'success',
      message: 'Donor session saved to local IndexedDB on this computer.',
    };
    renderImportScreen(root);
  });

  root.querySelector('#btn-clear-session')?.addEventListener('click', async () => {
    await db.clearSavedDonorSession();
    state.sessionSavedAt = null;
    state.importFeedback = {
      type: 'success',
      message: 'Cleared saved session from local IndexedDB (rows remain in memory until tab closes).',
    };
    renderImportScreen(root);
  });

  root.querySelector('#btn-back-profile')?.addEventListener('click', () => {
    state.step = 'profile';
    render();
  });

  root.querySelector('#btn-proceed-validate')?.addEventListener('click', () => {
    state.step = 'validate';
    render();
  });
}

/* ============================================================================
 * STEP 3: VALIDATE & REVIEW SCREEN
 * ========================================================================== */
function renderValidateScreen(root) {
  if (!state.mappedRows || state.mappedRows.length === 0) {
    root.innerHTML = `
      <div class="card">
        <h2>3. Validate &amp; Review</h2>
        <p class="card-subtitle">No donor spreadsheet loaded yet.</p>
        <div style="margin-top:14px;">
          <button type="button" class="btn btn-primary" id="btn-goto-import">← Go to Step 2: Import Spreadsheet</button>
        </div>
      </div>
    `;
    root.querySelector('#btn-goto-import')?.addEventListener('click', () => {
      state.step = 'import';
      render();
    });
    return;
  }

  const taxYear = state.orgProfile?.taxYear || 2026;
  const valResult = validateRows(state.mappedRows, { taxYear });
  const { counts, rows, validRows, errorRows, manualReviewRows } = valResult;

  const aggPlan = buildAggregationPlan(validRows, {
    mode: state.orgProfile?.aggregationMode || 'per-gift',
    taxYear,
  });

  let filteredRows = rows;
  if (state.validationFilter === 'error') filteredRows = errorRows;
  else if (state.validationFilter === 'valid') filteredRows = validRows;
  else if (state.validationFilter === 'manual_review') filteredRows = manualReviewRows;

  const canProceed =
    counts.errors === 0 &&
    counts.valid > 0 &&
    (!aggPlan.requiresMergeConfirmation || state.annualMergeConfirmed);

  root.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>3. Validate &amp; Review Donor Records (Tax Year ${escapeHtml(taxYear)})</h2>
          <p class="card-subtitle">
            Every row is checked against CRA &amp; Canadian address rules. Fix errors inline below; out-of-scope gifts are routed to the "Needs Manual Review" bucket.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn" id="btn-revalidate">Re-Validate All</button>
          ${
            counts.manualReview > 0
              ? `<button type="button" class="btn" id="btn-export-manual-csv">Download Manual Review CSV (${counts.manualReview})</button>`
              : ''
          }
        </div>
      </div>

      <div class="kpi-strip">
        <div class="kpi-box">
          <div class="kpi-num">${counts.total}</div>
          <div class="kpi-lbl">Total Imported Rows</div>
        </div>
        <div class="kpi-box" style="border-left:4px solid var(--green);">
          <div class="kpi-num" style="color:var(--green);">${counts.valid}</div>
          <div class="kpi-lbl">Valid &amp; Ready (${formatMoney(aggPlan.totalAmountCents)})</div>
        </div>
        <div class="kpi-box" style="border-left:4px solid var(--red);">
          <div class="kpi-num" style="color:var(--red);">${counts.errors}</div>
          <div class="kpi-lbl">Blocking Errors (Fix Inline)</div>
        </div>
        <div class="kpi-box" style="border-left:4px solid var(--amber);">
          <div class="kpi-num" style="color:var(--amber);">${counts.manualReview}</div>
          <div class="kpi-lbl">Needs Manual Review (Excluded)</div>
        </div>
      </div>

      ${
        counts.errors > 0
          ? `<div class="callout callout-warn">
              <strong>Generation Blocked (${counts.errors} error row${counts.errors === 1 ? '' : 's'}):</strong>
              Fix the highlighted red fields inline below, or move complex rows to the "Needs Manual Review" bucket before generating receipts.
            </div>`
          : `<div class="callout callout-success">
              <strong>All ${counts.valid} eligible rows pass validation!</strong>
              ${
                counts.manualReview > 0
                  ? `(${counts.manualReview} out-of-scope row(s) are safely isolated in the "Needs Manual Review" bucket and will not produce receipts.)`
                  : ''
              }
            </div>`
      }

      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin:16px 0 12px;">
        <div class="filter-pills">
          <button type="button" class="filter-pill ${state.validationFilter === 'all' ? 'active' : ''}" data-vfilter="all">
            All Rows (${counts.total})
          </button>
          <button type="button" class="filter-pill ${state.validationFilter === 'error' ? 'active' : ''}" data-vfilter="error">
            Errors Only (${counts.errors})
          </button>
          <button type="button" class="filter-pill ${state.validationFilter === 'valid' ? 'active' : ''}" data-vfilter="valid">
            Valid (${counts.valid})
          </button>
          <button type="button" class="filter-pill ${state.validationFilter === 'manual_review' ? 'active' : ''}" data-vfilter="manual_review">
            Needs Manual Review (${counts.manualReview})
          </button>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status / Issues</th>
              <th>Donor Full Name</th>
              <th>Street Address</th>
              <th>City</th>
              <th>Prov</th>
              <th>Postal Code</th>
              <th>Gift Date</th>
              <th>Amount (CAD)</th>
              <th>Method</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows
              .map((r) => {
                const fe = r.fieldErrors || {};
                const trClass =
                  r.status === 'error'
                    ? 'row-error-tr'
                    : r.status === 'manual_review'
                    ? 'row-manual-tr'
                    : '';
                return `
                  <tr class="${trClass}" data-row-id="${escapeHtml(r.id)}">
                    <td>${r.rowIndex}</td>
                    <td style="min-width:190px;">
                      ${
                        r.status === 'valid'
                          ? `<span class="badge badge-valid">✓ Valid</span>`
                          : r.status === 'manual_review'
                          ? `<span class="badge badge-warn">Needs Manual Review</span>
                             <ul class="err-list" style="color:var(--amber);">
                               ${r.manualReviewReasons.map((m) => `<li>• ${escapeHtml(m)}</li>`).join('')}
                             </ul>`
                          : `<span class="badge badge-error">✕ ${r.errors.length} Error(s)</span>
                             <ul class="err-list">
                               ${r.errors.map((e) => `<li>• ${escapeHtml(e)}</li>`).join('')}
                             </ul>`
                      }
                    </td>
                    <td>
                      <input type="text" class="inline-input ${fe.fullName ? 'has-err' : ''}"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="fullName"
                        value="${escapeHtml(r.fullName)}" placeholder="First Last" />
                    </td>
                    <td>
                      <input type="text" class="inline-input ${fe.addressLine1 ? 'has-err' : ''}"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="addressLine1"
                        value="${escapeHtml(r.addressLine1)}" placeholder="123 Main St" />
                    </td>
                    <td>
                      <input type="text" class="inline-input" style="min-width:85px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="city"
                        value="${escapeHtml(r.city)}" placeholder="City" />
                    </td>
                    <td>
                      <input type="text" class="inline-input" style="min-width:52px; max-width:64px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="province"
                        value="${escapeHtml(r.province)}" placeholder="ON" />
                    </td>
                    <td>
                      <input type="text" class="inline-input ${fe.postalCode ? 'has-err' : ''}" style="min-width:82px; max-width:98px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="postalCode"
                        value="${escapeHtml(r.postalCode)}" placeholder="M5V 2T6" />
                    </td>
                    <td>
                      <input type="text" class="inline-input ${fe.date ? 'has-err' : ''}" style="min-width:98px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="date"
                        value="${escapeHtml(r.dateRaw || r.date)}" placeholder="YYYY-MM-DD" />
                    </td>
                    <td>
                      <input type="text" class="inline-input ${fe.amount ? 'has-err' : ''}" style="min-width:86px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="amount"
                        value="${escapeHtml(r.amountRaw || r.amount)}" placeholder="$100.00" />
                    </td>
                    <td>
                      <input type="text" class="inline-input" style="min-width:90px;"
                        data-edit-id="${escapeHtml(r.id)}" data-edit-field="method"
                        value="${escapeHtml(r.method)}" placeholder="e-Transfer" />
                    </td>
                    <td style="white-space:nowrap;">
                      ${
                        r.isDuplicate && !r.duplicateConfirmed
                          ? `<button type="button" class="btn" style="padding:4px 8px; min-height:30px; font-size:11.5px;" data-confirm-dup="${escapeHtml(
                              r.id
                            )}">Confirm Distinct</button> `
                          : ''
                      }
                      ${
                        r.status !== 'manual_review'
                          ? `<button type="button" class="btn" style="padding:4px 8px; min-height:30px; font-size:11.5px;" data-move-manual="${escapeHtml(
                              r.id
                            )}">→ Manual Review</button> `
                          : `<button type="button" class="btn" style="padding:4px 8px; min-height:30px; font-size:11.5px;" data-restore-manual="${escapeHtml(
                              r.id
                            )}">Restore as Cash</button> `
                      }
                      <button type="button" class="btn btn-danger" style="padding:4px 8px; min-height:30px; font-size:11.5px;" data-delete-row="${escapeHtml(
                        r.id
                      )}">Remove</button>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${
      aggPlan.mode === 'annual' && aggPlan.mergeGroups.length > 0
        ? `<div class="card">
            <div class="card-header">
              <div>
                <h3>Annual Consolidated Mode — Donor Merge Confirmation (${aggPlan.mergeGroups.length} donors with multiple gifts)</h3>
                <p class="card-subtitle">
                  Matched by normalized donor full name + Canadian postal code. Review and confirm the merged annual totals below before generating receipts.
                </p>
              </div>
              <span class="badge badge-blue">${validRows.length} gifts → ${aggPlan.receiptItems.length} annual receipts</span>
            </div>

            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Donor Full Name</th>
                    <th>Postal Code &amp; Address</th>
                    <th>Gifts Merged</th>
                    <th>Individual Gifts</th>
                    <th>Consolidated Annual Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${aggPlan.mergeGroups
                    .map(
                      (mg) => `
                        <tr>
                          <td><strong>${escapeHtml(mg.donorFullName)}</strong></td>
                          <td><code>${escapeHtml(mg.postalCode)}</code> · ${escapeHtml(mg.donorAddress)}</td>
                          <td><span class="badge badge-blue">${mg.giftCount} gifts</span></td>
                          <td>
                            ${mg.gifts
                              .map((g) => `${escapeHtml(g.isoDate)}: <strong>${escapeHtml(g.amountFormatted)}</strong>`)
                              .join(' + ')}
                          </td>
                          <td><strong style="color:var(--blue-d); font-size:14px;">${escapeHtml(mg.amountFormatted)}</strong></td>
                        </tr>
                      `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            <div style="margin-top:14px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:600; cursor:pointer;">
                <input type="checkbox" id="chk-confirm-annual-merge" ${state.annualMergeConfirmed ? 'checked' : ''} />
                I confirm that the ${aggPlan.mergeGroups.length} donor merge group(s) above represent the same individual donors for tax year ${escapeHtml(taxYear)}.
              </label>
            </div>
          </div>`
        : ''
    }

    <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <button type="button" class="btn" id="btn-back-import">← Back to Column Mapping</button>
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="hint">
          ${
            canProceed
              ? `Ready to generate <strong>${aggPlan.receiptItems.length}</strong> ${
                  state.orgProfile?.receiptType === 'official' ? 'Official Tax Receipts' : 'Thank-You Acknowledgements'
                }.`
              : counts.errors > 0
              ? `Fix ${counts.errors} blocking error row(s) to enable generation.`
              : aggPlan.requiresMergeConfirmation && !state.annualMergeConfirmed
              ? `Confirm the Annual Donor Merge checkbox above to enable generation.`
              : 'No valid rows available.'
          }
        </span>
        <button type="button" class="btn btn-primary" id="btn-proceed-generate" ${canProceed ? '' : 'disabled'}>
          Proceed to Generate (${aggPlan.receiptItems.length} Receipts) →
        </button>
      </div>
    </div>
  `;

  wireValidateEvents(root, manualReviewRows);
}

function wireValidateEvents(root, manualReviewRows) {
  root.querySelectorAll('[data-vfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.validationFilter = btn.dataset.vfilter;
      renderValidateScreen(root);
    });
  });

  root.querySelectorAll('[data-edit-id]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const rowId = inp.dataset.editId;
      const field = inp.dataset.editField;
      const target = state.mappedRows.find((r) => r.id === rowId);
      if (!target) return;
      target[field] = inp.value.trim();
      if (field === 'fullName') {
        target.firstName = '';
        target.middleInitial = '';
        target.lastName = '';
      }
      renderValidateScreen(root);
    });
  });

  root.querySelector('#btn-revalidate')?.addEventListener('click', () => {
    renderValidateScreen(root);
  });

  root.querySelectorAll('[data-confirm-dup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowId = btn.dataset.confirmDup;
      const target = state.mappedRows.find((r) => r.id === rowId);
      if (target) {
        target.duplicateConfirmed = true;
      }
      renderValidateScreen(root);
    });
  });

  root.querySelectorAll('[data-move-manual]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowId = btn.dataset.moveManual;
      const target = state.mappedRows.find((r) => r.id === rowId);
      if (target) target.forceManualReview = true;
      renderValidateScreen(root);
    });
  });

  root.querySelectorAll('[data-restore-manual]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowId = btn.dataset.restoreManual;
      const target = state.mappedRows.find((r) => r.id === rowId);
      if (target) {
        target.forceManualReview = false;
        target.method = 'Cash';
        target.advantage = '';
        target.notes = '';
        target.isReplacement = false;
      }
      renderValidateScreen(root);
    });
  });

  root.querySelectorAll('[data-delete-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowId = btn.dataset.deleteRow;
      state.mappedRows = state.mappedRows.filter((r) => r.id !== rowId);
      renderValidateScreen(root);
    });
  });

  root.querySelector('#btn-export-manual-csv')?.addEventListener('click', () => {
    const headers = ['Row', 'Donor Full Name', 'Address', 'Postal Code', 'Date', 'Amount', 'Method', 'Manual Review Reasons'];
    const lines = [
      headers.join(','),
      ...manualReviewRows.map((r) =>
        [
          r.rowIndex,
          `"${String(r.fullName || '').replace(/"/g, '""')}"`,
          `"${String(r.addressLine1 || '').replace(/"/g, '""')}"`,
          `"${String(r.postalCode || '').replace(/"/g, '""')}"`,
          `"${String(r.dateRaw || r.date || '').replace(/"/g, '""')}"`,
          `"${String(r.amountRaw || r.amount || '').replace(/"/g, '""')}"`,
          `"${String(r.method || '').replace(/"/g, '""')}"`,
          `"${String((r.manualReviewReasons || []).join('; ')).replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    triggerDownload(
      lines.join('\n') + '\n',
      `almsy-manual-review-${state.orgProfile?.taxYear || 2026}.csv`,
      'text/csv;charset=utf-8'
    );
  });

  root.querySelector('#chk-confirm-annual-merge')?.addEventListener('change', (e) => {
    state.annualMergeConfirmed = e.target.checked;
    renderValidateScreen(root);
  });

  root.querySelector('#btn-back-import')?.addEventListener('click', () => {
    state.step = 'import';
    render();
  });

  root.querySelector('#btn-proceed-generate')?.addEventListener('click', async () => {
    await refreshRegisterState();
    state.step = 'generate';
    render();
  });
}

/* ============================================================================
 * STEP 4: GENERATE RUN (ZIP + COMBINED PDF + REGISTER CSV) & VOID ACTION
 * ========================================================================== */
function renderGenerateScreen(root) {
  const p = state.orgProfile;
  const profileCheck = validateOrgProfile(p);
  const taxYear = p?.taxYear || 2026;
  const valResult = validateRows(state.mappedRows || [], { taxYear });
  const aggPlan = buildAggregationPlan(valResult.validRows, {
    mode: p?.aggregationMode || 'per-gift',
    taxYear,
  });

  const canGenerate =
    profileCheck.ok &&
    valResult.counts.errors === 0 &&
    aggPlan.receiptItems.length > 0 &&
    !state.isGenerating;

  const startSeq = Math.max(Number(p.nextSequence) || 1, state.highestSequence + 1);
  const firstSerialPreview = formatSerial(p.receiptPrefix || 'ALM-2026-', startSeq, p.sequencePadding || 5);
  const lastSerialPreview =
    aggPlan.receiptItems.length > 0
      ? formatSerial(
          p.receiptPrefix || 'ALM-2026-',
          startSeq + aggPlan.receiptItems.length - 1,
          p.sequencePadding || 5
        )
      : firstSerialPreview;

  const sortedRegister = [...(state.registerEntries || [])].sort(
    (a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0)
  );

  root.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>4. Generate Numbered Receipts &amp; Permanent Register</h2>
          <p class="card-subtitle">
            Generates Letter PDFs on your letterhead, increments your sequential receipt counter in IndexedDB, and packages a single ZIP + combined file-copy PDF + register CSV.
          </p>
        </div>
        <span class="badge ${p.receiptType === 'official' ? 'badge-blue' : 'badge-valid'}">
          ${p.receiptType === 'official' ? 'Official Tax Receipt Mode' : 'Thank-You Acknowledgement Mode'}
        </span>
      </div>

      ${
        state.generateFeedback
          ? `<div class="callout ${
              state.generateFeedback.type === 'error' ? 'callout-warn' : 'callout-success'
            }">${escapeHtml(state.generateFeedback.message)}</div>`
          : ''
      }

      ${
        !profileCheck.ok
          ? `<div class="callout callout-warn">
              <strong>Organization Profile Incomplete:</strong> ${escapeHtml(profileCheck.errors.join(' · '))}
              <div style="margin-top:8px;">
                <button type="button" class="btn" id="btn-fix-profile">← Complete Organization Profile</button>
              </div>
            </div>`
          : ''
      }

      <div class="kpi-strip">
        <div class="kpi-box">
          <div class="kpi-num">${aggPlan.receiptItems.length}</div>
          <div class="kpi-lbl">Receipts Ready to Issue (${escapeHtml(aggPlan.mode)})</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-num" style="color:var(--blue-d);">${formatMoney(aggPlan.totalAmountCents)}</div>
          <div class="kpi-lbl">Total Eligible Amount (CAD)</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-num" style="font-size:18px; font-family:var(--font-mono);">
            ${escapeHtml(firstSerialPreview)} → ${escapeHtml(lastSerialPreview)}
          </div>
          <div class="kpi-lbl">Next Serial Range (Never Reused)</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-num">${sortedRegister.length}</div>
          <div class="kpi-lbl">Total Receipts in Local Register</div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; margin-top:16px;">
        <button type="button" class="btn" id="btn-back-validate">← Back to Validate &amp; Review</button>
        <button type="button" class="btn btn-primary" id="btn-run-generate" ${canGenerate ? '' : 'disabled'}>
          ${
            state.isGenerating
              ? 'Generating PDFs & Packaging ZIP…'
              : `Generate ${aggPlan.receiptItems.length} Numbered PDFs + ZIP + Register`
          }
        </button>
      </div>
    </div>

    ${
      state.lastRunResult
        ? `<div class="card" style="border-left:5px solid var(--green);" id="run-complete-card">
            <div class="card-header">
              <div>
                <h3>✓ Generation Run Complete (${escapeHtml(state.lastRunResult.runId)})</h3>
                <p class="card-subtitle">
                  Generated <strong>${state.lastRunResult.receiptCount}</strong> numbered PDFs + combined file copy + register in <strong>${(
                    state.lastRunResult.elapsedMs / 1000
                  ).toFixed(2)} s</strong> on-device. Next sequence number is now <strong>${
                    state.lastRunResult.nextSequenceAfter
                  }</strong>.
                </p>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button type="button" class="btn btn-success" id="btn-dl-zip">
                  ⬇ Download All Receipts (.zip)
                </button>
                <button type="button" class="btn btn-primary" id="btn-dl-combined-pdf">
                  ⬇ Download All as One Combined PDF (File Copy)
                </button>
                <button type="button" class="btn" id="btn-dl-run-csv">
                  ⬇ Download Register (.csv)
                </button>
              </div>
            </div>
          </div>`
        : ''
    }

    <div class="card">
      <div class="card-header">
        <div>
          <h3>Permanent Receipt Register (${sortedRegister.length} record${sortedRegister.length === 1 ? '' : 's'})</h3>
          <p class="card-subtitle">
            Stored in local IndexedDB. Serial numbers are never reused or decremented. Marking a receipt <strong>VOID</strong> keeps it in the register for your CRA audit trail.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${
            sortedRegister.length > 0
              ? `<button type="button" class="btn" id="btn-export-full-register">⬇ Download Register CSV (${sortedRegister.length})</button>`
              : ''
          }
        </div>
      </div>

      ${
        sortedRegister.length === 0
          ? `<div class="callout">No receipts have been generated yet. Run a batch above to populate your register.</div>`
          : `<div class="table-scroll">
              <table class="data-table" id="register-table">
                <thead>
                  <tr>
                    <th>Serial Number</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Donor Full Name</th>
                    <th>Donor Address</th>
                    <th>Amount (CAD)</th>
                    <th>Gift Date / Year</th>
                    <th>Issued</th>
                    <th>Run ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedRegister
                    .map(
                      (entry) => `
                        <tr data-serial="${escapeHtml(entry.serialNumber)}">
                          <td><code style="font-weight:700;">${escapeHtml(entry.serialNumber)}</code></td>
                          <td>
                            <span class="badge ${entry.receiptType === 'official' ? 'badge-blue' : 'badge-valid'}">
                              ${escapeHtml(entry.receiptType)}
                            </span>
                          </td>
                          <td>
                            ${
                              entry.status === 'VOID'
                                ? `<span class="badge badge-error" title="${escapeHtml(entry.voidReason || '')}">VOID</span>`
                                : `<span class="badge badge-valid">ISSUED</span>`
                            }
                          </td>
                          <td><strong>${escapeHtml(entry.donorName)}</strong></td>
                          <td>${escapeHtml(entry.donorAddress)}</td>
                          <td><strong>${escapeHtml(entry.amountFormatted || formatMoney(entry.amountCents))}</strong></td>
                          <td>${escapeHtml(entry.giftDateOrYear)}</td>
                          <td>${escapeHtml(entry.issueDate)}</td>
                          <td><small>${escapeHtml(entry.runId)}</small></td>
                          <td style="white-space:nowrap;">
                            <button type="button" class="btn" style="padding:4px 8px; min-height:30px; font-size:11.5px;"
                              data-dl-single="${escapeHtml(entry.serialNumber)}">
                              PDF
                            </button>
                            ${
                              entry.status !== 'VOID'
                                ? `<button type="button" class="btn btn-danger" style="padding:4px 8px; min-height:30px; font-size:11.5px;"
                                    data-void-serial="${escapeHtml(entry.serialNumber)}">
                                    Void
                                  </button>`
                                : `<small style="color:var(--red); margin-left:6px;">${escapeHtml(
                                    entry.voidReason || 'Voided'
                                  )}</small>`
                            }
                          </td>
                        </tr>
                      `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>
  `;

  wireGenerateEvents(root);
}

function wireGenerateEvents(root) {
  root.querySelector('#btn-fix-profile')?.addEventListener('click', () => {
    state.step = 'profile';
    render();
  });

  root.querySelector('#btn-back-validate')?.addEventListener('click', () => {
    state.step = 'validate';
    render();
  });

  root.querySelector('#btn-run-generate')?.addEventListener('click', async () => {
    try {
      state.isGenerating = true;
      state.generateFeedback = null;
      renderGenerateScreen(root);

      const runResult = await executeGenerationRun({
        db,
        rows: state.mappedRows,
      });

      state.lastRunResult = runResult;
      state.isGenerating = false;
      await refreshRegisterState();
      state.generateFeedback = {
        type: 'success',
        message: `Generated ${runResult.receiptCount} receipts (${runResult.assignedReceipts[0].serialNumber} to ${
          runResult.assignedReceipts[runResult.assignedReceipts.length - 1].serialNumber
        }) in ${(runResult.elapsedMs / 1000).toFixed(2)}s.`,
      };
    } catch (err) {
      state.isGenerating = false;
      state.generateFeedback = {
        type: 'error',
        message: `Generation failed: ${err.message}`,
      };
    }
    renderGenerateScreen(root);
  });

  root.querySelector('#btn-dl-zip')?.addEventListener('click', () => {
    if (!state.lastRunResult) return;
    triggerDownload(
      state.lastRunResult.zipBytes,
      `Almsy_Receipts_${state.lastRunResult.runId}.zip`,
      'application/zip'
    );
  });

  root.querySelector('#btn-dl-combined-pdf')?.addEventListener('click', () => {
    if (!state.lastRunResult) return;
    triggerDownload(
      state.lastRunResult.combinedPdfBytes,
      `FILE_COPY_Combined_${state.lastRunResult.runId}.pdf`,
      'application/pdf'
    );
  });

  root.querySelector('#btn-dl-run-csv')?.addEventListener('click', () => {
    if (!state.lastRunResult) return;
    triggerDownload(
      state.lastRunResult.registerCsvText,
      `Receipt_Register_${state.orgProfile?.taxYear || 2026}.csv`,
      'text/csv;charset=utf-8'
    );
  });

  root.querySelector('#btn-export-full-register')?.addEventListener('click', () => {
    const csv = exportRegisterCsv(state.registerEntries);
    triggerDownload(
      csv,
      `Receipt_Register_${state.orgProfile?.taxYear || 2026}.csv`,
      'text/csv;charset=utf-8'
    );
  });

  // Download individual receipt PDF from register (renders with VOID banner if status === 'VOID')
  root.querySelectorAll('[data-dl-single]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const serial = btn.dataset.dlSingle;
      const entry = state.registerEntries.find((e) => e.serialNumber === serial);
      if (!entry) return;
      try {
        const model = buildReceiptModel({
          orgProfile: {
            ...state.orgProfile,
            receiptType: entry.receiptType,
          },
          item: {
            donorFullName: entry.donorName,
            donorAddress: entry.donorAddress,
            amountCents: entry.amountCents,
            giftDateOrYear: entry.giftDateOrYear,
            status: entry.status,
          },
          serialNumber: entry.serialNumber,
          issueDate: entry.issueDate,
        });
        const pdfBytes = await renderSingleReceiptPdf(model);
        triggerDownload(pdfBytes, `${entry.serialNumber}.pdf`, 'application/pdf');
      } catch (err) {
        state.generateFeedback = {
          type: 'error',
          message: `Failed to render PDF for ${serial}: ${err.message}`,
        };
        renderGenerateScreen(root);
      }
    });
  });

  // Void receipt in register (never reuses or decrements serial number)
  root.querySelectorAll('[data-void-serial]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const serial = btn.dataset.voidSerial;
      await voidReceipt(db, serial, 'Voided in register by treasurer');
      await refreshRegisterState();
      state.generateFeedback = {
        type: 'success',
        message: `Receipt ${serial} marked VOID in permanent register. Serial number ${serial} is permanently retired and will never be reused.`,
      };
      renderGenerateScreen(root);
    });
  });
}

if (typeof document !== 'undefined') {
  init();
}
