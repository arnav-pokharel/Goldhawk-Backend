const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Checks if a founder's startup is marked as active.
 * This is used by the /ventures page to decide whether to show
 * the "Validation in Progress" message or redirect to the active ventures dashboard.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const checkFounderActive = async (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ error: "Founder UID is required." });
  }

  try {
    const activeStartup = await prisma.startup_active.findUnique({
      where: {
        uid: uid,
      },
    });

    if (activeStartup) {
      // The startup is active, return 200 OK.
      // The frontend expects a 200 to redirect.
      return res.status(200).json({ active: true, startupId: activeStartup.id });
    } else {
      // The startup is not active, return 404 Not Found.
      // The frontend expects a 404 to show the "validation in progress" message.
      return res.status(404).json({ error: "Startup not found or not active." });
    }
  } catch (error) {
    console.error(`[ERROR] checkFounderActive for UID ${uid}:`, error);
    return res.status(500).json({ error: "An internal server error occurred while checking startup status." });
  }
};

module.exports = {
  checkFounderActive,
};