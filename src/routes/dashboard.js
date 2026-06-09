const { Router } = require("express");
const { ensureAuth } = require("../middleware/auth");
const ctrl = require("../controllers/dashboardController");

const router = Router();

router.get("/", ensureAuth, ctrl.getDashboard);
router.post("/check-emails", ensureAuth, ctrl.checkNewEmails);

module.exports = router;
