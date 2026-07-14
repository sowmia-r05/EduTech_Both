// src/services/writingAiService.js
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 FIXES (A5 + WRITE-TIMEOUT)
//
// FIX-1 — NO CONCURRENCY LIMIT.
//   This was the LAST unguarded Python spawn site. Every other AI service
//   (aiFeedbackService, subjectFeedbackService, resultAiService,
//   explanationRoutes) already routes through runWithPythonLimit. This one
//   called spawn() directly, so it could fork Python processes without bound.
//   On Render's 512MB instance, each Python + Gemini SDK process is the memory
//   bottleneck — two concurrent writing submissions OOM-kill the whole box.
//   NOW: shares the SAME process-wide pool (MAX_CONCURRENT_PYTHON) as every
//   other feature. Pool + queue full -> rejects with PythonBusyError (503)
//   BEFORE forking anything.
//
// FIX-2 — NO TIMEOUT AT ALL.
//   The old spawn had no `timeout` option and no kill timer. A Python process
//   that hung on a slow Gemini call held its slot, its memory, and the caller's
//   HTTP request open FOREVER. Every other spawn site sets a timeout; this one
//   didn't.
//   NOW: WRITING_EVAL_TIMEOUT_MS (default 60s), enforced with an explicit
//   SIGKILL timer that fires even if the child ignores SIGTERM.
//
// FIX-3 — UNBOUNDED OUTPUT BUFFERS.
//   `out += d.toString()` with no cap. A runaway Python process printing to
//   stdout grows a string until the heap dies. NOW capped.
//
// FIX-4 — BRITTLE JSON PARSE.
//   `JSON.parse(out)` threw whenever Python printed a warning line before the
//   JSON (which the google-generativeai SDK does). NOW uses the same robust
//   last-JSON-object extraction as aiFeedbackService.
//
// FIX-5 — CROSS-PLATFORM PYTHON BINARY.
//   Honours PYTHON_BIN (consistent with the other services) before falling back
//   to platform detection.
// ═══════════════════════════════════════════════════════════════════════════
//
// Env:
//   PYTHON_BIN                 python command ("python3" / "py" / full path)
//   WRITING_EVAL_TIMEOUT_MS    default 60000
//   MAX_CONCURRENT_PYTHON      read by pythonSpawnLimiter (use 1 on 512MB)
//   MAX_PYTHON_QUEUE           read by pythonSpawnLimiter (use 10)

const path = require("path");
const { spawn } = require("child_process");

// ✅ FIX-1: the shared, process-wide Python pool.
const { runWithPythonLimit } = require("../utils/pythonSpawnLimiter");

const TIMEOUT_MS = Number(process.env.WRITING_EVAL_TIMEOUT_MS || 60000);

// Cap stdout/stderr so a runaway process can't eat the heap.
const MAX_OUT = 2_000_000; // 2MB
const MAX_ERR = 1_000_000; // 1MB

// ✅ FIX-5: PYTHON_BIN first (matches subjectFeedbackService / explanationRoutes),
// then platform detection. "py" on Windows, "python3" on Linux/Render.
const PYTHON_BIN =
  process.env.PYTHON_BIN ||
  (process.platform === "win32" ? "py" : "python3");

/**
 * Extract the last complete JSON object from mixed Python output.
 * The google-generativeai SDK prints warnings to stdout, so a bare
 * JSON.parse() on the whole buffer throws.
 */
function parsePythonJson(raw, stderrTail) {
  const text = String(raw || "").trim();

  if (!text) {
    throw new Error(
      `Python returned empty output. stderr: ${String(stderrTail || "").slice(-1000)}`
    );
  }

  // Happy path.
  try {
    return JSON.parse(text);
  } catch (_) {
    /* fall through */
  }

  // Extract the last {...} block.
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e2) {
      throw new Error(
        `Failed to parse writing-eval Python output: ${e2.message}\n` +
          `Tail: ${text.slice(-500)}`
      );
    }
  }

  throw new Error(`No JSON found in writing-eval Python output: ${text.slice(-500)}`);
}

