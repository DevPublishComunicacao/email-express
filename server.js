require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const authRoutes = require("./src/routes/auth");
const emailRoutes = require("./src/routes/email");
const dashboardRoutes = require("./src/routes/dashboard");
const autoResponder = require("./src/services/autoResponder");

const prisma = new PrismaClient();
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

require("./src/services/passport")(passport);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

app.use(express.static(path.join(__dirname, "src", "public")));

app.use("/auth", authRoutes);
app.use("/email", emailRoutes);
app.use("/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/auth/login");
  res.redirect("/dashboard");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  autoResponder.start(60000);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
