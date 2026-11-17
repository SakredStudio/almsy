/**
 * Almsy Desk — Supported plan (CA$79/year per charity).
 *
 * Almsy Desk itself stays free and complete. The source is public, so there is deliberately no licence check:
 * nothing here locks, unlocks or limits a feature. The plan is a service (setup call, receipt-season help,
 * wording checks, early fixes). Donor data never leaves the device on any plan.
 *
 * SWITCH (Soul): paste the Stripe Payment Link (https://buy.stripe.com/...) below to turn on paying online,
 * bump CACHE_NAME in sw.js, then publish. Empty = a "Talk to us" email button instead.
 */
export const SUPPORTED_PLAN_PAYMENT_LINK = '';

export const BILLING_EMAIL = 'office@sakredstudio.ca';
export const SELLER = '17899181 CANADA INC., carrying on business as Sakred Studio';
export const SUPPORTED_PLAN = Object.freeze({
  name: 'Supported plan',
  priceCad: 79,
  includes: Object.freeze([
    'A setup call to get your profile, numbering and first batch right.',
    'Priority help during receipt season (January and February).',
    'A check that the receipt wording matches current CRA rules.',
    'Early fixes when something needs changing.',
  ]),
});
/** IndexedDB setting (settings store) that remembers the after-export prompt was closed. */
export const PROMPT_SETTING_KEY = 'supportedPlanPrompt';

const PAY_LINK_RE = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+(\?[A-Za-z0-9_=&%.+-]*)?$/;
export function isPaymentLink(url) {
  return typeof url === 'string' && PAY_LINK_RE.test(url.trim());
}

export function talkToUsHref() {
  return `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent('Almsy Desk for organizations - Supported plan')}`;
}

/** What the plan button does: pay through the Payment Link, or (switched off) email us. */
export function supportedPlanAction(link = SUPPORTED_PLAN_PAYMENT_LINK) {
  if (isPaymentLink(link)) {
    return { kind: 'pay', href: link.trim(), label: `Pay CA$${SUPPORTED_PLAN.priceCad} by card` };
  }
  return { kind: 'talk', href: talkToUsHref(), label: 'Talk to us' };
}

export const SUPPORTED_TERMS = Object.freeze([
  `Sold by ${SELLER}, Toronto, Ontario. Prices are in Canadian dollars, per year, plus applicable tax.`,
  'Cancel any time: the plan runs to the end of the year you paid for. Your first payment is refundable within 7 days. No partial refunds after that.',
  `Billing questions: ${BILLING_EMAIL}. This is help with the software, not tax or legal advice.`,
]);

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The "Supported plan" card (Organization Profile screen). */
export function renderSupportedPlanCard(link = SUPPORTED_PLAN_PAYMENT_LINK) {
  const act = supportedPlanAction(link);
  const talk = talkToUsHref();
  return `
    <div class="card supported-card" id="supported-plan">
      <div class="card-header">
        <div>
          <h3>Supported plan</h3>
          <p class="card-subtitle">Almsy Desk stays free and complete for small charities. Nothing is locked, on any plan.</p>
        </div>
        <span class="badge badge-blue">CA$${SUPPORTED_PLAN.priceCad} / year</span>
      </div>
      <p class="supported-lead">For charities that would like a hand, the Supported plan adds:</p>
      <ul class="supported-list">
        ${SUPPORTED_PLAN.includes.map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul>
      <p class="supported-price"><strong>CA$${SUPPORTED_PLAN.priceCad} per year, per charity, + applicable tax.</strong>
        Founding pilot charities get their first year free: <a href="${esc(talk)}">ask us</a>.</p>
      <div class="callout supported-privacy">🔒 Donor data never leaves your device, on any plan. We never ask you to send us your donor list.</div>
      <div class="supported-actions">
        <a class="btn btn-primary" href="${esc(act.href)}"${act.kind === 'pay' ? ' rel="noopener"' : ''}>${esc(act.label)}</a>
        ${act.kind === 'pay' ? `<a class="btn" href="${esc(talk)}">Talk to us</a>` : ''}
      </div>
      <div class="supported-terms">${SUPPORTED_TERMS.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
    </div>`;
}

/** The gentle prompt shown after a batch export of receipts, until it is closed once. */
export function renderSupportedPrompt() {
  return `
    <div class="callout supported-prompt" id="supported-prompt" role="note">
      <div><strong>Receipts done.</strong> Almsy Desk stays free. If you would like a setup call and priority help in receipt season,
        the Supported plan is CA$${SUPPORTED_PLAN.priceCad} a year per charity (+ applicable tax).</div>
      <div class="supported-prompt-actions">
        <button type="button" class="btn" id="btn-see-supported">See the Supported plan</button>
        <button type="button" class="btn" id="btn-dismiss-supported">No thanks</button>
      </div>
    </div>`;
}

/** Show the prompt after an export unless it was closed before (remembered in the local IndexedDB settings). */
export async function shouldShowSupportedPrompt(db) {
  try {
    const saved = await db.getSetting(PROMPT_SETTING_KEY, null);
    return !(saved && saved.dismissed);
  } catch {
    return false;
  }
}

export async function dismissSupportedPrompt(db, now = new Date()) {
  await db.setSetting(PROMPT_SETTING_KEY, { dismissed: true, at: now.toISOString().slice(0, 10) });
}
