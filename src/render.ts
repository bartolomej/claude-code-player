import chalk from "chalk";
import { homedir } from "node:os";
import type { PlayEvent, SessionMeta } from "./events.js";
import { renderMarkdown } from "./markdown.js";

export interface RenderOptions {
  wpm: number;
  turnDelayMs: number;
  toolDelayMs: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function termWidth(): number {
  return Math.max(40, Math.min(process.stdout.columns ?? 100, 120));
}

function tildePath(p?: string): string | undefined {
  if (!p) return p;
  const home = homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function friendlyModel(model?: string): string | undefined {
  if (!model) return model;
  const m = model.toLowerCase();
  if (m.includes("opus-4-7")) return "Opus 4.7";
  if (m.includes("opus-4-6")) return "Opus 4.6";
  if (m.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (m.includes("haiku-4-5")) return "Haiku 4.5";
  return model;
}

export function renderHeader(meta: SessionMeta): string {
  const model = friendlyModel(meta.model);
  const cwd = tildePath(meta.cwd);
  const version = meta.version ? `v${meta.version}` : "";
  const line1 = chalk.bold("Claude Code") + (version ? " " + chalk.dim(version) : "");
  const line2 = [model, "Claude API"].filter(Boolean).join(" · ");
  const line3 = cwd ?? "";
  const sprite = chalk.magenta("✻");
  const pad = "   ";
  return [
    `${sprite} ${line1}`,
    line2 ? `${pad}${chalk.dim(line2)}` : "",
    line3 ? `${pad}${chalk.dim(line3)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function wrap(
  text: string,
  width: number,
  firstPrefix: string,
  restPrefix: string,
): string {
  const out: string[] = [];
  const paragraphs = text.split("\n");
  let isFirstLineOfMessage = true;
  for (const para of paragraphs) {
    if (para.length === 0) {
      out.push("");
      continue;
    }
    let remaining = para;
    while (remaining.length > 0) {
      const prefix = isFirstLineOfMessage ? firstPrefix : restPrefix;
      const budget = Math.max(1, width - prefix.length);
      if (remaining.length <= budget) {
        out.push(prefix + remaining);
        remaining = "";
      } else {
        let cut = remaining.lastIndexOf(" ", budget);
        if (cut <= 0) cut = budget;
        out.push(prefix + remaining.slice(0, cut));
        remaining = remaining.slice(cut).trimStart();
      }
      isFirstLineOfMessage = false;
    }
  }
  return out.join("\n");
}

function renderUser(text: string): string {
  const width = termWidth();
  return chalk.gray(wrap(text, width, "> ", "  "));
}

function prefixAssistant(body: string): string {
  // Leading green bullet on first line; subsequent lines flush left.
  const bullet = chalk.green("●") + " ";
  const [first, ...rest] = body.split("\n");
  return bullet + (first ?? "") + (rest.length ? "\n" + rest.join("\n") : "");
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, Math.max(0, max - 1)) + "…";
}

function formatToolArgs(name: string, input: Record<string, unknown>): string {
  const width = termWidth();
  const budget = Math.max(20, width - name.length - 6);
  const pick = (key: string): string | undefined => {
    const v = input[key];
    return typeof v === "string" ? v : undefined;
  };

  switch (name) {
    case "Bash":
      return pick("command") ?? "";
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return tildePath(pick("file_path") ?? pick("path")) ?? "";
    case "Grep":
      return pick("pattern") ?? "";
    case "Glob":
      return pick("pattern") ?? "";
    case "Task":
    case "Agent":
      return pick("description") ?? pick("subagent_type") ?? "";
    case "WebFetch":
      return pick("url") ?? "";
    case "WebSearch":
      return pick("query") ?? "";
    default: {
      // Generic: first string value.
      for (const v of Object.values(input)) {
        if (typeof v === "string") return v;
      }
      return "";
    }
  }
}

function renderTool(name: string, input: Record<string, unknown>): string {
  const width = termWidth();
  const rawArgs = formatToolArgs(name, input);
  const argsMax = Math.max(20, width - name.length - 6);
  const args = rawArgs ? truncate(rawArgs, argsMax) : "";
  const head = chalk.green("●") + " " + chalk.bold(name);
  return args ? head + chalk.dim("(") + args + chalk.dim(")") : head;
}

function streamChunks(ansi: string): string[] {
  const tokens: { ansi: boolean; text: string }[] = [];
  let i = 0;
  while (i < ansi.length) {
    ANSI_RE.lastIndex = i;
    const m = ANSI_RE.exec(ansi);
    if (m && m.index === i) {
      tokens.push({ ansi: true, text: m[0] });
      i = ANSI_RE.lastIndex;
    } else {
      tokens.push({ ansi: false, text: ansi[i] });
      i++;
    }
  }
  const chunks: string[] = [];
  let buf = "";
  let visible = 0;
  let target = 3 + Math.floor(Math.random() * 4);
  for (const t of tokens) {
    buf += t.text;
    if (!t.ansi) visible++;
    const atBoundary = !t.ansi && /\s/.test(t.text);
    if (visible >= target && (atBoundary || visible >= target + 3)) {
      chunks.push(buf);
      buf = "";
      visible = 0;
      target = 3 + Math.floor(Math.random() * 4);
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function streamAnsi(ansi: string, perVisibleCharMs: number): Promise<void> {
  for (const chunk of streamChunks(ansi)) {
    process.stdout.write(chunk);
    const visible = chunk.replace(ANSI_RE, "").length;
    await sleep(Math.max(1, Math.round(visible * perVisibleCharMs)));
  }
}

export async function play(
  events: PlayEvent[],
  meta: SessionMeta,
  opts: RenderOptions,
): Promise<void> {
  const perChar = Math.max(1, Math.round(10000 / opts.wpm));

  process.stdout.write(renderHeader(meta) + "\n\n");

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const prev = events[i - 1];

    if (prev) {
      if (prev.kind === "tool" && e.kind === "tool") {
        process.stdout.write("\n");
      } else {
        process.stdout.write("\n\n");
      }
    }

    if (e.kind === "user") {
      process.stdout.write(renderUser(e.text));
      await sleep(opts.turnDelayMs);
    } else if (e.kind === "assistant") {
      const body = renderMarkdown(e.text);
      await streamAnsi(prefixAssistant(body), perChar);
      await sleep(opts.turnDelayMs);
    } else {
      process.stdout.write(renderTool(e.name, e.input));
      await sleep(opts.toolDelayMs);
    }
  }
  process.stdout.write("\n");
}
