/**
 * NAPLAN Quiz Logic & AI Feedback Unit Tests
 * Tests: inferSubjectFromQuizName, entitlement checks, attempt limits, topic_breakdown
 */

// ─── Replicate production functions for isolated testing ─────────────────────

function normalizeQuizName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSubjectFromQuizName(quizName) {
  const q = normalizeQuizName(quizName);
  if (q.includes("numeracy with calculator") || q.includes("with calculator") || q.includes("calculator")) {
    return "Numeracy_with_calculator";
  }
  if (q.includes("language convention") || q.includes("language conventions") || q.includes("conventions")) {
    return "Language_convention";
  }
  if (q.includes("numeracy")) return "Numeracy";
  if (q.includes("reading")) return "Reading";
  if (q.includes("writing")) return "Writing";
  return "";
}

function checkEntitlement(childBundleIds = [], quiz_ids_in_bundle = [], quizId) {
  if (childBundleIds.length === 0) return false;
  return quiz_ids_in_bundle.includes(quizId);
}

function canAttemptQuiz(existingAttempts = [], maxAttempts = 5) {
  const activeAttempts = existingAttempts.filter(a => ["completed", "scored", "ai_done"].includes(a.status));
  return activeAttempts.length < maxAttempts;
}

function calculateTimerDeadline(timeLimitSeconds, gracePeriodSeconds = 60) {
  const totalSeconds = timeLimitSeconds + gracePeriodSeconds;
  const deadline = new Date(Date.now() + totalSeconds * 1000);
  return deadline;
}

// ─── inferSubjectFromQuizName Tests ──────────────────────────────────────────
describe("inferSubjectFromQuizName", () => {
  describe("Numeracy with Calculator variants", () => {
    test("exact string 'numeracy with calculator'", () => {
      expect(inferSubjectFromQuizName("Numeracy with calculator")).toBe("Numeracy_with_calculator");
    });
    test("underscore variant 'Numeracy_with_calculator'", () => {
      expect(inferSubjectFromQuizName("Numeracy_with_calculator")).toBe("Numeracy_with_calculator");
    });
    test("just 'calculator' in name", () => {
      expect(inferSubjectFromQuizName("Year 5 Calculator Test")).toBe("Numeracy_with_calculator");
    });
    test("'with calculator' phrase", () => {
      expect(inferSubjectFromQuizName("Year 7 with Calculator")).toBe("Numeracy_with_calculator");
    });
  });

  describe("Language Conventions variants", () => {
    test("'language convention' (singular)", () => {
      expect(inferSubjectFromQuizName("Language Convention Year 3")).toBe("Language_convention");
    });
    test("'language conventions' (plural)", () => {
      expect(inferSubjectFromQuizName("Language Conventions")).toBe("Language_convention");
    });
    test("just 'conventions'", () => {
      expect(inferSubjectFromQuizName("Year 9 Conventions Test")).toBe("Language_convention");
    });
    test("underscore variant", () => {
      expect(inferSubjectFromQuizName("Language_Convention_Year_5")).toBe("Language_convention");
    });
  });

  describe("Numeracy (without calculator)", () => {
    test("simple 'Numeracy'", () => {
      expect(inferSubjectFromQuizName("Numeracy Year 3")).toBe("Numeracy");
    });
    test("numeracy is NOT matched when calculator present", () => {
      // Calculator takes priority
      expect(inferSubjectFromQuizName("Numeracy Calculator Test")).toBe("Numeracy_with_calculator");
    });
  });

  describe("Reading", () => {
    test("'Reading Year 5'", () => expect(inferSubjectFromQuizName("Reading Year 5")).toBe("Reading"));
    test("'reading_test_9'", () => expect(inferSubjectFromQuizName("reading_test_9")).toBe("Reading"));
  });

  describe("Writing", () => {
    test("'Writing Year 7'", () => expect(inferSubjectFromQuizName("Writing Year 7")).toBe("Writing"));
  });

  describe("Unknown / edge cases", () => {
    test("empty string → empty string", () => expect(inferSubjectFromQuizName("")).toBe(""));
    test("null → empty string", () => expect(inferSubjectFromQuizName(null)).toBe(""));
    test("undefined → empty string", () => expect(inferSubjectFromQuizName(undefined)).toBe(""));
    test("unrecognized name → empty string", () => expect(inferSubjectFromQuizName("Science Year 5")).toBe(""));
    test("numeric → empty string", () => expect(inferSubjectFromQuizName(123)).toBe(""));
  });
});

