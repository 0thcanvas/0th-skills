import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaudePrintArgs,
  parseClaudePrintOutput
} from "../scripts/claude-print-adapter.mjs";

test("Claude print args isolate tools and settings while keeping the packet prompt off argv", () => {
  const prompt = "portable packet content";
  const args = buildClaudePrintArgs({
    model: "opus",
    effort: "low",
    schema: { type: "object" }
  });

  assert.equal(args.includes(prompt), false);
  assert.deepEqual(args.slice(0, 3), ["-p", "--output-format", "json"]);
  assert.equal(args.includes("--disable-slash-commands"), true);
  assert.equal(args.includes("--no-session-persistence"), true);
  assert.equal(args.includes("--json-schema"), true);
  assert.equal(args.includes("--tools"), true);
  assert.equal(args.includes("{\"mcpServers\":{}}"), true);
});

test("Claude print output extracts structured output and runtime metadata", () => {
  const parsed = parseClaudePrintOutput(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "session-1",
    structured_output: {
      packet_hash: "a".repeat(64),
      record_ids: ["record-a"],
      open_loop_ids: ["gap-a"],
      decision: "retain-neutral-contract"
    },
    modelUsage: {
      "claude-opus-test": {
        inputTokens: 20,
        outputTokens: 10
      }
    },
    total_cost_usd: 0.01,
    duration_ms: 1000
  }));

  assert.equal(parsed.session_id, "session-1");
  assert.deepEqual(parsed.models, ["claude-opus-test"]);
  assert.equal(parsed.output.decision, "retain-neutral-contract");
  assert.equal(parsed.usage.input_tokens, 20);
  assert.equal(parsed.usage.output_tokens, 10);
});

test("Claude print output accepts the 2.1.139 event-array envelope", () => {
  const parsed = parseClaudePrintOutput(JSON.stringify([
    {
      type: "system",
      subtype: "init",
      session_id: "session-array",
      model: "claude-opus-test"
    },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: "session-array",
      structured_output: {
        packet_hash: "b".repeat(64),
        record_ids: ["record-a"],
        open_loop_ids: ["gap-a"],
        decision: "retain-neutral-contract"
      },
      usage: {
        input_tokens: 30,
        output_tokens: 12
      },
      modelUsage: {}
    }
  ]));

  assert.equal(parsed.session_id, "session-array");
  assert.deepEqual(parsed.models, ["claude-opus-test"]);
  assert.equal(parsed.usage.input_tokens, 30);
  assert.equal(parsed.output.packet_hash, "b".repeat(64));
});
