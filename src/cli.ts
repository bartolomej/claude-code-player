#!/usr/bin/env node
import { parseArgs } from "node:util";
import { isConfigPath, loadConfig, resolveColor, type PlayerConfig } from "./config.js";
import { normalize } from "./events.js";
import { play } from "./render.js";
import { readSessionLines, resolveSessionPath } from "./session.js";

function usage(): never {
  process.stderr.write(
    [
      "Usage: ccplay <session-id | config.json> [options]",
      "",
      "Arguments:",
      "  <session-id>        Claude Code session UUID, OR",
      "  <config.json>       Path to a JSON config file (sessionId required inside)",
      "",
      "Options (override config values):",
      "  --wpm <n>           Typing speed in words per minute (default 3500)",
      "  --turn-delay <ms>   Pause between turns (default 800)",
      "  --tool-delay <ms>   Pause after a tool indicator (default 400)",
      "  --think-ms <ms>     Thinking-spinner duration (default 1400, 0 disables)",
      "  --agent <name>      Agent label (default: read from session)",
      "  --agent-color <c>   Agent pill color: hex (#d97757) or named (orange/blue/...)",
      "  --user <name>       User greeting name (default: $USER)",
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
      "think-ms": { type: "string" },
      agent: { type: "string" },
      "agent-color": { type: "string" },
      user: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length !== 1) usage();

  const arg = positionals[0];
  const config: PlayerConfig = isConfigPath(arg)
    ? loadConfig(arg)
    : { sessionId: arg };

  // CLI flags take precedence over config values, which take precedence over
  // defaults.
  const pick = <T,>(cliVal: string | undefined, cfgVal: T | undefined, fallback: T, parse: (s: string) => T = (s) => s as T): T =>
    cliVal !== undefined ? parse(cliVal) : cfgVal !== undefined ? cfgVal : fallback;

  const wpm = pick(values.wpm, config.speed?.wpm, 3500, Number);
  const turnDelayMs = pick(values["turn-delay"], config.speed?.turnDelayMs, 800, Number);
  const toolDelayMs = pick(values["tool-delay"], config.speed?.toolDelayMs, 400, Number);
  const thinkMs = pick(values["think-ms"], config.speed?.thinkMs, 1400, Number);

  const path = await resolveSessionPath(config.sessionId);
  const lines = await readSessionLines(path);
  const { meta, events } = normalize(lines, config.filters);

  const agentName = values.agent ?? config.agent?.name;
  if (agentName) meta.agent = agentName;
  const agentColor = resolveColor(values["agent-color"] ?? config.agent?.color);
  if (agentColor) meta.agentColor = agentColor;

  const userOverride = values.user ?? config.user;
  const envUser = process.env.USER ?? process.env.USERNAME;
  const defaultUser = envUser
    ? envUser.charAt(0).toUpperCase() + envUser.slice(1)
    : undefined;
  meta.userName = userOverride ?? defaultUser;

  if (events.length === 0) {
    process.stderr.write("No playable events found in this session.\n");
    process.exit(2);
  }

  await play(events, meta, {
    wpm,
    turnDelayMs,
    toolDelayMs,
    thinkMs,
    tools: config.tools,
  });
}

main().catch((err) => {
  process.stderr.write(`ccplay: ${(err as Error).message}\n`);
  process.exit(1);
});
