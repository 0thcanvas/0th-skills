const driver = {
  name: "agy",
  bin: process.env.AGY_BIN || "agy",
  env: {},

  buildArgs({ prompt, cwd }) {
    // Antigravity CLI print mode currently uses the model selected in the app;
    // it does not expose a stable --model flag through `agy --help`.
    return ["-p", prompt, "--add-dir", cwd];
  },

  extractResult(stdout, _stderr) {
    const text = stdout.trim();

    if (!text) {
      throw new Error("Agy response did not include a result payload.");
    }

    return { sessionId: null, text };
  },

  // Agy supports --conversation, but print mode currently emits prior assistant
  // transcript text along with the new response. Treat it as single-shot until
  // the CLI exposes a clean machine-readable resume surface.
  supportsResume: false,
  stateSuffix: ".agy.json"
};

export default driver;
