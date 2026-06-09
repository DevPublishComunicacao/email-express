const { PrismaClient } = require("@prisma/client");
const emailService = require("../services/emailService");
const prisma = new PrismaClient();

exports.checkNewEmails = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = await prisma.emailConfig.findUnique({ where: { userId } });
    if (!config) return res.json({ count: 0 });

    const emails = await emailService.fetchEmails(userId);
    let count = 0;
    if (emails.length > 0) count = await emailService.saveEmails(userId, emails);
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.json({ count: 0 });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const config = await prisma.emailConfig.findUnique({ where: { userId } });

    let newEmailsCount = 0;

    const [totalEmails, totalCategories, totalAutoReplies, totalSentReplies, emailsByCategory, recentReplies] = await Promise.all([
      prisma.emailMessage.count({ where: { userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.autoReply.count({ where: { userId } }),
      prisma.sentReply.count({ where: { email: { userId } } }),
      prisma.emailMessage.groupBy({
        by: ["category"],
        where: { userId },
        _count: true,
        orderBy: { _count: { category: "desc" } },
      }),
      prisma.sentReply.findMany({
        where: { email: { userId } },
        include: { email: { select: { from: true, subject: true } }, autoReply: { select: { subject: true } } },
        orderBy: { sentAt: "desc" },
        take: 5,
      }),
    ]);

    const chartLabels = emailsByCategory.map(e => e.category);
    const chartData = emailsByCategory.map(e => e._count);
    const categoryDistribution = emailsByCategory.map(e => ({
      name: e.category,
      count: e._count,
      pct: totalEmails > 0 ? ((e._count / totalEmails) * 100).toFixed(1) : 0,
    }));

    res.render("dashboard", {
      user: req.user,
      totalEmails,
      totalCategories,
      totalAutoReplies,
      totalSentReplies,
      chartLabels: JSON.stringify(chartLabels),
      chartData: JSON.stringify(chartData),
      categoryDistribution,
      recentReplies,
      hasConfig: !!config,
      newEmailsCount,
    });
  } catch (err) {
    console.error(err);
    res.render("dashboard", {
      user: req.user, categoryDistribution: [],
      totalEmails: 0, totalCategories: 0, totalAutoReplies: 0, totalSentReplies: 0,
      chartLabels: "[]", chartData: "[]", recentReplies: [], hasConfig: false,
      newEmailsCount: 0,
    });
  }
};
