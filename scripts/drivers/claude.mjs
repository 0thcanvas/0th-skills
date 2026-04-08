const driver = {
  name: "claude",

  bin: process.env.CLAUDE_BIN || "claude",

  env: {},

  buildArgs({ prompt, cwd, model, priorSession }) {
    const args = ["-p", "--output-format", "json", "--add-dir", cwd];

    if (model) {
      args.push("--model", model);
    }
    if (priorSession?.session_id) {
      args.push("--resume", priorSession.session_id);
    }

    args.push(prompt);
    return args;
  },

  extractResult(stdout, _stderr) {
    let payload;
    try {
      payload = JSON.parse(stdout);
    } catch {
      throw new Error(`Claude response was not valid JSON`);
    }

    if (!Array.isArray(payload)) {
      throw new Error(`Claude response expected a JSON array`);
    }

    const resultEvent = payload.find((entry) => entry.type === "result");
    const assistantEvent = payload.find((entry) => entry.type === "assistant");

    const sessionId =
      resultEvent?.session_id ??
      assistantEvent?.session_id ??
      payload.find((entry) => entry.session_id)?.session_id;

    const text =
      resultEvent?.result ??
      assistantEvent?.message?.content
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        ?.trim();

    if (!sessionId) {
      throw new Error(`Claude response did not include a session_id`);
    }
    if (!text) {
      throw new Error(`Claude response did not include a result payload`);
    }

    return { sessionId, text };
  },

  supportsResume: true,

  stateSuffix: ".claude.json"
};

export default driver;
