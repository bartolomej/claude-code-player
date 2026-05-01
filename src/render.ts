import chalk from "chalk";
import { homedir } from "node:os";
import type { PlayEvent, SessionMeta } from "./events.js";
import { renderClawdRows } from "./clawd.js";
import { renderMarkdown } from "./markdown.js";

export interface RenderOptions {
  wpm: number;
  turnDelayMs: number;
  toolDelayMs: number;
  thinkMs: number;
  tools?: {
    dim?: boolean;
    runThreshold?: number;
    runToolDelayMs?: number;
    runSkipSpinner?: boolean;
  };
}

// Claude Code-ish palette.
const GREEN = chalk.hex("#5fa561");
const DIM = chalk.dim;
const BRAND = chalk.hex("#d97757"); // Claude brand orange
const ASK_BLUE = chalk.hex("#7c8cde"); // AskUserQuestion accent

const SPINNER_FRAMES = ["✶", "✳", "✻", "✽", "✢", "·"];
const THINKING_VERBS = [
  "Thinking",
  "Pondering",
  "Cogitating",
  "Mulling",
  "Brewing",
  "Weaving",
  "Percolating",
  "Simmering",
  "Musing",
  "Contemplating",
  "Noodling",
];

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

function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function padRightVis(s: string, width: number): string {
  const pad = Math.max(0, width - visibleLen(s));
  return s + " ".repeat(pad);
}

function centerVis(s: string, width: number): string {
  const pad = Math.max(0, width - visibleLen(s));
  const l = Math.floor(pad / 2);
  return " ".repeat(l) + s + " ".repeat(pad - l);
}

function truncateVis(s: string, width: number): string {
  if (visibleLen(s) <= width) return s;
  return s.slice(0, Math.max(0, width - 1)) + "…";
}

export function renderHeader(meta: SessionMeta): string {
  const width = Math.min(termWidth(), 110);
  const leftW = Math.max(30, Math.floor(width * 0.58)) - 2; // content width
  const rightW = Math.max(24, width - leftW - 7); // content width of right col
  const leftSegW = leftW + 2;
  const rightSegW = rightW + 2;
  const totalW = leftSegW + rightSegW + 3;

  const titleStyled =
    " " +
    BRAND("Claude Code") +
    (meta.version ? " " + DIM(`v${meta.version}`) : "") +
    " ";
  const topLeft =
    chalk.dim("─") +
    titleStyled +
    chalk.dim(
      "─".repeat(Math.max(1, leftSegW - 1 - visibleLen(titleStyled))),
    );
  const top =
    chalk.dim("╭") +
    topLeft +
    chalk.dim("┬") +
    chalk.dim("─".repeat(rightSegW)) +
    chalk.dim("╮");
  const bottom = chalk.dim("╰" + "─".repeat(leftSegW) + "┴" + "─".repeat(rightSegW) + "╯");

  // Left column content.
  const greet = `Welcome back${meta.userName ? " " + meta.userName : ""}!`;
  const model = friendlyModel(meta.model);
  const sprite = renderClawdRows();

  const left: string[] = [];
  left.push("");
  left.push(chalk.bold(greet));
  left.push("");
  for (const r of sprite) left.push(r);
  left.push("");
  if (model) {
    const modelLine = `${model} with medium effort · Claude API${
      meta.organizationName ? ` · ${meta.organizationName}` : ""
    }`;
    left.push(DIM(truncateVis(modelLine, leftW)));
  }
  const cwd = tildePath(meta.cwd);
  if (meta.agent) left.push(DIM(truncateVis(`@${meta.agent}`, leftW)));
  if (cwd) left.push(DIM(truncateVis(cwd, leftW)));
  left.push("");

  // Right column content: tips + activity.
  const tipText = "Run /init to create a CLAUDE.md file with instructions for Claude";
  const right: string[] = [];
  right.push("");
  right.push(BRAND.bold("Tips for getting started"));
  right.push(truncateVis(tipText, rightW));
  right.push("");
  right.push(BRAND.bold("Recent activity"));
  right.push(DIM("No recent activity"));
  right.push("");

  const rows = Math.max(left.length, right.length);
  while (left.length < rows) left.push("");
  while (right.length < rows) right.push("");

  const body = left
    .map((l, i) => {
      const r = right[i] ?? "";
      // Center the greeting and sprite rows; left-align everything else.
      const leftFormatted =
        i === 1 || (i >= 3 && i < 3 + sprite.length)
          ? centerVis(l, leftW)
          : padRightVis(l, leftW);
      return (
        chalk.dim("│ ") +
        leftFormatted +
        chalk.dim(" │ ") +
        padRightVis(r, rightW) +
        chalk.dim(" │")
      );
    })
    .join("\n");

  // Guard: for very narrow terminals, fall back to a 1-column layout.
  if (totalW > termWidth()) {
    const fallback =
      chalk.dim("╭─") +
      titleStyled +
      chalk.dim(
        "─".repeat(
          Math.max(1, termWidth() - visibleLen(titleStyled) - 3),
        ),
      ) +
      chalk.dim("╮");
    return fallback; // extremely narrow — just show title bar
  }

  return [top, body, bottom].join("\n");
}

