// src/routes/supportRoutes.js
//
// Support contact endpoint. Takes the SupportWidget form and emails it to your
// support inbox via your existing Brevo helper, then sends the parent an
// auto-reply so they know it landed.
//
// Register in app.js (near your other routes):
//   const supportRoutes = require("./routes/supportRoutes");
//   app.use("/api/support", supportRoutes);
//
// Set SUPPORT_EMAIL in Render (.env). Defaults to support@kaisolutions.ai.

const router = require("express").Router();
const { sendBrevoEmail } = require("../services/brevoEmail");

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@kaisolutions.ai";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/.test(String(e || "").trim());
}

router.post("/contact", async (req, res) => {
  try {
    let { name = "", email = "", childUsername = "", category = "", message = "" } = req.body || {};

    name = String(name).trim().slice(0, 120);
    email = String(email).trim().slice(0, 200);
    childUsername = String(childUsername).trim().slice(0, 80);
    category = String(category).trim().slice(0, 60);
    message = String(message).trim().slice(0, 4000);

    if (!looksLikeEmail(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (message.length < 5) {
      return res.status(400).json({ error: "Please describe the problem." });
    }

    const subject = `[Support] ${category || "General"} - ${email}`;
    const html = `
      <h2>New support request</h2>
      <p><strong>From:</strong> ${esc(name) || "(no name)"} &lt;${esc(email)}&gt;</p>
      <p><strong>Category:</strong> ${esc(category) || "General"}</p>
      <p><strong>Child username:</strong> ${esc(childUsername) || "(not provided)"}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${esc(message)}</p>
      <hr/>
      <p style="color:#888">Reply directly to ${esc(email)}.</p>
    `;
    const text =
      `New support request\n` +
      `From: ${name} <${email}>\n` +
      `Category: ${category}\n` +
      `Child username: ${childUsername}\n\n` +
      `${message}\n\n` +
      `Reply to ${email}.`;

    // 1) Notify the support inbox (must succeed).
    await sendBrevoEmail({ toEmail: SUPPORT_EMAIL, subject, text, html });

    // 2) Auto-reply to the parent (best-effort; don't fail the request if it errors).
    try {
      await sendBrevoEmail({
        toEmail: email,
        subject: "We've received your message - NAPLAN Prep",
        text:
          "Thanks for contacting NAPLAN Prep. We've received your message and will reply within 1 business day. " +
          "If your child can't log in after a payment, please include your account email and your child's username.",
        html:
          `<p>Thanks for contacting NAPLAN Prep. We've received your message and will reply within <strong>1 business day</strong>.</p>` +
          `<p>If your child can't log in after a payment, please make sure you included your account email and your child's username - it helps us fix it fastest.</p>`,
      });
    } catch (e) {
      console.error("support auto-reply failed:", e.message);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("support contact error:", err.message);
    return res.status(500).json({
      error: "Could not send your message. Please email support@kaisolutions.ai directly.",
    });
  }
});

module.exports = router;