const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CATEGORY_KEYWORDS = [
  { name: "Trabalho", keywords: ["trabalho", "empresa", "reunião", "projeto", "escritório", "job", "meeting", "office", "business", "contrato", "invoice", "fatura"], color: "#1877f2" },
  { name: "Pessoal", keywords: ["pessoal", "amigo", "família", "convite", "festa", "personal", "friend", "family", "invitation", "party"], color: "#42b72a" },
  { name: "Financeiro", keywords: ["banco", "fatura", "pagamento", "boleto", "saldo", "extrato", "bank", "payment", "bill", "balance", "statement", "transação", "transaction"], color: "#e4405f" },
  { name: "Promoções", keywords: ["promoção", "desconto", "oferta", "cupom", "sale", "discount", "offer", "coupon", "promo", "black friday"], color: "#f7931e" },
  { name: "Newsletter", keywords: ["newsletter", "informativo", "novidades", "blog", "news", "digest", "inscrição", "subscribe", "unsubscribe"], color: "#8b5cf6" },
  { name: "Social", keywords: ["linkedin", "facebook", "instagram", "twitter", "youtube", "github", "social", "notificação", "notification"], color: "#1da1f2" },
  { name: "Compras", keywords: ["compra", "pedido", "entrega", "envio", "order", "purchase", "shipping", "delivery", "tracking", "carrinho", "cart"], color: "#e91e63" },
  { name: "Outros", keywords: [], color: "#9e9e9e" },
];

function classifyEmail(subject, from, textBody) {
  const text = `${subject} ${from} ${textBody}`.toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.name === "Outros") continue;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) return cat.name;
    }
  }
  return "Outros";
}

async function ensureSystemCategories(userId) {
  const existing = await prisma.category.findMany({ where: { userId } });
  const existingNames = new Set(existing.map((c) => c.name));
  for (const cat of CATEGORY_KEYWORDS) {
    if (!existingNames.has(cat.name)) {
      await prisma.category.create({
        data: { userId, name: cat.name, color: cat.color, isSystem: true },
      });
    }
  }
}

async function fetchEmails(userId) {
  const config = await prisma.emailConfig.findUnique({ where: { userId } });
  if (!config) throw new Error("Configuração de e-mail não encontrada.");

  await ensureSystemCategories(userId);

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.appPassword,
      host: config.imapHost,
      port: config.imapPort,
      tls: config.imapSecure,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
      keepalive: false,
    });

    const emails = [];
    let finished = false;

    function finish(err, result) {
      if (finished) return;
      finished = true;
      try { imap.end(); } catch (e) {}
      if (err) reject(err);
      else resolve(result);
    }

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) return finish(err);

        const since = new Date();
        since.setDate(since.getDate() - 30);

        imap.search(["ALL", ["SINCE", since.toISOString()]], (err, results) => {
          if (err) return finish(err);
          if (!results || results.length === 0) return finish(null, []);

          const maxFetch = Math.min(results.length, 50);
          const fetch = imap.fetch(results.slice(-maxFetch), { bodies: "" });
          let processed = 0;

          fetch.on("message", (msg) => {
            let buffer = "";
            msg.on("body", (stream) => {
              stream.on("data", (chunk) => (buffer += chunk.toString("utf8")));
            });
            msg.once("end", () => {
              processed++;
              simpleParser(buffer).then(async (parsed) => {
                const from = parsed.from?.text || "";
                let category = classifyEmail(
                  parsed.subject || "",
                  from,
                  parsed.text || ""
                );

                const knownEmail = await prisma.emailMessage.findFirst({
                  where: { userId, from, category: { not: "Outros" } },
                  orderBy: { receivedAt: "desc" },
                });
                if (knownEmail) {
                  category = knownEmail.category;
                }

                emails.push({
                  messageId: parsed.messageId || `${processed}-${Date.now()}`,
                  from,
                  to: parsed.to?.text || "",
                  subject: parsed.subject || "",
                  textBody: (parsed.text || "").substring(0, 5000),
                  htmlBody: (parsed.html || "").substring(0, 10000),
                  category,
                  receivedAt: parsed.date || new Date(),
                });
              }).catch((e) => {
                console.error("Erro ao processar e-mail:", e.message);
              }).finally(() => {
                if (processed >= maxFetch) finish(null, emails);
              });
            });
          });

          fetch.once("error", (err) => finish(err));
        });
      });
    });

    imap.once("error", (err) => finish(err));
    imap.once("end", () => {
      if (!finished) finish(null, emails);
    });

    imap.connect();
  });
}