// --- Input box -------------------------------------------------------------

function wrapPromptText(typed: string, firstBudget: number, contBudget: number): string[] {
  // Hard-wrap by character so the cursor flows naturally as the user types.
  if (typed.length === 0) return [""];
  const lines: string[] = [];
  let remaining = typed;
  let budget = firstBudget;
  while (remaining.length > budget) {
    lines.push(remaining.slice(0, budget));
    remaining = remaining.slice(budget);
    budget = contBudget;
  }
  lines.push(remaining);
  return lines;
}

function renderInputBoxLines(meta: SessionMeta, typed: string): string[] {
  const width = termWidth();
  const inner = Math.max(10, width - 4); // content width between "│ " and " │"
  const pillColor = meta.agentColor ?? "#d97757";
  const border = chalk.hex(pillColor);

  const top = border("╭" + "─".repeat(width - 2) + "╮");

  // Content lines — prompt "› " on first line, 2-space indent on continuations.
  // Reserve 1 extra column for the trailing cursor block so the rendered line
  // never overflows `width` and triggers a terminal soft-wrap (which would
  // desync our row count and leave ghost borders during redraws).
  const textBudget = Math.max(1, inner - 3);
  const wrapped = wrapPromptText(typed, textBudget, textBudget);
  const contentLines: string[] = [];
  for (let i = 0; i < wrapped.length; i++) {
    const isLast = i === wrapped.length - 1;
    const prefix = i === 0 ? chalk.bold("›") + " " : "  ";
    const cursor = isLast ? chalk.inverse(" ") : "";
    const body = prefix + wrapped[i] + cursor;
    contentLines.push(border("│ ") + padRightVis(body, inner) + border(" │"));
  }

  // Bottom border with agent badge tucked into the right side.
  const tag = meta.agent ? ` ${meta.agent} ` : "";
  const tagStyled = tag ? chalk.bgHex(pillColor).hex("#1a1a1a")(tag) : "";
  const dashBudget = width - 2 - visibleLen(tagStyled) - 1; // -1 for trailing "─"
  const bottom =
    border("╰" + "─".repeat(Math.max(1, dashBudget))) +
    tagStyled +
    border("─╯");

  const statusLeft = DIM("? for shortcuts");
  const statusRight = DIM("◐ medium · /effort");
  const gap = " ".repeat(
    Math.max(2, width - visibleLen(statusLeft) - visibleLen(statusRight)),
  );
  const status = statusLeft + gap + statusRight;

  return [top, ...contentLines, bottom, "", status];
}

// --- Text helpers ----------------------------------------------------------

function wrap(
  text: string,
  width: number,
  firstPrefix: string,
  restPrefix: string,
): string {
  const out: string[] = [];
  let firstLine = true;
  for (const para of text.split("\n")) {
    if (para.length === 0) {
      out.push("");
      continue;
    }
    let remaining = para;
    while (remaining.length > 0) {
      const prefix = firstLine ? firstPrefix : restPrefix;
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
      firstLine = false;
    }
  }
  return out.join("\n");
}

function renderUserTranscript(text: string): string {
  return wrap(text, termWidth(), DIM("> "), "  ");
}

function prefixAssistant(body: string): string {
  const bullet = GREEN("●") + " ";
  const [first, ...rest] = body.split("\n");
  return bullet + (first ?? "") + (rest.length ? "\n" + rest.join("\n") : "");
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, Math.max(0, max - 1)) + "…";
}

