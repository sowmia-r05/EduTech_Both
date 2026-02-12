const sgMail = require("@sendgrid/mail");

function assertMailEnv() {
  if (!process.env.SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY");
  if (!process.env.FROM_EMAIL) throw new Error("Missing FROM_EMAIL");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendNextQuizMail({ to, name, quizTitle, quizUrl }) {
  assertMailEnv();

  const subject = "Your next quiz is ready";
  const text =
    `Hi ${name || ""},\n\n` +
    `Your next quiz has been assigned: ${quizTitle}\n` +
    (quizUrl ? `Open: ${quizUrl}\n` : "") +
    `\nAll the best!\n`;

  await sgMail.send({
    to,
    from: process.env.FROM_EMAIL,
    subject,
    text,
  });
}

module.exports = { sendNextQuizMail };
