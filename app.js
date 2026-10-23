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

const db = createAlmsyDb();

const state = {
  step: 'profile',
  orgProfile: null,
  highestSequence: 0,
  profileFeedback: null, // { type: 'success'|'error', message: string }
};

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function init() {
  const footerDisclaimer = document.getElementById('footer-disclaimer');
  if (footerDisclaimer) footerDisclaimer.textContent = ALMSY_DISCLAIMER_FOOTER;

  const sessionNotice = document.getElementById('footer-session-notice');
  if (sessionNotice) sessionNotice.textContent = PRIVACY_SESSION_NOTICE;

  state.orgProfile = await db.getOrgProfile();
  state.highestSequence = await db.getHighestSequence(state.orgProfile.receiptPrefix);

  const nav = document.getElementById('step-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-step]');
      if (!btn) return;
      state.step = btn.dataset.step;
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

  root.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Step: ${escapeHtml(state.step.toUpperCase())}</h2>
          <p class="card-subtitle">Active Organization: ${escapeHtml(
            state.orgProfile?.legalName || '(Not configured yet)'
          )}</p>
        </div>
      </div>
      <div class="callout">${escapeHtml(PRIVACY_SESSION_NOTICE)}</div>
    </div>
  `;
}

function renderProfileScreen(root) {
  const p = state.orgProfile;
  const validation = validateOrgProfile(p);
  const isOfficial = p.receiptType === 'official';
  const serialPreview = formatSerialNumberPreview(p);
  const minSeq = Math.max(1, state.highestSequence + 1);

  root.innerHTML = `
    <div class="grid-2">
      <!-- Left Column: Organization Profile Form -->
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
                  For clubs, unregistered temples, and community groups. Clearly states it is <strong>not</strong> an official receipt for income tax purposes.
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

      <!-- Right Column: Live Letterhead & Receipt Preview -->
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
                       <div class="rp-val" style="font-size:12px; color:var(--amber);">Not an official receipt for income tax purposes.</div>`
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
  // Receipt mode cards
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

  // Live input sync on change
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

  // Load sample charity
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

  // Load sample club
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

  // Signature upload / sample / clear
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

  // Logo upload / clear
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

  // Export profile JSON
  const btnExport = root.querySelector('#btn-export-profile');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      state.orgProfile = readProfileInputsFromDom(root);
      const jsonStr = exportOrgProfileJson(state.orgProfile);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `almsy-org-profile-${state.orgProfile.taxYear || 2026}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Import profile JSON
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
      reader.readAsDataURL ? reader.readAsText(file) : null;
    });
  }

  // Save profile & continue
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

if (typeof document !== 'undefined') {
  init();
}
