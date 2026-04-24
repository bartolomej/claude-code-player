import chalk from "chalk";
import { marked } from "marked";

type Token = {
  type: string;
  text?: string;
  tokens?: Token[];
  items?: Token[];
  ordered?: boolean;
  start?: number | "";
  depth?: number;
  raw?: string;
  lang?: string;
  href?: string;
  header?: { tokens?: Token[] }[];
  rows?: { tokens?: Token[] }[][];
  align?: ("left" | "center" | "right" | null)[];
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}
function padRightVis(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - visibleLen(s)));
}

function renderInline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(renderInlineToken).join("");
}

function renderInlineToken(t: Token): string {
  switch (t.type) {
    case "text":
      // marked gives inline text blocks nested tokens for emphasis etc.
      if (t.tokens && t.tokens.length) return renderInline(t.tokens);
      return t.text ?? "";
    case "strong":
      return chalk.bold(renderInline(t.tokens));
    case "em":
      return chalk.italic(renderInline(t.tokens));
    case "codespan":
      return chalk.yellow(t.text ?? "");
    case "del":
      return chalk.strikethrough(renderInline(t.tokens));
    case "link":
      return chalk.cyan.underline(renderInline(t.tokens));
    case "br":
      return "\n";
    case "escape":
      return t.text ?? "";
    case "html":
      return t.raw ?? "";
    default:
      return t.raw ?? t.text ?? "";
  }
}

function indent(s: string, pad: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

function renderList(list: Token): string {
  const items = list.items ?? [];
  const ordered = !!list.ordered;
  const startRaw = typeof list.start === "number" ? list.start : 1;
  const lines: string[] = [];
  items.forEach((item, i) => {
    const marker = ordered ? `${startRaw + i}.` : "-";
    const inner = renderBlocks(item.tokens ?? []).replace(/\n+$/, "");
    const firstLinePrefix = `  ${marker} `;
    const restPrefix = " ".repeat(firstLinePrefix.length);
    const [first, ...rest] = inner.split("\n");
    lines.push(firstLinePrefix + (first ?? ""));
    for (const r of rest) lines.push(r.length ? restPrefix + r : r);
  });
  return lines.join("\n") + "\n";
}

function renderBlock(t: Token): string {
  switch (t.type) {
    case "heading":
      return chalk.bold(renderInline(t.tokens)) + "\n\n";
    case "paragraph":
      return renderInline(t.tokens) + "\n\n";
    case "space":
      return "";
    case "code": {
      const body = (t.text ?? "").replace(/\n$/, "");
      return indent(chalk.dim(body), "  ") + "\n\n";
    }
    case "blockquote":
      return indent(chalk.gray(renderBlocks(t.tokens ?? [])), "  ");
    case "list":
      return renderList(t) + "\n";
    case "table":
      return renderTable(t) + "\n";
    case "hr":
      return chalk.gray("─".repeat(40)) + "\n\n";
    case "html":
      return (t.raw ?? "") + "\n";
    case "text":
      // Loose list item body sometimes lands here.
      if (t.tokens && t.tokens.length) return renderInline(t.tokens) + "\n";
      return (t.text ?? "") + "\n";
    default:
      return t.raw ?? "";
  }
}

function renderBlocks(tokens: Token[]): string {
  return tokens.map(renderBlock).join("");
}

function renderTable(t: Token): string {
  const header = (t.header ?? []).map((c) => renderInline(c.tokens));
  const rows = (t.rows ?? []).map((r) => r.map((c) => renderInline(c.tokens)));
  const numCols = Math.max(header.length, ...rows.map((r) => r.length));
  const widths: number[] = [];
  for (let c = 0; c < numCols; c++) {
    let w = visibleLen(header[c] ?? "");
    for (const r of rows) w = Math.max(w, visibleLen(r[c] ?? ""));
    widths.push(w);
  }
  const top = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const sep = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const bot = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";
  const renderRow = (cells: string[], bold = false) =>
    "│ " +
    cells
      .map((c, i) => {
        const v = c ?? "";
        const padded = padRightVis(v, widths[i]);
        return bold ? chalk.bold(padded) : padded;
      })
      .join(" │ ") +
    " │";
  const lines: string[] = [];
  lines.push(chalk.dim(top));
  lines.push(renderRow(header, true));
  lines.push(chalk.dim(sep));
  for (const r of rows) lines.push(renderRow(r));
  lines.push(chalk.dim(bot));
  return lines.join("\n");
}

export function renderMarkdown(md: string): string {
  const tokens = marked.lexer(md) as Token[];
  return renderBlocks(tokens).replace(/\n+$/, "");
}
