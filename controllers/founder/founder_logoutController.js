const { clearSessionCookies, clearUidCookies } = require("../../utils/cookies");

//
//  LOGOUT founder - clear cookie
//
exports.logoutFounder = (req, res) => {
  try {
    clearSessionCookies(res);
    clearUidCookies(res);
    return res.json({ message: "Logged out" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Logout failed" });
  }
};