/**
 * Run ai/gemini_writing_eval.py with the given payload on stdin.
 *
 * ✅ Wrapped in runWithPythonLimit — shares the SAME pool as every other AI
 * feature, so total concurrent Python across the whole app is bounded by ONE
 * ceiling. When the pool AND the wait-queue are full, this rejects with a
 * PythonBusyError (err.code === "PYTHON_BUSY", err.status === 503) BEFORE
 * forking anything.
 *
 * ⚠️ CALLERS MUST HANDLE PYTHON_BUSY. Surface it as 503 + Retry-After, not 500.
 * See explanationRoutes.js for the pattern:
 *
 *     catch (err) {
 *       if (err.code === "PYTHON_BUSY" || err.status === 503) {
 *         res.set("Retry-After", "10");
 *         return res.status(503).json({
 *           error: "AI marking is busy right now. Please try again in a moment.",
 *           code: "PYTHON_BUSY",
 *         });
 *       }
 *       ...
 *     }
 *
 * @param {object} payload  JSON-serialisable input for the Python script
 * @returns {Promise<object>} parsed JSON result
 */
function runPythonEval(payload) {
  return runWithPythonLimit(
    () =>
      new Promise((resolve, reject) => {
        // The folder that CONTAINS the "ai/" package — required for `-m` to work.
        const backendRoot = path.resolve(__dirname, "..", "..");

        const child = spawn(PYTHON_BIN, ["-m", "ai.gemini_writing_eval"], {
          cwd: backendRoot,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env }, // needs GEMINI_API_KEY
        });

        let out = "";
        let err = "";
        let settled = false;

        // ✅ FIX-2: hard timeout. spawn()'s own `timeout` option sends SIGTERM,
        // which a Python process blocked on a network read can ignore. This
        // timer SIGKILLs — it cannot be ignored — and always releases the pool
        // slot, because runWithPythonLimit releases on reject too.
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            child.kill("SIGKILL");
          } catch (_) {
            /* already gone */
          }
          reject(
            new Error(
              `Writing evaluation timed out after ${TIMEOUT_MS}ms. ` +
                `Raise WRITING_EVAL_TIMEOUT_MS, or reduce prompt size / max_tokens ` +
                `in ai/gemini_writing_eval.py.`
            )
          );
        }, TIMEOUT_MS);

        function done() {
          settled = true;
          clearTimeout(timer);
        }

        // ✅ FIX-3: bounded buffers.
        child.stdout.on("data", (d) => {
          if (out.length < MAX_OUT) out += d.toString();
        });
        child.stderr.on("data", (d) => {
          if (err.length < MAX_ERR) err += d.toString();
        });

        child.on("error", (e) => {
          if (settled) return;
          done();
          reject(
            new Error(
              `Failed to start Python (${PYTHON_BIN}): ${e.message}. ` +
                `Set PYTHON_BIN if the binary is named differently on this host.`
            )
          );
        });

        child.on("close", (code) => {
          if (settled) return; // timeout already rejected
          done();

          if (code !== 0) {
            const tail = err ? err.slice(-2000) : "";
            return reject(
              new Error(tail || `Writing-eval Python exited with code ${code}`)
            );
          }

          // ✅ FIX-4: robust parse.
          try {
            return resolve(parsePythonJson(out, err));
          } catch (parseErr) {
            return reject(parseErr);
          }
        });

        // Guard against EPIPE if the child died before we finished writing.
        child.stdin.on("error", () => {
          /* the close/error handler above will settle this */
        });

        try {
          child.stdin.write(JSON.stringify(payload));
          child.stdin.end();
        } catch (e) {
          if (!settled) {
            done();
            reject(new Error(`Failed to send payload to Python: ${e.message}`));
          }
        }
      })
  );
}

module.exports = { runPythonEval };