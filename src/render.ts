import chalk from "chalk";
import type { PlayEvent } from "./events.js";
import { renderMarkdown } from "./markdown.js";

export interface RenderOptions {
  wpm: number;
  turnDelayMs: number;
  toolDelayMs: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Split an ANSI-colored string into stream-friendly chunks of a few visible
 * characters each, keeping ANSI escape sequences intact within a single chunk.
 * Chunk size varies slightly to feel more like real token streaming.
 */
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
  // Varying target size gives a natural token-stream feel (~2–6 visible chars).
  let target = 3 + Math.floor(Math.random() * 4);
  for (const t of tokens) {
    buf += t.text;
    if (!t.ansi) visible++;
    // Prefer to flush right after whitespace so chunks land on word boundaries.
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

async function streamAnsi(
  ansi: string,
  perVisibleCharMs: number,
): Promise<void> {
  const chunks = streamChunks(ansi);
  for (const chunk of chunks) {
    process.stdout.write(chunk);
    const visible = chunk.replace(ANSI_RE, "").length;
    await sleep(Math.max(1, Math.round(visible * perVisibleCharMs)));
  }
}

function renderUserBlock(text: string): string {
  const width = Math.max(40, Math.min(process.stdout.columns ?? 80, 100));
  const inner = width - 4;
  const textWidth = inner - 2;
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > textWidth) {
      let cut = remaining.lastIndexOf(" ", textWidth);
      if (cut <= 0) cut = textWidth;
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    lines.push(remaining);
  }
  const top = "╭" + "─".repeat(width - 2) + "╮";
  const bottom = "╰" + "─".repeat(width - 2) + "╯";
  const body = lines
    .map((l, i) => {
      const prefix = i === 0 ? "> " : "  ";
      const content = (prefix + l).padEnd(inner, " ");
      return "│ " + content + " │";
    })
    .join("\n");
  return chalk.gray(top) + "\n" + chalk.gray(body) + "\n" + chalk.gray(bottom);
}

export async function play(
  events: PlayEvent[],
  opts: RenderOptions,
): Promise<void> {
  // WPM → ms per visible character (assumes ~6 chars per word including space).
  const perChar = Math.max(1, Math.round(10000 / opts.wpm));

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
      process.stdout.write(renderUserBlock(e.text));
      await sleep(opts.turnDelayMs);
    } else if (e.kind === "assistant") {
      const ansi = renderMarkdown(e.text);
      await streamAnsi(ansi, perChar);
      await sleep(opts.turnDelayMs);
    } else {
      process.stdout.write(chalk.green("●") + " " + chalk.bold(e.name));
      await sleep(opts.toolDelayMs);
    }
  }
  process.stdout.write("\n");
}
