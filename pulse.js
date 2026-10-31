// Sakred Pulse client (T1). A plain script, no module syntax, so one tag works in every app:
//   <script src="pulse.js" data-app="almsy" defer></script>
// That tag sends one `open` per page load, `install` on the PWA appinstalled event, and one `error` per page
// load on the first uncaught exception. It also exposes window.sakredPulse for the app:
//   sakredPulse.track('purchase', 1999);   sakredPulse.track('paywall_view');
// Without data-app nothing is sent; call window.pulse('<app>') yourself to get a tracker.
// The payload is ONLY { app, event, v }. Never pass anything that could identify a person.
// Fire-and-forget: never throws, never blocks the UI, silently drops when offline or blocked.
// The Worker checks the page Origin against cloud/pulse/apps.json, so a new app must be registered there first.
(function () {
  var PULSE_URL = 'https://sakred-pulse.mihir86-mp.workers.dev/e';

  function pulse(app, url) {
    url = url || PULSE_URL;
    var errored = false;
    function send(event, v) {
      try {
        var body = JSON.stringify(v ? { app: app, event: event, v: Math.round(v) } : { app: app, event: event });
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, body)) return;
        if (typeof fetch === 'function') fetch(url, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
      } catch (e) { /* analytics must never break the app */ }
    }
    return {
      track: send,
      autoOpen: function () {
        send('open');
        try { window.addEventListener('appinstalled', function () { send('install'); }); } catch (e) {}
      },
      catchErrors: function () {
        var once = function () { if (!errored) { errored = true; send('error'); } };   // one per page load, so a loop cannot flood the counter
        try { window.addEventListener('error', once); window.addEventListener('unhandledrejection', once); } catch (e) {}
      }
    };
  }

  try {
    window.pulse = pulse;
    var s = document.currentScript;
    var app = s && s.dataset && s.dataset.app;
    if (app) { var p = pulse(app); p.autoOpen(); p.catchErrors(); window.sakredPulse = p; }
  } catch (e) { /* no DOM */ }
})();
