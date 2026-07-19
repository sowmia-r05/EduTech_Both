// src/instrument.js
//
// Sentry initialisation for the backend. This file MUST be loaded before any
// other module (especially before express) or auto-instrumentation won't hook
// in. server.js requires it as its very first line.
//
// dotenv is loaded here too, so SENTRY_DSN / release are available locally
// (from .env) AND on Render (real env vars — dotenv is a harmless no-op there).

require("dotenv").config();
const Sentry = require("@sentry/node");

Sentry.init({
  // If SENTRY_DSN is unset (e.g. local dev without a key), Sentry becomes a
  // no-op — nothing is sent, nothing breaks.
  dsn: process.env.SENTRY_DSN,

  environment: process.env.NODE_ENV || "development",

  // ── RELEASE TAG ──
  // Render injects RENDER_GIT_COMMIT automatically. Set SENTRY_RELEASE yourself
  // if you'd rather tag by version. This value MUST match the frontend's
  // release (both use the git SHA) so a deploy lines up across both apps.
  release:
    process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || undefined,

  // Error tracking only by default (0 = no performance transactions, no quota
  // burn). Bump to e.g. 0.1 later if you want tracing.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),

  // Express 5: tracing instrumentation is partial. This silences the noisy
  // "express is not instrumented" warning. Error capture is unaffected.
  disableInstrumentationWarnings: true,

  // Don't ship request bodies / user PII to Sentry by default.
  sendDefaultPii: false,
});

console.log(
  `🛰️  Sentry ${process.env.SENTRY_DSN ? "initialised" : "disabled (no DSN)"}` +
    (process.env.RENDER_GIT_COMMIT ? ` — release ${process.env.RENDER_GIT_COMMIT.slice(0, 7)}` : "")
);

module.exports = Sentry;