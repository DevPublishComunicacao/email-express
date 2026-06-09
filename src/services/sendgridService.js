const fs = require("fs");
const path = require("path");

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

function getApiKey() {
  return process.env.SENDGRID_API_KEY;
}

function isConfigured() {
  return !!getApiKey();
}

async function sendMail({ from, to, subject, html, text, attachments }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("SENDGRID_API_KEY não configurada.");

  const personalizations = [{ to: [{ email: to }] }];

  const content = [];
  if (html) content.push({ type: "text/html", value: html });
  if (text) content.push({ type: "text/plain", value: text });

  const payload = {
    personalizations,
    from: { email: from },
    reply_to: { email: from },
    subject,
    content,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((att) => {
      const filePath = att.path;
      const filename = att.filename || path.basename(filePath);
      const contentBuffer = fs.readFileSync(filePath);
      const contentBase64 = contentBuffer.toString("base64");
      return {
        content: contentBase64,
        filename,
        type: att.contentType || att.cid ? "image/png" : undefined,
        disposition: att.cid ? "inline" : "attachment",
        content_id: att.cid || undefined,
      };
    });
  }

  const res = await fetch(SENDGRID_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${body}`);
  }
}

module.exports = { sendMail, isConfigured };
