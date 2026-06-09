const { PrismaClient } = require("@prisma/client");
const emailService = require("../services/emailService");

const prisma = new PrismaClient();

exports.getSettings = async (req, res) => {
  try {
    const config = await prisma.emailConfig.findUnique({
      where: { userId: req.user.id },
    });
    res.render("email-settings", { config, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render("email-settings", { config: null, error: "Erro ao carregar configurações.", success: null });
  }
};

exports.postSettings = async (req, res) => {
  try {
    const { email, appPassword, imapHost, imapPort, smtpHost, smtpPort } = req.body;

    if (!email || !appPassword) {
      const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
      return res.render("email-settings", { config, error: "E-mail e senha de app são obrigatórios.", success: null });
    }

    const data = {
      email,
      appPassword,
      imapHost: imapHost || "imap.gmail.com",
      imapPort: parseInt(imapPort, 10) || 993,
      imapSecure: true,
      smtpHost: smtpHost || "smtp.gmail.com",
      smtpPort: parseInt(smtpPort, 10) || 587,
      smtpSecure: false,
    };

    try {
      await emailService.testConnection(data);
    } catch (connErr) {
      const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
      return res.render("email-settings", {
        config,
        error: `Falha na conexão IMAP: ${connErr.message}. Verifique suas credenciais e tente novamente.`,
        success: null,
      });
    }

    await prisma.emailConfig.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { ...data, userId: req.user.id },
    });

    await emailService.ensureSystemCategories(req.user.id);

    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    res.render("email-settings", { config, error: null, success: "Conexão testada e configurações salvas com sucesso!" });
  } catch (err) {
    console.error(err);
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    res.render("email-settings", { config, error: "Erro ao salvar configurações.", success: null });
  }
};

