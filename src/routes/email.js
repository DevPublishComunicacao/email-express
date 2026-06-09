const { Router } = require("express");
const { ensureAuth } = require("../middleware/auth");
const ctrl = require("../controllers/emailController");

const router = Router();

router.get("/config", ensureAuth, ctrl.getSettings);
router.post("/config", ensureAuth, ctrl.postSettings);

router.get("/inbox", ensureAuth, ctrl.getInbox);
router.post("/inbox/fetch", ensureAuth, ctrl.postFetchEmails);

router.get("/categories", ensureAuth, ctrl.getCategories);
router.post("/categories", ensureAuth, ctrl.postCategory);
router.post("/categories/:id", ensureAuth, ctrl.putCategory);
router.delete("/categories/:id", ensureAuth, ctrl.deleteCategory);

router.get("/auto-replies", ensureAuth, ctrl.getAutoReplies);
router.post("/auto-replies", ensureAuth, ctrl.postAutoReply);
router.put("/auto-replies/:id", ensureAuth, ctrl.updateAutoReply);
router.delete("/auto-replies/:id", ensureAuth, ctrl.deleteAutoReply);

router.get("/signature", ensureAuth, ctrl.getSignature);
router.post("/signature", ensureAuth, ctrl.postSignature);
router.post("/upload-image", ensureAuth, ctrl.uploadImage);
router.get("/sent-replies", ensureAuth, ctrl.getSentReplies);
router.get("/test-smtp", ensureAuth, ctrl.testSmtp);
router.post("/send-reply", ensureAuth, ctrl.postSendReply);
router.post("/send-manual-reply", ensureAuth, ctrl.postSendManualReply);
router.post("/emails/:id/category", ensureAuth, ctrl.updateEmailCategory);

module.exports = router;
