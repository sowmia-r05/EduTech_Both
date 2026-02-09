const path = require("path");
const { spawn } = require("child_process");

/**
 * Runs the Python Gemini subject-feedback generator.
 *
 * Input:
 *   { doc: <subset of Result doc> }
 * Output:
 *   { success: boolean, ... }
 *
 * Env supported:
 * - SUBJECT_FEEDBACK_PYTHON (optional): python command ("python" / "python3" / full path)
 * - SUBJECT_FEEDBACK_TIMEOUT_MS (optional): default 25000
 */
function runSubjectFeedbackPython(payload) {
  return new Promise((resolve, reject) => {
    const script = path.join(
      __dirname,
      "..",
      "..",
      "subject_feedback",
      "gemini_subject_feedback.py"
    );

    const pythonCmd = process.env.SUBJECT_FEEDBACK_PYTHON || "python";
    const timeoutMs = Number(process.env.SUBJECT_FEEDBACK_TIMEOUT_MS || 25000);

    const p = spawn(pythonCmd, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env, // needs GEMINI_API_KEY (+ optional GEMINI_MODEL)
    });

    let out = "";
    let err = "";
    let finished = false;

    // Safety: kill python if it hangs
    const timer = setTimeout(() => {
      if (finished) return;
      try {
        p.kill("SIGKILL");
      } catch (_) {}
      const msg =
        `Subject feedback python timed out after ${timeoutMs}ms. ` +
        `Try lowering prompt size / tokens in gemini_subject_feedback.py.`;
      reject(new Error(msg));
    }, timeoutMs);

    // Optional: prevent enormous outputs
    const MAX_OUT = 2_000_000; // 2MB
    const MAX_ERR = 1_000_000; // 1MB

    p.stdout.on("data", (d) => {
      if (out.length < MAX_OUT) out += d.toString();
    });

    p.stderr.on("data", (d) => {
      if (err.length < MAX_ERR) err += d.toString();
    });

    function cleanup() {
      finished = true;
      clearTimeout(timer);
    }

    p.on("error", (e) => {
      cleanup();
      reject(new Error(`Failed to start python process: ${e.message}`));
    });

    p.on("close", (code) => {
      cleanup();

      if (code !== 0) {
        // show last part of stderr (more useful)
        const tail = err ? err.slice(-2000) : "";
        return reject(new Error(tail || `Python exit code ${code}`));
      }

      // ✅ Robust JSON parse:
      // Sometimes python prints logs + JSON. Try to extract last JSON object.
      const text = String(out || "").trim();
      if (!text) {
        const tail = err ? err.slice(-2000) : "";
        return reject(new Error(`Python returned empty output. stderr: ${tail}`));
      }

      // Try direct parse first
      try {
        return resolve(JSON.parse(text));
      } catch (_) {
        // Extract last {...} JSON block
        const start = text.lastIndexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          const candidate = text.slice(start, end + 1);
          try {
            return resolve(JSON.parse(candidate));
          } catch (e2) {
            return reject(
              new Error(
                `Failed to parse python JSON output. ` +
                  `ParseError=${e2.message}. OutputTail=${text.slice(-2000)}`
              )
            );
          }
        }

        return reject(new Error("Failed to parse python output (no JSON found): " + text.slice(-2000)));
      }
    });

    // Write payload
    try {
      p.stdin.write(JSON.stringify(payload || {}));
      p.stdin.end();
    } catch (e) {
      cleanup();
      try {
        p.kill("SIGKILL");
      } catch (_) {}
      reject(new Error(`Failed to send payload to python: ${e.message}`));
    }
  });
}

module.exports = { runSubjectFeedbackPython };