exports.getInbox = async (req, res) => {
  try {
    const config = await prisma.emailConfig.findUnique({
      where: { userId: req.user.id },
    });

    if (!config) {
      return res.redirect("/email/config");
    }

    // Auto-fetch new emails in background
    emailService.fetchEmails(req.user.id).then(emails => {
      if (emails.length > 0) emailService.saveEmails(req.user.id, emails).catch(e => {});
    }).catch(err => console.error("Auto-fetch error:", err.message));

    const data = await emailService.getEmailsByCategory(req.user.id);
    res.render("inbox", { ...data, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render("inbox", { categories: [], total: 0, error: "Erro ao carregar e-mails.", success: null });
  }
};

exports.postFetchEmails = async (req, res) => {
  try {
    const config = await prisma.emailConfig.findUnique({
      where: { userId: req.user.id },
    });

    if (!config) {
      return res.redirect("/email/config");
    }

    const emails = await emailService.fetchEmails(req.user.id);
    const saved = await emailService.saveEmails(req.user.id, emails);

    const data = await emailService.getEmailsByCategory(req.user.id);
    res.render("inbox", {
      ...data,
      error: null,
      success: `${saved} e-mails importados com sucesso!`,
    });
  } catch (err) {
    console.error(err);
    const data = await emailService.getEmailsByCategory(req.user.id).catch(() => ({ categories: [], total: 0 }));
    res.render("inbox", {
      ...data,
      error: `Erro ao buscar e-mails: ${err.message}`,
      success: null,
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      include: { autoReplies: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    res.render("categories", { categories, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render("categories", { categories: [], error: "Erro ao carregar categorias.", success: null });
  }
};

exports.postCategory = async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      const categories = await prisma.category.findMany({
        where: { userId: req.user.id },
        include: { autoReplies: true },
      });
      return res.render("categories", { categories, error: "Nome da categoria é obrigatório.", success: null });
    }

    await prisma.category.create({
      data: { userId: req.user.id, name: name.trim(), color: color || "#1877f2", isSystem: false },
    });

    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      include: { autoReplies: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    res.render("categories", { categories, error: null, success: "Categoria criada com sucesso!" });
  } catch (err) {
    if (err.code === "P2002") {
      const categories = await prisma.category.findMany({
        where: { userId: req.user.id },
        include: { autoReplies: true },
      });
      return res.render("categories", { categories, error: "Já existe uma categoria com esse nome.", success: null });
    }
    console.error(err);
    res.render("categories", { categories: [], error: "Erro ao criar categoria.", success: null });
  }
};

exports.putCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const cat = await prisma.category.findFirst({ where: { id, userId: req.user.id } });
    if (!cat) return res.status(404).json({ error: "Categoria não encontrada." });

    const data = {};
    if (name && name.trim()) data.name = name.trim();
    if (color) data.color = color;
    if (req.body.repliesEnabled !== undefined) data.repliesEnabled = req.body.repliesEnabled === true || req.body.repliesEnabled === "true";

    await prisma.category.update({ where: { id }, data });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar categoria." });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const cat = await prisma.category.findFirst({ where: { id, userId: req.user.id } });
    if (!cat) return res.status(404).json({ error: "Categoria não encontrada." });
    if (cat.isSystem) return res.status(400).json({ error: "Não é possível excluir categorias do sistema." });

    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir categoria." });
  }
};

exports.getAutoReplies = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      include: { autoReplies: { include: { category: { select: { name: true, color: true } } } } },
      orderBy: { name: "asc" },
    });
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    const signature = config?.signature || "";

    res.render("auto-replies", { categories, signature, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render("auto-replies", { categories: [], signature: "", error: "Erro ao carregar auto-respostas.", success: null });
  }
};

exports.postAutoReply = async (req, res) => {
  try {
    const { categoryId, subject, body, _id } = req.body;

    const cat = await prisma.category.findFirst({ where: { id: categoryId, userId: req.user.id } });
    if (!cat) {
      const categories = await prisma.category.findMany({ where: { userId: req.user.id }, include: { autoReplies: true } });
      const allReplies = await prisma.autoReply.findMany({ where: { userId: req.user.id }, include: { category: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } });
      const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
      return res.render("auto-replies", { categories, allReplies, selectedCategory: "", signature: config?.signature || "", error: "Categoria inválida.", success: null });
    }

    if (!body || !body.trim()) {
      const categories = await prisma.category.findMany({ where: { userId: req.user.id }, include: { autoReplies: true } });
      const allReplies = await prisma.autoReply.findMany({ where: { userId: req.user.id }, include: { category: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } });
      const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
      return res.render("auto-replies", { categories, allReplies, selectedCategory: "", signature: config?.signature || "", error: "O corpo da resposta é obrigatório.", success: null });
    }

    const useSignature = req.body.useSignature === "on" || req.body.useSignature === true;

    if (_id) {
      const reply = await prisma.autoReply.findFirst({
        where: { id: _id, userId: req.user.id },
      });
      if (!reply) {
        const categories = await prisma.category.findMany({ where: { userId: req.user.id }, include: { autoReplies: true } });
        const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
        return res.render("auto-replies", { categories, selectedCategory: "", signature: config?.signature || "", error: "Auto-resposta não encontrada.", success: null });
      }
      await prisma.autoReply.update({
        where: { id: _id },
        data: { categoryId, subject: subject || "", body, useSignature },
      });
    } else {
      await prisma.autoReply.create({
        data: {
          userId: req.user.id,
          categoryId,
          subject: subject || "",
          body,
          useSignature,
        },
      });
    }

    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      include: { autoReplies: true },
      orderBy: { name: "asc" },
    });
    const allReplies = await prisma.autoReply.findMany({ where: { userId: req.user.id }, include: { category: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } });
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    const signature = config?.signature || "";
    const msg = _id ? "Auto-resposta atualizada com sucesso!" : "Auto-resposta criada com sucesso!";
    res.render("auto-replies", { categories, allReplies, selectedCategory: "", signature, error: null, success: msg });
  } catch (err) {
    console.error(err);
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      include: { autoReplies: true },
    });
    const allReplies = await prisma.autoReply.findMany({ where: { userId: req.user.id }, include: { category: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } });
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    const signature = config?.signature || "";
    res.render("auto-replies", { categories, allReplies, selectedCategory: "", signature, error: "Erro ao salvar auto-resposta.", success: null });
  }
};

exports.updateAutoReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, subject, body } = req.body;
    const useSignature = req.body.useSignature === "on" || req.body.useSignature === true;

    const reply = await prisma.autoReply.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!reply) return res.status(404).json({ error: "Auto-resposta não encontrada." });

    await prisma.autoReply.update({
      where: { id },
      data: { categoryId, subject: subject || "", body, useSignature },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar auto-resposta." });
  }
};

