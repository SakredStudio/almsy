import { ALMSY_DISCLAIMER_FOOTER, PRIVACY_SESSION_NOTICE } from './lib/cra-text.js';
import { createAlmsyDb } from './lib/db.js';
import { formatMoney } from './lib/money.js';

const db = createAlmsyDb();

const state = {
  step: 'profile',
  orgProfile: null,
};

async function init() {
  const footerDisclaimer = document.getElementById('footer-disclaimer');
  if (footerDisclaimer) footerDisclaimer.textContent = ALMSY_DISCLAIMER_FOOTER;

  const sessionNotice = document.getElementById('footer-session-notice');
  if (sessionNotice) sessionNotice.textContent = PRIVACY_SESSION_NOTICE;

  state.orgProfile = await db.getOrgProfile();

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

  root.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Almsy Desk Workspace (${state.step.toUpperCase()})</h2>
          <p class="card-subtitle">Active Mode: ${
            state.orgProfile?.receiptType === 'official'
              ? 'Official Donation Receipt (Registered Charity)'
              : 'Thank-You Acknowledgement (Non-Tax)'
          } · Tax Year ${state.orgProfile?.taxYear || 2026} · Sample Format: ${formatMoney(125000)}</p>
        </div>
      </div>
      <div class="callout">
        ${PRIVACY_SESSION_NOTICE}
      </div>
    </div>
  `;
}

if (typeof document !== 'undefined') {
  init();
}
