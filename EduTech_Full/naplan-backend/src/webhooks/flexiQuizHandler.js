const responseSubmitted = require("./events/responseSubmitted");
const responseDeleted = require("./events/responseDeleted");
const userCreated = require("./events/userCreated");
const userUpdated = require("./events/userUpdated");
const userDeleted = require("./events/userDeleted");

// Optional: prevent duplicate processing within a single server instance
const processedEvents = new Set();

// cleanup every hour
setInterval(() => processedEvents.clear(), 60 * 60 * 1000);

module.exports = function flexiQuizHandler(req, res) {
  const payload = req.body || {};
  const event_id = payload.event_id || payload.eventId || payload?.data?.event_id;
  const event_type = payload.event_type || payload.eventType || payload?.data?.event_type;

  // ✅ 1) ACK immediately (fast)
  res.status(200).json({ success: true, received: true });

  // ✅ 2) Process later (do NOT block webhook)
  setImmediate(async () => {
    try {
      // de-dupe best-effort (same event_id may be retried)
      if (event_id) {
        if (processedEvents.has(event_id)) {
          console.log(`🔁 Duplicate webhook ignored (event_id=${event_id})`);
          return;
        }
        processedEvents.add(event_id);
      }

      if (!event_type) {
        console.warn("⚠️ Webhook received without event_type");
        return;
      }

      switch (String(event_type).toLowerCase()) {
        case "response.submitted":
          await responseSubmitted(payload);
          break;

        case "response.deleted":
          await responseDeleted(payload);
          break;

        case "user.created":
          await userCreated(payload);
          break;

        case "user.updated":
          await userUpdated(payload);
          break;

        case "user.deleted":
          await userDeleted(payload);
          break;

        default:
          console.log("ℹ️ Unhandled webhook event_type:", event_type);
      }
    } catch (err) {
      console.error("❌ flexiQuizHandler background error:", err);
    }
  });
};
