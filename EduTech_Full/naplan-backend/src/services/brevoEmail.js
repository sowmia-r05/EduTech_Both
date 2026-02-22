// src/services/brevoEmail.js
// Send email using Brevo API (HTTPS). This avoids SMTP port blocks on Render.

const axios = require("axios");

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function sendBrevoEmail({ toEmail, subject, text, html }) {
  const apiKey = requiredEnv("BREVO_API_KEY");

  const fromName = process.env.MAIL_FROM_NAME || "KAI Solutions";
  const fromEmail = process.env.MAIL_FROM_EMAIL || "no-reply@kaisolutions.ai";

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: toEmail }],
      subject,
      textContent: text,
      htmlContent: html,
    },
    {
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      timeout: 20000,
    }
  );
}

module.exports = { sendBrevoEmail };