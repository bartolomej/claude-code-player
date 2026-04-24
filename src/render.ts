import chalk from "chalk";
import { homedir } from "node:os";
import type { PlayEvent, SessionMeta } from "./events.js";
import { renderMarkdown } from "./markdown.js";

export interface RenderOptions {
  wpm: number;
  turnDelayMs: number;
  toolDelayMs: number;
  thinkMs: number;
}

// Claude Code-ish palette.
const GREEN = chalk.hex("#5fa561"); // muted forest green
const DIM = chalk.dim;
const SPRITE = chalk.hex("#a97bd6"); // muted purple for the ✻
const BRAND = chalk.hex("#d97757"); // Claude brand orange

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

const ROBOT = [
  " ▟▀▀▀▀▀▙ ",
  " ▌ ◉ ◉ ▐ ",
  " ▌  ─  ▐ ",
  " ▜▄▄▄▄▄▛ ",
];

export function renderHeader(meta: SessionMeta): string {
  const width = Math.min(termWidth(), 90);
  const version = meta.version ? `v${meta.version}` : "";
  const title = ` Claude Code${version ? " " + version : ""} `;
  const model = friendlyModel(meta.model);
  const cwd = tildePath(meta.cwd);

  const top = "╭─" + title + "─".repeat(Math.max(1, width - title.length - 3)) + "╮";
  const bottom = "╰" + "─".repeat(width - 2) + "╯";

  const robotW = ROBOT[0].length;
  const infoLines: string[] = ["", "Welcome back!", ""];
  if (model) infoLines.push(`${model} · Claude API`);
  const locParts: string[] = [];
  if (meta.agent) locParts.push(`@${meta.agent}`);
  if (cwd) locParts.push(cwd);
  if (locParts.length) infoLines.push(locParts.join(" · "));
  infoLines.push("");

  // Pad robot and info to equal height.
  const rows = Math.max(ROBOT.length, infoLines.length);
  const paddedRobot = [...ROBOT];
  while (paddedRobot.length < rows) paddedRobot.push(" ".repeat(robotW));
  const paddedInfo = [...infoLines];
  while (paddedInfo.length < rows) paddedInfo.push("");
  // Top/bottom pad by one blank row inside the box.
  paddedRobot.unshift(" ".repeat(robotW));
  paddedRobot.push(" ".repeat(robotW));
  paddedInfo.unshift("");
  paddedInfo.push("");

  const infoW = width - 2 - robotW - 3; // box sides + robot + " | "
  const body = paddedRobot
    .map((r, i) => {
      const info = (paddedInfo[i] ?? "").padEnd(infoW, " ").slice(0, infoW);
      const infoStyled = i === 2 && info.trim() === "Welcome back!"
        ? chalk.bold(info.trimEnd()) + " ".repeat(info.length - info.trimEnd().length)
        : DIM(info);
      return "│" + BRAND(r) + " " + infoStyled + " │";
    })
    .join("\n");

  return [chalk.dim(top), body, chalk.dim(bottom)].join("\n");
}

function renderInputBar(meta: SessionMeta): string {
  const width = termWidth();
  const agentTag = meta.agent ? ` ${meta.agent} ` : "";
  const leftDash = "─".repeat(Math.max(1, width - agentTag.length - 1));
  const divider = DIM(leftDash) + (agentTag ? chalk.bgHex("#d97757").black(agentTag) : "");

  const prompt = DIM("›") + " " + chalk.inverse(" ");
  const left = DIM("? for shortcuts");
  const right = DIM("◐ medium · /effort");
  const gap = " ".repeat(Math.max(2, width - left.length - right.length));
  const status = left + gap + right;

  return ["", divider, "", prompt, "", status].join("\n");
}

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

