exports.handleFlexiQuiz = (req, res) => {
  try {
    console.log("==== FLEXIQUIZ WEBHOOK RECEIVED ====");
    console.log("Event:", req.body.event || "unknown");

    console.log("Payload:");
    console.log(JSON.stringify(req.body, null, 2));

    return res.status(200).json({
      success: true,
      message: "Webhook received"
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Webhook failed" });
  }
};
