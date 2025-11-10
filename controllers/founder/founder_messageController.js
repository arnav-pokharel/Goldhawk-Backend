// controllers/founder/founder_messageController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// POST /founder/messages
exports.sendMessage = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Message content required" });

    const message = await prisma.admin_message.create({
      data: {
        founder_uid: req.user.uid,
        sender: "founder",
        content,
      },
    });

    res.json({ success: true, message });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// GET /founder/messages
exports.getMessages = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const messages = await prisma.admin_message.findMany({
      where: { founder_uid: req.user.uid },
      orderBy: { created_at: "asc" },
    });

    res.json(messages);
  } catch (err) {
    console.error("List messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};
