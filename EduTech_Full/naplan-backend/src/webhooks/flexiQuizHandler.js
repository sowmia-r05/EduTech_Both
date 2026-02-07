const processedEvents = new Set();

const responseSubmitted = require("./events/responseSubmitted");
const responseDeleted = require("./events/responseDeleted");
const userCreated = require("./events/userCreated");
const userUpdated = require("./events/userUpdated");
const userDeleted = require("./events/userDeleted");

// 🧹 Memory cleanup: Clear processed events every hour to prevent memory leaks
setInterval(() => {
  const size = processedEvents.size;
  processedEvents.clear();
  console.log(`🧹 Cleared ${size} processed events from memory cache`);
}, 3600000); // 1 hour

// 📊 Track webhook statistics
const webhookStats = {
  total: 0,
  duplicates: 0,
  processed: 0,
  errors: 0
};

// 📈 Log stats every 5 minutes
setInterval(() => {
  console.log("📊 Webhook Stats:", {
    total: webhookStats.total,
    duplicates: webhookStats.duplicates,
    processed: webhookStats.processed,
    errors: webhookStats.errors,
    cacheSize: processedEvents.size
  });
}, 300000); // 5 minutes

module.exports = async function flexiQuizHandler(req, res) {
  const startTime = Date.now();
  webhookStats.total++;

  try {
    const { event_id, event_type } = req.body;

    // 🟡 STEP 1: Idempotency check
    if (processedEvents.has(event_id)) {
      webhookStats.duplicates++;
      console.log("🔄 Duplicate webhook ignored:", event_id);
      return res.status(200).json({ success: true, duplicate: true });
    }

    // 🟢 STEP 2: Mark as processed immediately
    processedEvents.add(event_id);

    console.log("📥 FlexiQuiz Event:", event_type, "ID:", event_id);

    // 🚀 STEP 3: Respond immediately, process asynchronously
    res.status(200).json({ success: true, received: true });

    // 🔄 STEP 4: Process webhook in background (non-blocking)
    processWebhookAsync(req.body).catch(err => {
      webhookStats.errors++;
      console.error("❌ Async webhook processing failed:", err);
    });

  } catch (err) {
    webhookStats.errors++;
    console.error("❌ FlexiQuiz webhook error:", err);
    
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      return res.status(500).json({ error: "Webhook failed" });
    }
  }
};

// 🔄 Async webhook processing function
async function processWebhookAsync(payload) {
  const { event_id, event_type } = payload;
  const startTime = Date.now();

  try {
    switch (event_type) {
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
        console.log("⚠️ Unhandled FlexiQuiz event:", event_type);
    }

    webhookStats.processed++;
    const duration = Date.now() - startTime;
    console.log(`✅ Processed ${event_type} in ${duration}ms`);

  } catch (err) {
    webhookStats.errors++;
    console.error(`❌ Failed to process ${event_type}:`, err);
    throw err;
  }
}
