import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked(
  markedTerminal({
    reflowText: false,
    tab: 2,
  }) as unknown as ConstructorParameters<typeof Marked>[0],
);

export function renderMarkdown(text: string): string {
  const out = marked.parse(text, { async: false }) as string;
  // marked-terminal appends trailing newlines; trim just that to keep spacing tight.
  return out.replace(/\n+$/, "");
}
