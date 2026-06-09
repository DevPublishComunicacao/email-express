const passport = require("passport");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const token = crypto.randomBytes(16).toString("hex");
  return { a, b, token, answer: a + b };
}

function renderRegister(req, res, data) {
  const captcha = generateCaptcha();
  req.session.captcha = { token: captcha.token, answer: captcha.answer };
  res.render("register", {
    ...data,
    captchaA: captcha.a,
    captchaB: captcha.b,
    captchaToken: captcha.token,
  });
}

exports.getLogin = (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/");
  res.render("login", { error: req.session.messages?.pop() || null });
};

exports.getRegister = (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/");
  renderRegister(req, res, { error: null });
};

exports.postLogin = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.session.messages = [info.message];
      return res.redirect("/auth/login");
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect("/");
    });
  })(req, res, next);
};

exports.postRegister = async (req, res) => {
  const { name, email, phone, password, confirmPassword, captcha, captchaToken } = req.body;

  if (!name || !email || !phone || !password || !confirmPassword || captcha === undefined) {
    return renderRegister(req, res, { error: "Preencha todos os campos obrigatórios.", name, email, phone });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return renderRegister(req, res, { error: "E-mail inválido.", name, email, phone });
  }

  const phoneClean = phone.replace(/\D/g, "");
  if (phoneClean.length < 10 || phoneClean.length > 11) {
    return renderRegister(req, res, { error: "Celular inválido. Use o formato (XX) XXXXX-XXXX.", name, email, phone });
  }

  if (password.length < 6) {
    return renderRegister(req, res, { error: "A senha deve ter no mínimo 6 caracteres.", name, email, phone });
  }

  if (password !== confirmPassword) {
    return renderRegister(req, res, { error: "As senhas não conferem.", name, email, phone });
  }

  if (!req.session.captcha || req.session.captcha.token !== captchaToken || parseInt(captcha, 10) !== req.session.captcha.answer) {
    return renderRegister(req, res, { error: "Captcha inválido. Tente novamente.", name, email, phone });
  }

  delete req.session.captcha;

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return renderRegister(req, res, { error: "E-mail já cadastrado.", name, email, phone });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { name, email, phone: phoneClean, password: hashed },
    });

    res.redirect("/auth/login");
  } catch (err) {
    console.error(err);
    renderRegister(req, res, { error: "Erro ao cadastrar. Tente novamente.", name, email, phone });
  }
};

exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/auth/login"));
  });
};

exports.googleCallback = (req, res) => {
  res.redirect("/");
};