exports.deleteAutoReply = async (req, res) => {
  try {
    const { id } = req.params;
    const reply = await prisma.autoReply.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!reply) return res.status(404).json({ error: "Auto-resposta não encontrada." });

    await prisma.autoReply.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir auto-resposta." });
  }
};

exports.updateEmailCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    const email = await prisma.emailMessage.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!email) return res.status(404).json({ error: "E-mail não encontrado." });

    const cat = await prisma.category.findFirst({
      where: { userId: req.user.id, name: category },
    });
    if (!cat) return res.status(404).json({ error: "Categoria não encontrada." });

    await prisma.emailMessage.update({
      where: { id },
      data: { category },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao mover e-mail." });
  }
};

exports.testSmtp = async (req, res) => {
  try {
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.json({ error: "Sem configuração de e-mail." });

    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.email, pass: config.appPassword },
      tls: { rejectUnauthorized: false },
      family: 4,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });

    await transporter.verify();
    const info = await transporter.sendMail({
      from: config.email,
      to: config.email,
      subject: "Teste de envio Email Express",
      text: "Se você recebeu este e-mail, o SMTP está funcionando corretamente!",
    });

    res.json({ success: true, message: `E-mail de teste enviado! ID: ${info.messageId}` });
  } catch (err) {
    console.error("SMTP test error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSignature = async (req, res) => {
  try {
    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    res.render("signature", { signature: config?.signature || "", error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render("signature", { signature: "", error: "Erro ao carregar assinatura.", success: null });
  }
};

exports.postSignature = async (req, res) => {
  try {
    const { signature } = req.body;
    await prisma.emailConfig.upsert({
      where: { userId: req.user.id },
      update: { signature: signature || "" },
      create: { userId: req.user.id, email: "", appPassword: "", signature: signature || "" },
    });
    res.render("signature", { signature: signature || "", error: null, success: "Assinatura salva com sucesso!" });
  } catch (err) {
    console.error(err);
    res.render("signature", { signature: "", error: "Erro ao salvar assinatura.", success: null });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    const multer = require("multer");
    const path = require("path");
    const storage = multer.diskStorage({
      destination: path.join(__dirname, "..", "public", "uploads"),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    });
    const upload = multer({
      storage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) return cb(new Error("Apenas imagens são permitidas."));
        cb(null, true);
      },
    }).single("image");

    upload(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });
      res.json({ url: `/uploads/${req.file.filename}` });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao fazer upload." });
  }
};

exports.postSendManualReply = async (req, res) => {
  try {
    const { emailId, body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: "Mensagem vazia." });

    const email = await prisma.emailMessage.findFirst({ where: { id: emailId, userId: req.user.id } });
    if (!email) return res.status(404).json({ error: "E-mail não encontrado." });

    const config = await prisma.emailConfig.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.status(400).json({ error: "Configure seu e-mail primeiro." });

    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
      auth: { user: config.email, pass: config.appPassword },
      tls: { rejectUnauthorized: false },
      family: 4,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });

    const toAddress = email.from.replace(/.*<([^>]+)>/, "$1").trim() || email.from;
    const subject = `Re: ${email.subject}`;
    const fullBody = config.signature ? `${body}<br><br>${config.signature}` : body;
    const { html: htmlBody, attachments } = emailService.embedImages(fullBody);

    const mailOptions = {
      from: config.email, to: toAddress, subject, html: htmlBody, text: fullBody.replace(/<[^>]+>/g, ''),
    };
    if (attachments.length > 0) mailOptions.attachments = attachments;
    await transporter.sendMail(mailOptions);

    await prisma.sentReply.create({
      data: { emailId, subject, body },
    });

    res.json({ success: true, message: "Resposta enviada!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSentReplies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const [replies, total] = await Promise.all([
      prisma.sentReply.findMany({
        where: { email: { userId: req.user.id } },
        include: { email: { select: { from: true, subject: true } }, autoReply: { select: { subject: true } } },
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.sentReply.count({ where: { email: { userId: req.user.id } } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.render("sent-replies", { replies, page, totalPages, total });
  } catch (err) {
    console.error(err);
    res.render("sent-replies", { replies: [], page: 1, totalPages: 0, total: 0 });
  }
};

exports.postSendReply = async (req, res) => {
  try {
    const { emailId, replyId } = req.body;
    await emailService.sendAutoReply(emailId, replyId);
    res.json({ success: true, message: "Resposta enviada com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Erro ao enviar resposta: ${err.message}` });
  }
};
