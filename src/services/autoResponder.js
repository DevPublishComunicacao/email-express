const { PrismaClient } = require("@prisma/client");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const emailService = require("./emailService");

const prisma = new PrismaClient();

function classifyEmail(subject, from, textBody) {
  const text = `${subject} ${from} ${textBody}`.toLowerCase();
  for (const cat of emailService.CATEGORY_KEYWORDS) {
    if (cat.name === "Outros") continue;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) return cat.name;
    }
  }
  return "Outros";
}

async function checkAndRespond(userId) {
  const config = await prisma.emailConfig.findUnique({ where: { userId } });
  if (!config) return;

  await emailService.ensureSystemCategories(userId);

  return new Promise((resolve) => {
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

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      try { imap.end(); } catch (e) {}
      resolve();
    }

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) { console.error("[AutoResponder] Erro ao abrir INBOX:", err.message); return finish(); }

        const since = new Date();
        since.setMinutes(since.getMinutes() - 10);

        imap.search(["ALL", ["SINCE", since.toISOString()]], (err, results) => {
          if (err) { console.error("[AutoResponder] Erro na busca:", err.message); return finish(); }
          if (!results || results.length === 0) return finish();

          const maxFetch = Math.min(results.length, 20);
          let processed = 0;
          const fetch = imap.fetch(results.slice(-maxFetch), { bodies: "" });

          fetch.on("message", (msg) => {
            let buffer = "";
            msg.on("body", (stream) => {
              stream.on("data", (chunk) => (buffer += chunk.toString("utf8")));
            });
            msg.once("end", () => {
              processed++;
              simpleParser(buffer).then(async (parsed) => {
                const from = parsed.from?.text || "";
                const subject = parsed.subject || "";
                const messageId = parsed.messageId || `${processed}-${Date.now()}`;

                const existing = await prisma.emailMessage.findUnique({
                  where: { userId_messageId: { userId, messageId } },
                });
                if (existing) return;

                let categoryName = classifyEmail(subject, from, parsed.text || "");

                const knownEmail = await prisma.emailMessage.findFirst({
                  where: { userId, from, category: { not: "Outros" } },
                  orderBy: { receivedAt: "desc" },
                });
                if (knownEmail) categoryName = knownEmail.category;

                await prisma.emailMessage.create({
                  data: {
                    userId,
                    messageId,
                    from,
                    to: parsed.to?.text || "",
                    subject,
                    textBody: (parsed.text || "").substring(0, 5000),
                    htmlBody: (parsed.html || "").substring(0, 10000),
                    category: categoryName,
                    receivedAt: parsed.date || new Date(),
                  },
                });

                console.log(`[AutoResponder] Novo e-mail de ${from} classificado como: ${categoryName}`);

                const category = await prisma.category.findFirst({
                  where: { userId, name: categoryName, repliesEnabled: true },
                  include: { autoReplies: true },
                });

                if (!category || !category.autoReplies || category.autoReplies.length === 0) {
                  console.log(`[AutoResponder] Sem resposta automática ativa para categoria: ${categoryName}`);
                  return;
                }

                const reply = category.autoReplies[0];
                const replySubject = reply.subject ? `Re: ${subject} - ${reply.subject}` : `Re: ${subject}`;
                let replyBody = reply.body.replace(/\{from\}/g, from).replace(/\{subject\}/g, subject);
                const toAddress = from.replace(/.*<([^>]+)>/, "$1").trim() || from;

                console.log(`[AutoResponder] Enviando resposta automática para ${toAddress} (categoria: ${categoryName})`);

                const transporter = nodemailer.createTransport({
                  host: config.smtpHost,
                  port: config.smtpPort,
                  secure: config.smtpSecure,
                  auth: { user: config.email, pass: config.appPassword },
                  tls: { rejectUnauthorized: false },
                  connectionTimeout: 10000,
                  greetingTimeout: 10000,
                  socketTimeout: 15000,
                });

                const { html: htmlBody, attachments } = emailService.embedImages(replyBody);
                const mailOptions = {
                  from: config.email,
                  to: toAddress,
                  subject: replySubject,
                  html: htmlBody,
                  text: replyBody.replace(/<[^>]+>/g, ''),
                };
                if (attachments.length > 0) mailOptions.attachments = attachments;
                const info = await transporter.sendMail(mailOptions);

                const savedEmail = await prisma.emailMessage.findUnique({
                  where: { userId_messageId: { userId, messageId } },
                });

                if (savedEmail) {
                  await prisma.sentReply.create({
                    data: {
                      emailId: savedEmail.id,
                      autoReplyId: reply.id,
                      subject: replySubject,
                      body: replyBody,
                    },
                  });
                }

                console.log(`[AutoResponder] Resposta enviada! ID: ${info.messageId}`);
              }).catch((e) => {
                console.error("[AutoResponder] Erro ao processar:", e.message);
              });
            });
          });

          fetch.once("error", (err) => {
            console.error("[AutoResponder] Erro no fetch:", err.message);
            finish();
          });
          fetch.once("end", () => {
            setTimeout(finish, 2000);
          });
        });
      });
    });

    imap.once("error", (err) => {
      console.error("[AutoResponder] Erro IMAP:", err.message);
      finish();
    });
    imap.once("end", () => {
      if (!done) setTimeout(finish, 1000);
    });

    setTimeout(finish, 25000);
    imap.connect();
  });
}

async function processAllUsers() {
  try {
    const configs = await prisma.emailConfig.findMany({
      include: { user: true },
    });

    for (const cfg of configs) {
      try {
        await checkAndRespond(cfg.userId);
      } catch (e) {
        console.error(`[AutoResponder] Erro para ${cfg.email}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[AutoResponder] Erro geral:", e.message);
  }
}

function start(intervalMs = 60000) {
  console.log(`[AutoResponder] Iniciado (intervalo: ${intervalMs / 1000}s)`);
  processAllUsers();
  setInterval(processAllUsers, intervalMs);
}

module.exports = { start };
