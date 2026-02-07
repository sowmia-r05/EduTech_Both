const path = require("path");
const { spawn } = require("child_process");

function runPythonEval(payload) {
  return new Promise((resolve, reject) => {
    // ✅ This must be the folder that contains the "ai/" package
    const backendRoot = path.resolve(__dirname, "..", "..");

    // ✅ Windows uses "py", Linux/Render uses "python3"
    const pyCmd = process.platform === "win32" ? "py" : "python3";

    // ✅ Run as module so relative/absolute imports work properly
    const args = ["-m", "ai.gemini_writing_eval"];

    const p = spawn(pyCmd, args, {
      cwd: backendRoot, // ✅ critical
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
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
        reject(new Error(`Failed to parse python output: ${out}\n${err}`));
      }
    });

    p.stdin.write(JSON.stringify(payload));
    p.stdin.end();
  });
}

module.exports = { runPythonEval };
