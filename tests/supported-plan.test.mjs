import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAlmsyDb, createMemoryBacking } from '../lib/db.js';
import {
  SUPPORTED_PLAN_PAYMENT_LINK,
  SUPPORTED_PLAN,
  SUPPORTED_TERMS,
  isPaymentLink,
  supportedPlanAction,
  talkToUsHref,
  renderSupportedPlanCard,
  renderSupportedPrompt,
  shouldShowSupportedPrompt,
  dismissSupportedPrompt,
  PROMPT_SETTING_KEY,
  priceForYear,
  INCREASE_TERM,
} from '../lib/supported-plan.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('supported plan: ships switched off, so the button emails office@ with the plan in the subject', () => {
  assert.equal(SUPPORTED_PLAN_PAYMENT_LINK, '');
  assert.equal(SUPPORTED_PLAN.priceCad, 79);
  const act = supportedPlanAction();
  assert.equal(act.kind, 'talk');
  assert.equal(act.label, 'Talk to us');
  assert.equal(act.href, 'mailto:office@sakredstudio.ca?subject=Almsy%20Desk%20for%20organizations%20-%20Supported%20plan');
  assert.equal(talkToUsHref(), act.href);
});

test('supported plan: only a Stripe Payment Link switches on paying online', () => {
  assert.ok(isPaymentLink('https://buy.stripe.com/aBc123'));
  for (const bad of ['', 'http://buy.stripe.com/x', 'https://buy.stripe.com.evil.io/x', 'javascript:alert(1)', 'https://example.com/pay', null]) {
    assert.equal(isPaymentLink(bad), false, String(bad));
  }
  const on = supportedPlanAction('https://buy.stripe.com/aBc123');
  assert.deepEqual(on, { kind: 'pay', href: 'https://buy.stripe.com/aBc123', label: 'Pay CA$79 by card' });
  const card = renderSupportedPlanCard('https://buy.stripe.com/aBc123');
  assert.match(card, /href="https:\/\/buy\.stripe\.com\/aBc123"/);
  assert.match(card, /Talk to us/, 'pilot charities can still email us when paying is on');
});

test('supported plan: card says it stays free, keeps the donor-data promise, shows price, tax and refund terms', () => {
  const card = renderSupportedPlanCard();
  assert.match(card, /stays free and complete for small charities/);
  assert.match(card, /Donor data never leaves your device/);
  assert.match(card, /CA\$79 per year, per charity, \+ applicable tax/);
  assert.match(card, /first year free/);
  assert.match(card, /ask us/);
  assert.match(card, /setup call/);
  assert.match(card, /receipt season \(January and February\)/);
  assert.match(card, /current CRA rules/);
  assert.match(card, /Early fixes/);
  assert.match(card, /17899181 CANADA INC\., carrying on business as Sakred Studio/);
  assert.match(card, /refundable within 7 days/);
  assert.match(card, /No partial refunds/);
  assert.match(card, /runs to the end of the year you paid for/);
  assert.match(card, /not tax or legal advice/);
  assert.doesNotMatch(card, /buy\.stripe\.com/);
  assert.equal(SUPPORTED_TERMS.length, 4);
  assert.ok(card.includes('Prices rise by 4% at each yearly renewal, rounded to the nearest dollar. We email you at least 30 days before an increase, and you can cancel before it takes effect.'));
  assert.match(renderSupportedPrompt(), /Almsy Desk stays free/);
  assert.match(renderSupportedPrompt(), /No thanks/);
});

test('supported plan: no licence gate anywhere: nothing checks the plan to lock or unlock a feature', () => {
  const src = fs
    .readFileSync(path.join(appRoot, 'lib/supported-plan.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /licen[cs]e\s*(key|check|valid)/i);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon/, 'no network calls');
  const app = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /isSupported|hasSupportedPlan|supportedPlanActive/);
});

test('supported plan: 4% yearly increase = round(79 × 1.04^(year-1)): 79, 82, 85', () => {
  assert.deepEqual([1, 2, 3].map((y) => priceForYear(79, y)), [79, 82, 85]);
  assert.equal(priceForYear(79, 4), Math.round(79 * 1.04 ** 3));
  assert.throws(() => priceForYear(79, 0));
  assert.ok(SUPPORTED_TERMS.includes(INCREASE_TERM));
});

test('supported plan: the after-export prompt shows until closed once, and the close is remembered locally', async () => {
  const backing = createMemoryBacking();
  const db = createAlmsyDb({ backing });
  assert.equal(await shouldShowSupportedPrompt(db), true);
  await dismissSupportedPrompt(db, new Date('2026-11-16T12:00:00Z'));
  assert.deepEqual(await db.getSetting(PROMPT_SETTING_KEY, null), { dismissed: true, at: '2026-11-16' });
  const reloaded = createAlmsyDb({ backing });
  assert.equal(await shouldShowSupportedPrompt(reloaded), false, 'survives a reload');
  const broken = { getSetting: async () => { throw new Error('blocked'); } };
  assert.equal(await shouldShowSupportedPrompt(broken), false, 'never nags when storage fails');
});
