const driver = {
  name: "grok",
  bin: process.env.GROK_BIN || "grok",
  env: {},

  buildArgs({ prompt, cwd, model, priorSession }) {
    const args = ["-p", prompt, "--output-format", "json"];
    if (cwd) args.push("--cwd", cwd);
    if (model) args.push("--model", model);
    if (priorSession?.session_id) args.push("--resume", priorSession.session_id);
    return args;
  },

  extractResult(stdout, _stderr) {
    let payload;
    try {
      payload = JSON.parse(stdout);
    } catch {
      throw new Error("Grok response was not valid JSON");
    }

    if (payload?.type === "error") {
      throw new Error(payload.message || "Grok returned an error payload");
    }

    const sessionId = payload?.sessionId ?? null;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) throw new Error("Grok response did not include a result payload");
    return { sessionId, text };
  },

  supportsResume: true,
  stateSuffix: ".grok.json"
};

export default driver;
