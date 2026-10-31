// Sakred Pulse client (T1). Copy this file into the app (no build step needed) or import it.
//   import { pulse } from './pulse.js';           const p = pulse('almsy');
//   p.track('open');  p.track('purchase', 1999);  p.track('error');
//   p.autoOpen();   → one `open` per page load + `install` on the PWA appinstalled event
//   p.catchErrors() → one `error` per uncaught exception / unhandled rejection (no message is sent)
// The payload is ONLY { app, event, v }. Never pass anything that could identify a person.
// Fire-and-forget: never throws, never blocks the UI, silently drops when offline or blocked.
// The Worker checks the page Origin against cloud/pulse/apps.json, so a new app must be registered there first.
const PULSE_URL = 'https://sakred-pulse.mihir86-mp.workers.dev/e';

export function pulse(app, url = PULSE_URL) {
  const send = (event, v) => {
    try {
      const body = JSON.stringify(v ? { app, event, v: Math.round(v) } : { app, event });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, body)) return;
      if (typeof fetch === 'function') fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    } catch { /* analytics must never break the app */ }
  };
  let errored = false;
  return {
    track: send,
    autoOpen() {
      send('open');
      try { window.addEventListener('appinstalled', () => send('install')); } catch {}
    },
    catchErrors() {
      const once = () => { if (!errored) { errored = true; send('error'); } };   // one per page load, so a loop cannot flood the counter
      try { window.addEventListener('error', once); window.addEventListener('unhandledrejection', once); } catch {}
    },
  };
}

// Script-tag use (no modules): <script src="pulse.js" data-app="almsy"></script>
try {
  const s = typeof document !== 'undefined' && document.currentScript;
  const app = s && s.dataset && s.dataset.app;
  if (app) { const p = pulse(app); p.autoOpen(); p.catchErrors(); window.sakredPulse = p; }
} catch { /* module context */ }