function formatToolArgs(name: string, input: Record<string, unknown>): string {
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
    case "Glob":
      return pick("pattern") ?? "";
    case "Task":
    case "Agent":
      return pick("description") ?? pick("subagent_type") ?? "";
    case "WebFetch":
      return pick("url") ?? "";
    case "WebSearch":
      return pick("query") ?? "";
    default:
      for (const v of Object.values(input)) {
        if (typeof v === "string") return v;
      }
      return "";
  }
}

function renderTool(
  name: string,
  input: Record<string, unknown>,
  dim = false,
): string {
  const width = termWidth();
  const rawArgs = formatToolArgs(name, input);
  const argsMax = Math.max(20, width - name.length - 6);
  const args = rawArgs ? truncate(rawArgs, argsMax) : "";
  const bullet = dim ? DIM("●") : GREEN("●");
  const nameStyled = dim ? DIM(name) : chalk.bold(name);
  const head = bullet + " " + nameStyled;
  if (!args) return head;
  const argsStyled = dim ? DIM(args) : args;
  return head + DIM("(") + argsStyled + DIM(")");
}

// --- AskUserQuestion flow --------------------------------------------------

interface AskOption {
  label: string;
  description?: string;
}
interface AskQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: AskOption[];
}

function parseAskAnswers(
  resultText: string,
  questions: AskQuestion[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i].question;
    const needle = `"${q}"="`;
    const start = resultText.indexOf(needle);
    if (start === -1) continue;
    const valStart = start + needle.length;
    // Find the end: either the next known question's `"question"="` or the
    // trailing `". You can now continue` / end of string. Strip the closing `"`.
    let valEnd = resultText.length;
    for (let j = i + 1; j < questions.length; j++) {
      const nextNeedle = `"${questions[j].question}"="`;
      const nextPos = resultText.indexOf(nextNeedle, valStart);
      if (nextPos !== -1) {
        valEnd = nextPos;
        break;
      }
    }
    let answer = resultText.slice(valStart, valEnd).trimEnd();
    // Strip trailing separator: `". You can now continue...` or just `".`
    answer = answer.replace(/"\.\s*You can now continue.*$/s, "");
    answer = answer.replace(/"\.\s*$/, "");
    // Strip a single trailing quote if present
    if (answer.endsWith('"')) answer = answer.slice(0, -1);
    map.set(q, answer);
  }
  return map;
}

function selectedIndices(
  options: AskOption[],
  answer: string | undefined,
): number[] {
  if (!answer) return [];
  const out: number[] = [];
  for (let i = 0; i < options.length; i++) {
    if (answer.includes(options[i].label)) out.push(i);
  }
  return out;
}

async function renderQuestionCard(
  q: AskQuestion,
  answer: string | undefined,
): Promise<void> {
  const width = termWidth();
  const out = process.stdout;

  // Header pill: "□ {header}" with blue-ish background and dark text.
  if (q.header) {
    out.write(chalk.bgHex("#7c8cde").hex("#1a1a1a")(` □ ${q.header} `) + "\n\n");
  }

  // Question: bold, wrapped to terminal width.
  out.write(chalk.bold(wrap(q.question, width, "", "")) + "\n\n");

  const labelLineOffsets: number[] = [];
  let linesBelow = 0;

  q.options.forEach((opt, i) => {
    labelLineOffsets.push(linesBelow);
    out.write(`  ${i + 1}. ${opt.label}\n`);
    linesBelow++;
    if (opt.description) {
      const desc = truncate(opt.description, Math.max(20, width - 6));
      out.write(`     ${DIM(desc)}\n`);
      linesBelow++;
    }
  });

  // Built-in trailing items that always appear in Claude Code's picker.
  const typeNum = q.options.length + 1;
  const chatNum = q.options.length + 2;
  const typeLineOffset = linesBelow;
  out.write(`  ${typeNum}. Type something.\n`);
  linesBelow++;
  out.write(DIM("─".repeat(Math.min(width, 60))) + "\n");
  linesBelow++;
  out.write(`  ${chatNum}. Chat about this\n`);
  linesBelow++;
  out.write("\n");
  linesBelow++;
  out.write(
    DIM("Enter to select · ↑/↓ to navigate · Esc to cancel") + "\n",
  );
  linesBelow++;

  await sleep(600);

  const selected = selectedIndices(q.options, answer);
  if (selected.length === 0 && answer) {
    // Free-text answer — highlight "Type something" and show the typed text
    // below the card (cursor math can't expand a single line to multiple).
    const upBy = linesBelow - typeLineOffset;
    out.write(`\x1b[${upBy}A\r\x1b[2K`);
    out.write(`${ASK_BLUE("›")} ${typeNum}. ${ASK_BLUE("Type something.")}`);
    out.write(`\x1b[${upBy}B\r`);
    out.write("\n" + wrap(ASK_BLUE(answer), width, "  ", "  ") + "\n");
  } else {
    for (const idx of selected) {
      const offset = labelLineOffsets[idx];
      const upBy = linesBelow - offset;
      out.write(`\x1b[${upBy}A\r\x1b[2K`);
      out.write(
        `${ASK_BLUE("›")} ${idx + 1}. ${ASK_BLUE(q.options[idx].label)}`,
      );
      out.write(`\x1b[${upBy}B\r`);
      await sleep(240);
    }
  }
  await sleep(350);
}

function renderAskUserSummary(
  questions: AskQuestion[],
  answers: Map<string, string>,
): string {
  const lines: string[] = [];
  const width = termWidth();
  lines.push(GREEN("●") + " User answered Claude's questions:");
  questions.forEach((q, i) => {
    const a = answers.get(q.question);
    if (!a) return;
    const marker = i === 0 ? "  ⎿ · " : "    · ";
    const cont = "      ";
    const body = `${q.question} → ${a}`;
    lines.push(wrap(body, width, DIM(marker), cont));
  });
  return lines.join("\n");
}

async function renderAskUser(
  input: Record<string, unknown>,
  resultText: string | undefined,
): Promise<void> {
  const questions = (input.questions as AskQuestion[] | undefined) ?? [];
  const answers = parseAskAnswers(resultText ?? "", questions);
  for (let i = 0; i < questions.length; i++) {
    if (i > 0) process.stdout.write("\n");
    await renderQuestionCard(questions[i], answers.get(questions[i].question));
  }
  if (answers.size > 0) {
    process.stdout.write("\n\n");
    process.stdout.write(renderAskUserSummary(questions, answers));
  }
}

// --- Streaming -------------------------------------------------------------

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

async function streamAnsi(
  ansi: string,
  perVisibleCharMs: number,
): Promise<void> {
  for (const chunk of streamChunks(ansi)) {
    process.stdout.write(chunk);
    const visible = chunk.replace(ANSI_RE, "").length;
    await sleep(Math.max(1, Math.round(visible * perVisibleCharMs)));
  }
}

async function runSpinner(verb: string, totalMs: number): Promise<void> {
  if (totalMs <= 0) return;
  const frameMs = 110;
  const start = Date.now();
  const tokensPerSec = 60 + Math.floor(Math.random() * 40);
  let i = 0;
  const draw = () => {
    const elapsedSec = (Date.now() - start) / 1000;
    const tokens = Math.floor(elapsedSec * tokensPerSec);
    const tokStr =
      tokens >= 1000 ? (tokens / 1000).toFixed(1) + "k" : tokens.toString();
    const glyph = BRAND(SPINNER_FRAMES[i % SPINNER_FRAMES.length]);
    const suffix = DIM(`(${elapsedSec.toFixed(0)}s · ↑ ${tokStr} tokens)`);
    process.stdout.write(`\r\x1b[2K${glyph} ${chalk.bold(verb)}… ${suffix}`);
    i++;
  };
  draw();
  const timer = setInterval(draw, frameMs);
  await sleep(totalMs);
  clearInterval(timer);
  process.stdout.write("\r\x1b[2K");
}

function pickVerb(): string {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
}

// --- Main loop with persistent input box -----------------------------------

function typingDelay(ch: string): number {
  const base = 32 + Math.random() * 40;
  if (ch === " ") return base + 20;
  if (/[.!?,;:]/.test(ch)) return base + 100;
  if (ch === "\n") return base + 120;
  return base;
}

export async function play(
  events: PlayEvent[],
  meta: SessionMeta,
  opts: RenderOptions,
): Promise<void> {
  const perChar = Math.max(1, Math.round(10000 / opts.wpm));
  const toolsOpt = opts.tools ?? {};
  const dimTools = toolsOpt.dim === true;
  const runThreshold = toolsOpt.runThreshold ?? 3;
  const runToolDelayMs = toolsOpt.runToolDelayMs ?? 80;
  const runSkipSpinner = toolsOpt.runSkipSpinner !== false;

  // Mark events that sit inside a run of ≥ runThreshold consecutive tools.
  const inToolRun = new Array<boolean>(events.length).fill(false);
  if (runThreshold > 0) {
    let i = 0;
    while (i < events.length) {
      let j = i;
      while (j < events.length && events[j].kind === "tool") j++;
      if (j - i >= runThreshold) {
        for (let k = i; k < j; k++) inToolRun[k] = true;
      }
      i = j === i ? i + 1 : j;
    }
  }

  let boxDrawn = false;
  let boxLines = 0;

  // Walk up N lines, clearing each as we go. Cursor ends at col 0 of the
  // topmost cleared line. After `drawBox` the cursor sits one line below the
  // last rendered line (trailing "\n"), so pass `boxLines` to land on the top
  // border row ready for a rewrite.
  const clearLinesAbove = (n: number) => {
    for (let k = 0; k < n; k++) {
      process.stdout.write("\x1b[1A\x1b[2K");
    }
    process.stdout.write("\r");
  };
  const drawBox = (typed = "") => {
    const lines = renderInputBoxLines(meta, typed);
    for (const l of lines) process.stdout.write(l + "\n");
    boxLines = lines.length;
    boxDrawn = true;
  };
  const clearBox = () => {
    if (!boxDrawn) return;
    clearLinesAbove(boxLines);
    boxDrawn = false;
    boxLines = 0;
  };
  const updatePrompt = (typed: string) => {
    if (!boxDrawn) return;
    // Re-render the whole box — height varies as text wraps onto new lines.
    clearLinesAbove(boxLines);
    const lines = renderInputBoxLines(meta, typed);
    for (const l of lines) process.stdout.write(l + "\n");
    boxLines = lines.length;
  };

  process.stdout.write(renderHeader(meta) + "\n\n");
  drawBox();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const prev = events[i - 1];
    const next = events[i + 1];

    if (e.kind === "notification") {
      clearBox();
      const icon = e.status === "completed" ? GREEN("✓") : DIM("•");
      process.stdout.write(
        "  " + DIM("⎿") + " " + icon + " " + DIM(e.summary) + "\n\n",
      );
      if (!next || next.kind === "user") drawBox();
      continue;
    }

    if (e.kind === "user") {
      if (!boxDrawn) drawBox();
      await sleep(350);
      let typed = "";
      for (const ch of e.text) {
        typed += ch;
        updatePrompt(typed);
        await sleep(typingDelay(ch));
      }
      await sleep(450); // pause after typing, before submit
      // Submit: clear the box, print transcript, redraw empty box.
      clearBox();
      process.stdout.write(renderUserTranscript(e.text) + "\n\n");
      drawBox();
      continue;
    }

    // Non-user: clear box, render content, maybe redraw box at end.
    clearBox();

    const chainedInRun =
      e.kind === "tool" &&
      prev?.kind === "tool" &&
      inToolRun[i] &&
      inToolRun[i - 1];

    if (prev?.kind === "user") {
      await runSpinner(pickVerb(), opts.thinkMs);
    } else if (prev?.kind === "tool" && !(chainedInRun && runSkipSpinner)) {
      await runSpinner(pickVerb(), Math.round(opts.thinkMs / 2));
    }

    if (e.kind === "assistant") {
      await streamAnsi(prefixAssistant(renderMarkdown(e.text)), perChar);
    } else if (e.name === "AskUserQuestion") {
      await renderAskUser(e.input, e.resultText);
    } else {
      process.stdout.write(renderTool(e.name, e.input, dimTools));
    }

    // Spacing, then only redraw box if the next event will want the box
    // (i.e. it's a user turn or this is the final event).
    process.stdout.write("\n\n");
    if (!next || next.kind === "user") {
      drawBox();
    } else if (next.kind === "tool" && e.kind === "tool") {
      // Chained tools: a touch of extra spacing already handled above.
    }
    const inRunGap =
      e.kind === "tool" &&
      next?.kind === "tool" &&
      inToolRun[i] &&
      inToolRun[i + 1];
    await sleep(inRunGap ? runToolDelayMs : opts.toolDelayMs);
  }

  if (!boxDrawn) drawBox();
}
