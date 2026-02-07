const path = require("path");
const { spawn } = require("child_process");

/**
 * Runs the Python Gemini subject-feedback generator.
 *
 * Input:
 *   { doc: <subset of Result doc> }
 * Output:
 *   { success: boolean, ... }
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

    const p = spawn("python", [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env, // needs GEMINI_API_KEY (+ optional GEMINI_MODEL)
    });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `Python exit code ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error("Failed to parse python output: " + out));
      }
    });

    p.stdin.write(JSON.stringify(payload || {}));
    p.stdin.end();
  });
}

module.exports = { runSubjectFeedbackPython };
