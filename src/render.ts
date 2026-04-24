import chalk from "chalk";
import type { PlayEvent } from "./events.js";

export interface RenderOptions {
  wpm: number;
  turnDelayMs: number;
  toolDelayMs: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function charDelayMs(wpm: number): number {
  // ~6 chars per word including trailing space.
  const charsPerSec = (wpm * 6) / 60;
  return Math.max(1, Math.round(1000 / charsPerSec));
}

async function typewrite(text: string, perCharMs: number): Promise<void> {
  for (const ch of text) {
    process.stdout.write(ch);
    // Newlines and spaces don't need full delay.
    if (ch === "\n") {
      await sleep(Math.min(perCharMs, 8));
    } else if (ch === " ") {
      await sleep(Math.max(1, Math.floor(perCharMs / 2)));
    } else {
      await sleep(perCharMs);
    }
  }
}

function renderUserBlock(text: string): string {
  const width = Math.max(40, Math.min(process.stdout.columns ?? 80, 100));
  const inner = width - 4; // "│ " + " │"
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > inner) {
      let cut = remaining.lastIndexOf(" ", inner);
      if (cut <= 0) cut = inner;
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
  const perChar = charDelayMs(opts.wpm);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const prev = events[i - 1];

    // Spacing between events.
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
      await typewrite(e.text, perChar);
      await sleep(opts.turnDelayMs);
    } else {
      // tool indicator: "● ToolName"
      process.stdout.write(chalk.green("●") + " " + chalk.bold(e.name));
      await sleep(opts.toolDelayMs);
    }
  }
  process.stdout.write("\n");
}
