/**
 * scripts/testAssignQuiz.js
 * 
 * Direct test of FlexiQuiz quiz assignment API
 * Usage: node scripts/testAssignQuiz.js
 */

require("dotenv").config();
const axios = require("axios");

const API_KEY = process.env.FLEXIQUIZ_API_KEY;
const FQ_BASE = "https://www.flexiquiz.com/api/v1";

// "expect" child's FlexiQuiz user ID
const USER_ID = "6b69fa43-403b-45bf-8f39-b7e5cfb53c2a";

// First quiz ID to test
const QUIZ_ID = "ca3c6d7f-5370-41a4-87f7-8e098d762461";

async function testAssign() {
  console.log("🔑 API Key present:", !!API_KEY);
  console.log("👤 User ID:", USER_ID);
  console.log("📝 Quiz ID:", QUIZ_ID);
  console.log("");

  // ── Method 1: quiz_id in BODY (correct per docs) ──
  console.log("=== Method 1: quiz_id in body ===");
  try {
    const body = new URLSearchParams();
    body.append("quiz_id", QUIZ_ID);

    const res = await axios.post(
      `${FQ_BASE}/users/${USER_ID}/quizzes`,
      body.toString(),
      {
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 20000,
      }
    );
    console.log("✅ SUCCESS:", res.status, res.data);
  } catch (err) {
    console.log("❌ FAILED:");
    console.log("   Status:", err.response?.status);
    console.log("   Body:", JSON.stringify(err.response?.data));
    console.log("   Headers:", JSON.stringify(err.response?.headers));
  }

  console.log("");

  // ── Method 2: quiz_id in URL path (old broken way) ──
  console.log("=== Method 2: quiz_id in URL path ===");
  try {
    const body = new URLSearchParams();

    const res = await axios.post(
      `${FQ_BASE}/users/${USER_ID}/quizzes/${QUIZ_ID}`,
      body.toString(),
      {
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 20000,
      }
    );
    console.log("✅ SUCCESS:", res.status, res.data);
  } catch (err) {
    console.log("❌ FAILED:");
    console.log("   Status:", err.response?.status);
    console.log("   Body:", JSON.stringify(err.response?.data));
  }

  console.log("");

  // ── Also list all quizzes in your account to verify quiz IDs ──
  console.log("=== Listing all quizzes in FlexiQuiz account ===");
  try {
    const res = await axios.get(`${FQ_BASE}/quizzes`, {
      headers: { "X-API-KEY": API_KEY },
      timeout: 20000,
    });
    const quizzes = Array.isArray(res.data) ? res.data : [];
    console.log(`Found ${quizzes.length} quizzes:`);
    quizzes.forEach((q) => {
      console.log(`   ${q.quiz_id}  →  ${q.name}`);
    });
  } catch (err) {
    console.log("❌ Failed to list quizzes:", err.response?.status, err.response?.data);
  }
}

testAssign();