async function saveEmails(userId, emails) {
  let saved = 0;
  for (const email of emails) {
    try {
      const existing = await prisma.emailMessage.findUnique({
        where: { userId_messageId: { userId, messageId: email.messageId } },
      });
      if (existing) {
        saved++;
        continue;
      }
      await prisma.emailMessage.create({
        data: { ...email, userId },
      });
      saved++;
    } catch (err) {
      if (err.code === "P2002") {
        saved++;
        continue;
      }
      console.error("Erro ao salvar e-mail:", err.message);
    }
  }
  return saved;
}

async function getEmailsByCategory(userId) {
  const emails = await prisma.emailMessage.findMany({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    take: 200,
    include: {
      sentReplies: {
        orderBy: { sentAt: "desc" },
      },
    },
  });

  const grouped = {};
  for (const email of emails) {
    if (!grouped[email.category]) grouped[email.category] = [];
    grouped[email.category].push(email);
  }

  const categories = await prisma.category.findMany({
    where: { userId },
    include: { autoReplies: true },
    orderBy: { name: "asc" },
  });

  const categoryStats = categories.map((cat) => ({
    ...cat,
    count: (grouped[cat.name] || []).length,
    emails: grouped[cat.name] || [],
  }));

  return { categories: categoryStats, total: emails.length };
}

const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");

function embedImages(html) {
  const attachments = [];
  const modifiedHtml = html.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, function(match, src) {
    if (src.startsWith("/uploads/")) {
      const filename = path.basename(src);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        const cid = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        attachments.push({
          filename,
          path: filePath,
          cid,
        });
        return match.replace(src, `cid:${cid}`);
      }
    }
    return match;
  });
  return { html: modifiedHtml, attachments };
}

async function sendAutoReply(emailMessageId, autoReplyId) {
  const email = await prisma.emailMessage.findUnique({ where: { id: emailMessageId } });
  const reply = await prisma.autoReply.findUnique({
    where: { id: autoReplyId },
    include: { category: true },
  });
  const config = await prisma.emailConfig.findUnique({ where: { userId: email.userId } });

  if (!email || !reply || !config) throw new Error("Dados incompletos para enviar resposta.");
  if (!reply.category.repliesEnabled) throw new Error("Respostas automáticas desativadas para esta categoria.");

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.email, pass: config.appPassword },
    tls: { rejectUnauthorized: false },
    family: 4,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 15000,
  });

  const subject = reply.subject
    ? `Re: ${email.subject} - ${reply.subject}`
    : `Re: ${email.subject}`;

  let body = reply.body.replace(/\{from\}/g, email.from).replace(/\{subject\}/g, email.subject);

  const toAddress = email.from.replace(/.*<([^>]+)>/, "$1").trim() || email.from;
  console.log("Enviando e-mail de:", config.email, "para:", toAddress);

  const { html: htmlBody, attachments } = embedImages(body);

  const mailOptions = {
    from: `"${config.email}" <${config.email}>`,
    to: toAddress,
    subject,
    html: htmlBody,
    text: body.replace(/<[^>]+>/g, ''),
  };
  if (attachments.length > 0) mailOptions.attachments = attachments;

  const info = await transporter.sendMail(mailOptions);
  console.log("E-mail enviado com sucesso, ID:", info.messageId);

  await prisma.sentReply.create({
    data: {
      emailId: emailMessageId,
      autoReplyId,
      subject,
      body,
    },
  });

  return true;
}

function testConnection(credentials) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: credentials.email,
      password: credentials.appPassword,
      host: credentials.imapHost || "imap.gmail.com",
      port: credentials.imapPort || 993,
      tls: credentials.imapSecure !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
    });

    const timeout = setTimeout(() => {
      try { imap.destroy(); } catch (e) {}
      reject(new Error("Tempo limite excedido ao conectar ao servidor IMAP."));
    }, 15000);

    imap.once("ready", () => {
      clearTimeout(timeout);
      imap.end();
      resolve(true);
    });

    imap.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    imap.connect();
  });
}

module.exports = {
  fetchEmails,
  saveEmails,
  getEmailsByCategory,
  sendAutoReply,
  ensureSystemCategories,
  testConnection,
  embedImages,
  CATEGORY_KEYWORDS,
};
