const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

const TURN_SECRET = process.env.TURN_SHARED_SECRET || null;
const TURN_URLS = (process.env.TURN_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const TURN_TTL_SECONDS = (() => {
  const raw = parseInt(process.env.TURN_TTL_SECONDS || "3600", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 3600;
})();

function normalize(value) {
  return value == null ? null : String(value);
}

function isParticipant(deal, uid) {
  if (!deal || !uid) return false;
  const normalizedUid = normalize(uid);
  const allowed = [deal.investor_uid, deal.startup_uid]
    .map((candidate) => normalize(candidate))
    .filter(Boolean);
  return allowed.includes(normalizedUid);
}

async function fetchDeal(dealId) {
  if (!dealId) return null;
  return prisma.deal.findUnique({
    where: { deal_id: String(dealId) },
    select: { deal_id: true, investor_uid: true, startup_uid: true },
  });
}

function serializeCall(call) {
  if (!call) return null;
  return {
    id: call.id,
    dealId: call.deal_id,
    callerUid: call.caller_uid,
    calleeUid: call.callee_uid,
    status: call.status,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    transcript: call.transcript,
    recordingUrl: call.recording_url,
  };
}

async function assertParticipant(req, deal) {
  const uid = normalize(req.user?.uid);
  if (!uid) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  if (!deal || !isParticipant(deal, uid)) {
    const error = new Error("You are not allowed to manage calls for this deal");
    error.statusCode = 403;
    throw error;
  }
  return uid;
}

exports.startCall = async (req, res) => {
  try {
    const { dealId, calleeUid } = req.body || {};
    if (!dealId) {
      return res.status(400).json({ error: "dealId is required" });
    }

    const deal = await fetchDeal(dealId);
    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    const callerUid = await assertParticipant(req, deal);
    const participants = [normalize(deal.investor_uid), normalize(deal.startup_uid)].filter(Boolean);
    const calleeFromDeal = participants.find((uid) => uid !== callerUid) || null;
    const requestedCallee = normalize(calleeUid);

    let normalizedCallee = calleeFromDeal || requestedCallee;
    if (requestedCallee && requestedCallee !== callerUid && participants.includes(requestedCallee)) {
      normalizedCallee = requestedCallee;
    }

    if (!normalizedCallee || normalizedCallee === callerUid) {
      return res.status(403).json({ error: "No eligible counterpart found for this deal" });
    }

    await prisma.meeting_logs.updateMany({
      where: { deal_id: deal.deal_id, status: "active" },
      data: { status: "ended", ended_at: new Date() },
    });

    const call = await prisma.meeting_logs.create({
      data: {
        deal_id: deal.deal_id,
        caller_uid: callerUid,
        callee_uid: normalizedCallee,
        status: "active",
        started_at: new Date(),
      },
    });

    return res.status(201).json({ call: serializeCall(call) });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || "Unable to start call" });
  }
};

exports.endCall = async (req, res) => {
  try {
    const { callId, endedAt, status: overrideStatus, transcript, recordingUrl } = req.body || {};
    if (!callId) {
      return res.status(400).json({ error: "callId is required" });
    }

    const call = await prisma.meeting_logs.findUnique({
      where: { id: String(callId) },
      include: {
        deal: { select: { deal_id: true, investor_uid: true, startup_uid: true } },
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call record not found" });
    }

    await assertParticipant(req, call.deal);

    const update = {
      status: overrideStatus || "ended",
      ended_at: endedAt ? new Date(endedAt) : call.ended_at || new Date(),
    };
    if (transcript !== undefined) update.transcript = transcript;
    if (recordingUrl !== undefined) update.recording_url = recordingUrl;

    const updated = await prisma.meeting_logs.update({
      where: { id: call.id },
      data: update,
    });

    return res.json({ call: serializeCall(updated) });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || "Unable to end call" });
  }
};

exports.updateCallRecord = async (req, res) => {
  try {
    const { callId, transcript, recordingUrl, status, endedAt } = req.body || {};
    if (!callId) {
      return res.status(400).json({ error: "callId is required" });
    }

    const call = await prisma.meeting_logs.findUnique({
      where: { id: String(callId) },
      include: {
        deal: { select: { deal_id: true, investor_uid: true, startup_uid: true } },
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call record not found" });
    }

    await assertParticipant(req, call.deal);

    const data = {};
    if (transcript !== undefined) data.transcript = transcript;
    if (recordingUrl !== undefined) data.recording_url = recordingUrl;
    if (status !== undefined) data.status = status;
    if (endedAt !== undefined) data.ended_at = new Date(endedAt);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = await prisma.meeting_logs.update({
      where: { id: call.id },
      data,
    });

    return res.json({ call: serializeCall(updated) });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || "Unable to update call" });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { dealId } = req.params;
    if (!dealId) {
      return res.status(400).json({ error: "dealId is required" });
    }

    const deal = await fetchDeal(dealId);
    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    await assertParticipant(req, deal);

    const calls = await prisma.meeting_logs.findMany({
      where: { deal_id: deal.deal_id },
      orderBy: { started_at: "desc" },
    });

    return res.json({ calls: calls.map(serializeCall) });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || "Unable to fetch history" });
  }
};

exports.issueTurnCredentials = async (req, res) => {
  try {
    if (!TURN_SECRET || TURN_URLS.length === 0) {
      return res.status(500).json({ error: "TURN credentials are not configured" });
    }
    const uid = normalize(req.user?.uid) || "anonymous";
    const timestamp = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
    const username = `${timestamp}:${uid}`;
    const credential = crypto
      .createHmac("sha1", TURN_SECRET)
      .update(username)
      .digest("base64");

    return res.json({
      credentials: {
        username,
        credential,
        ttl: TURN_TTL_SECONDS,
        expiresAt: new Date(timestamp * 1000).toISOString(),
        urls: TURN_URLS,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || "Unable to issue TURN credentials" });
  }
};