function renderUser(text: string): string {
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

function renderTool(name: string, input: Record<string, unknown>): string {
  const width = termWidth();
  const rawArgs = formatToolArgs(name, input);
  const argsMax = Math.max(20, width - name.length - 6);
  const args = rawArgs ? truncate(rawArgs, argsMax) : "";
  const head = GREEN("●") + " " + chalk.bold(name);
  return args ? head + DIM("(") + args + DIM(")") : head;
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

function parseAskAnswers(resultText: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /"([^"]+)"="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(resultText))) {
    map.set(m[1], m[2]);
  }
  return map;
}

function selectedIndices(options: AskOption[], answer: string | undefined): number[] {
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
  const BAR = DIM("│");
  const out = process.stdout;

  // Header + question.
  if (q.header) out.write(BAR + " " + chalk.bold(q.header) + "\n");
  out.write(BAR + " " + q.question + "\n");
  out.write(BAR + "\n");

  // Options — remember marker-line offsets (0-based from first option line).
  const markerOffsets: number[] = [];
  let linesBelow = 0;
  for (const opt of q.options) {
    markerOffsets.push(linesBelow);
    out.write(BAR + "   " + DIM("○") + " " + opt.label + "\n");
    linesBelow++;
    if (opt.description) {
      const desc = truncate(opt.description, Math.max(20, width - 8));
      out.write(BAR + "     " + DIM(desc) + "\n");
      linesBelow++;
    }
  }

  await sleep(550);

  const selected = selectedIndices(q.options, answer);
  for (const idx of selected) {
    const offset = markerOffsets[idx];
    const upBy = linesBelow - offset;
    // Move up, clear line, rewrite with filled marker, return.
    out.write(`\x1b[${upBy}A\r\x1b[2K`);
    out.write(BAR + "   " + GREEN("●") + " " + chalk.bold(q.options[idx].label));
    out.write(`\x1b[${upBy}B\r`);
    await sleep(220);
  }
  await sleep(300);
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
  const answers = parseAskAnswers(resultText ?? "");
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

async function runSpinner(verb: string, totalMs: number): Promise<void> {
  if (totalMs <= 0) return;
  const frameMs = 110;
  const start = Date.now();
  // Fake token counter that grows while "thinking" — pure demo flavor.
  const tokensPerSec = 60 + Math.floor(Math.random() * 40);
  let i = 0;
  const draw = () => {
    const elapsedSec = (Date.now() - start) / 1000;
    const tokens = Math.floor(elapsedSec * tokensPerSec);
    const tokStr =
      tokens >= 1000
        ? (tokens / 1000).toFixed(1) + "k"
        : tokens.toString();
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

async function streamAnsi(ansi: string, perVisibleCharMs: number): Promise<void> {
  for (const chunk of streamChunks(ansi)) {
    process.stdout.write(chunk);
    const visible = chunk.replace(ANSI_RE, "").length;
    await sleep(Math.max(1, Math.round(visible * perVisibleCharMs)));
  }
}

// --- Main loop -------------------------------------------------------------

export async function play(
  events: PlayEvent[],
  meta: SessionMeta,
  opts: RenderOptions,
): Promise<void> {
  const perChar = Math.max(1, Math.round(10000 / opts.wpm));

  process.stdout.write(renderHeader(meta) + "\n");

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
      continue;
    }

    // Spinner before model output: full on a fresh turn, shorter after a tool.
    if (prev?.kind === "user") {
      await runSpinner(pickVerb(), opts.thinkMs);
    } else if (prev?.kind === "tool") {
      await runSpinner(pickVerb(), Math.round(opts.thinkMs / 2));
    }

    if (e.kind === "assistant") {
      const body = renderMarkdown(e.text);
      await streamAnsi(prefixAssistant(body), perChar);
      await sleep(opts.turnDelayMs);
    } else if (e.name === "AskUserQuestion") {
      await renderAskUser(e.input, e.resultText);
      await sleep(opts.turnDelayMs);
    } else {
      process.stdout.write(renderTool(e.name, e.input));
      await sleep(opts.toolDelayMs);
    }
  }
  process.stdout.write("\n\n");
  process.stdout.write(renderInputBar(meta) + "\n");
}
