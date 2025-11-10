exports.startMeeting = (req, res) => res.status(410).json({ error: 'Deprecated: use /api/calls/start' });
exports.endMeeting = (req, res) => res.status(410).json({ error: 'Deprecated: use /api/calls/end' });
exports.getMeetings = (req, res) => res.status(410).json({ error: 'Deprecated: use /api/calls/:dealId/history' });

