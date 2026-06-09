const { Router } = require("express");
const passport = require("passport");
const ctrl = require("../controllers/authController");

const router = Router();

router.get("/login", ctrl.getLogin);
router.post("/login", ctrl.postLogin);

router.get("/register", ctrl.getRegister);
router.post("/register", ctrl.postRegister);

router.get("/logout", ctrl.logout);

if (process.env.GOOGLE_CLIENT_ID) {
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/auth/login",
      failureMessage: "Falha ao autenticar com Google",
    }),
    ctrl.googleCallback
  );
}

module.exports = router;