// ─── normalizeQuizName Tests ──────────────────────────────────────────────────
describe("normalizeQuizName", () => {
  test("converts to lowercase", () => {
    expect(normalizeQuizName("READING")).toBe("reading");
  });
  test("replaces underscores with spaces", () => {
    expect(normalizeQuizName("reading_year_5")).toBe("reading year 5");
  });
  test("replaces hyphens with spaces", () => {
    expect(normalizeQuizName("reading-year-5")).toBe("reading year 5");
  });
  test("collapses multiple spaces", () => {
    expect(normalizeQuizName("reading   year  5")).toBe("reading year 5");
  });
  test("trims leading/trailing whitespace", () => {
    expect(normalizeQuizName("  reading ")).toBe("reading");
  });
  test("handles null → empty string", () => {
    expect(normalizeQuizName(null)).toBe("");
  });
});

// ─── Entitlement Check Tests ──────────────────────────────────────────────────
describe("Quiz Entitlement Check", () => {
  const bundleQuizIds = ["quiz_001", "quiz_002", "quiz_003"];

  test("child with matching bundle can access quiz", () => {
    expect(checkEntitlement(["bundle_y3_standard"], bundleQuizIds, "quiz_001")).toBe(true);
  });

  test("child without any bundles cannot access non-trial quiz", () => {
    expect(checkEntitlement([], bundleQuizIds, "quiz_001")).toBe(false);
  });

  test("child with bundle but quiz not in bundle → no access", () => {
    expect(checkEntitlement(["bundle_y3_standard"], bundleQuizIds, "quiz_999")).toBe(false);
  });

  test("child with multiple bundles — one matches", () => {
    expect(checkEntitlement(["bundle_y5", "bundle_y3"], bundleQuizIds, "quiz_002")).toBe(true);
  });
});

// ─── Attempt Limit Tests ──────────────────────────────────────────────────────
describe("Quiz Attempt Limits", () => {
  test("no previous attempts → can attempt", () => {
    expect(canAttemptQuiz([], 5)).toBe(true);
  });

  test("4 completed attempts → can still attempt (under limit of 5)", () => {
    const attempts = Array(4).fill({ status: "completed" });
    expect(canAttemptQuiz(attempts, 5)).toBe(true);
  });

  test("5 completed attempts → cannot attempt (at limit)", () => {
    const attempts = Array(5).fill({ status: "completed" });
    expect(canAttemptQuiz(attempts, 5)).toBe(false);
  });

  test("in_progress attempt is NOT counted toward limit", () => {
    const attempts = [
      { status: "in_progress" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
    ];
    // 4 completed + 1 in_progress = 4 completed → still can attempt
    expect(canAttemptQuiz(attempts, 5)).toBe(true);
  });

  test("ai_done status counts toward limit", () => {
    const attempts = Array(5).fill({ status: "ai_done" });
    expect(canAttemptQuiz(attempts, 5)).toBe(false);
  });

  test("scored status counts toward limit", () => {
    const attempts = Array(5).fill({ status: "scored" });
    expect(canAttemptQuiz(attempts, 5)).toBe(false);
  });
});

// ─── Timer Tests ──────────────────────────────────────────────────────────────
describe("Quiz Timer Calculation", () => {
  test("deadline is in the future", () => {
    const deadline = calculateTimerDeadline(3600);
    expect(deadline.getTime()).toBeGreaterThan(Date.now());
  });

  test("deadline includes grace period (60s added to limit)", () => {
    const timeLimitSec = 1800; // 30 min
    const grace = 60;
    const before = Date.now();
    const deadline = calculateTimerDeadline(timeLimitSec, grace);
    const expectedMin = before + (timeLimitSec + grace) * 1000 - 50;
    const expectedMax = before + (timeLimitSec + grace) * 1000 + 1000;
    expect(deadline.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(deadline.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  test("30-min quiz + 60s grace = approx 31 minutes from now", () => {
    const deadline = calculateTimerDeadline(1800, 60);
    const diffMs = deadline.getTime() - Date.now();
    const diffMin = diffMs / 1000 / 60;
    expect(diffMin).toBeCloseTo(31, 0);
  });
});

// ─── Topic Breakdown Map Tests ────────────────────────────────────────────────
describe("Topic Breakdown Map Handling", () => {
  test("Map tracks topic scores correctly", () => {
    const breakdown = new Map();
    breakdown.set("Fractions", { correct: 3, total: 5 });
    breakdown.set("Decimals", { correct: 2, total: 4 });
    expect(breakdown.get("Fractions").correct).toBe(3);
    expect(breakdown.size).toBe(2);
  });

  test("assigning plain object to Map requires explicit set()", () => {
    const breakdown = new Map();
    // Simulates the bug: directly assigning an object vs. using set()
    const plainObj = { Fractions: { correct: 3, total: 5 } };
    // Converting plain obj to Map entries
    Object.entries(plainObj).forEach(([k, v]) => breakdown.set(k, v));
    expect(breakdown.has("Fractions")).toBe(true);
  });

  test("empty Map → no topics tracked", () => {
    const breakdown = new Map();
    expect(breakdown.size).toBe(0);
    expect(breakdown.has("Fractions")).toBe(false);
  });
});
