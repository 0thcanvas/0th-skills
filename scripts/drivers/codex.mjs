const driver = {
  name: "codex",
  bin: process.env.CODEX_BIN || "codex",
  env: {},

  buildArgs({ prompt, model, priorSession }) {
    if (priorSession?.session_id) {
      return [
        "exec",
        "resume",
        "--json",
        priorSession.session_id,
        ...(model ? ["--model", model] : []),
        prompt
      ];
    }
    return ["exec", "--json", ...(model ? ["--model", model] : []), prompt];
  },

  extractResult(stdout, _stderr) {
    const events = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{") && line.endsWith("}"))
      .map((line) => JSON.parse(line));

    const threadStarted = events.find((entry) => entry.type === "thread.started");
    const itemCompleted = [...events].reverse().find((entry) => entry.type === "item.completed");

    const threadId = threadStarted?.thread_id;
    const text = itemCompleted?.item?.text?.trim();

    if (!threadId) {
      throw new Error("Codex response did not include a thread_id.");
    }
    if (!text) {
      throw new Error("Codex response did not include a final message.");
    }

    return { sessionId: threadId, text };
  },

  supportsResume: true,
  stateSuffix: ".codex.json"
};

export default driver;
