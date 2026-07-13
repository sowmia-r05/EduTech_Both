// src/utils/logger.js
// Structured JSON logger (pino). Use `logger.info({...}, "msg")` instead of console.log.
// In dev it pretty-prints; in prod it emits JSON that Render/log tools can parse.

const pino = require("pino");

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  // Redact sensitive fields so tokens/passwords never land in logs.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "otp",
      "*.otp",
    ],
    censor: "[redacted]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

module.exports = logger;