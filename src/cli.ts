#!/usr/bin/env node
import { parseArgs } from "node:util";
import { normalize } from "./events.js";
import { play } from "./render.js";
import { readSessionLines, resolveSessionPath } from "./session.js";

function usage(): never {
  process.stderr.write(
    [
      "Usage: ccplay <session-id> [options]",
      "",
      "Options:",
      "  --wpm <n>           Typing speed in words per minute (default 600)",
      "  --turn-delay <ms>   Pause between turns (default 800)",
      "  --tool-delay <ms>   Pause after a tool indicator (default 400)",
      "  -h, --help          Show this help",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      wpm: { type: "string" },
      "turn-delay": { type: "string" },
      "tool-delay": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length !== 1) usage();

  const sessionId = positionals[0];
  const wpm = values.wpm ? Number(values.wpm) : 600;
  const turnDelayMs = values["turn-delay"] ? Number(values["turn-delay"]) : 800;
  const toolDelayMs = values["tool-delay"] ? Number(values["tool-delay"]) : 400;

  const path = await resolveSessionPath(sessionId);
  const lines = await readSessionLines(path);
  const events = normalize(lines);

  if (events.length === 0) {
    process.stderr.write("No playable events found in this session.\n");
    process.exit(2);
  }

  await play(events, { wpm, turnDelayMs, toolDelayMs });
}

main().catch((err) => {
  process.stderr.write(`ccplay: ${(err as Error).message}\n`);
  process.exit(1);
});
