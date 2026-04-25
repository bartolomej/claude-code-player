<img width="1355" height="433" alt="Screenshot 2026-04-24 at 19 52 04" src="https://github.com/user-attachments/assets/98a63537-c921-4ee8-b4b9-76266cc2600e" />


## Why this exists

Recording a compelling Claude Code demo is surprisingly hard when the agent
actually does real work:

- **Real sessions are long.** Long-horizon agent sessions can take hours. Screen-recording that in one-shot is difficult.
- **Editing is worse.** Trimming a terminal recording into a tight 60-second
  clip means cutting dead time, splicing streams, and hiding the ugly bits
  (credential prompts, permission approvals, long-running tools,...).
- **Re-running isn't an option.** You can't just "do the demo again" —
  agents are non-deterministic, the tool outputs differ, and the exact turn
  you nailed the first time is gone.
- **Mocking it looks fake.** Hand-crafted fake terminal recordings read as
  marketing. Viewers can tell.

## Install

```sh
git clone https://github.com/bartolomej/claude-code-player.git
cd claude-code-player
npm install
```

## Quick start

```sh
# Ad-hoc: replay a session by its UUID
npm run dev -- 00000000-0000-0000-0000-000000000000

# Or point at a config file
npm run dev -- examples/demo.json
```

Sessions are read from `~/.claude/projects/**/<session-id>.jsonl`. Copy
[`examples/demo.json`](./examples/demo.json) to `configs/my-demo.json`
(gitignored) and edit to taste.

## Config

All fields except `sessionId` are optional. Inline `//` and `/* … */`
comments are allowed. See [`examples/demo.json`](./examples/demo.json)
for a full example.

- **`sessionId`** — Claude Code session UUID (required).
- **`user`** — greeting name in the welcome box. Defaults to `$USER`.
- **`agent`** — `{ name, color }` for the bottom pill. Color accepts hex
  (`#d97757`) or a named preset (`orange`, `blue`, `green`, `purple`,
  `red`, `yellow`, `pink`, `teal`).
- **`speed`** — pacing knobs: `wpm` (typing speed), `turnDelayMs`,
  `toolDelayMs`, `thinkMs` (0 disables the thinking spinner).
- **`tools`** — tool-run styling: `dim` renders tool rows dimmed so they
  don't outshine messages; `runThreshold` (default 3) treats consecutive
  tool events as a "run" and speeds them up; `runToolDelayMs` (default
  80ms) overrides `toolDelayMs` within a run; `runSkipSpinner` (default
  true) skips the inter-tool spinner within a run.
- **`filters`** — drop plumbing turns. `excludeUser` and `excludeAssistant`
  take case-insensitive regexes; `excludeTools` takes exact tool names
  (e.g. `["Bash"]`).

## Tips

- **Terminal width matters.** The two-column welcome box auto-sizes to your
  terminal. 110+ columns looks best.
- **Keep `FORCE_COLOR=3`** if you ever pipe output anywhere — the renderer
  relies heavily on 24-bit color.
- **The `configs/` directory is gitignored** — your personal configs won't
  leak into the repo.

## What's supported

- Welcome box with model / agent / cwd / org
- Typewriter-style streaming in ANSI-safe chunks
- Markdown rendering: headings, bold/italic, inline code, lists, code
  blocks, tables
- Tool indicators with inline primary arg (`Bash(cmd)`, `Read(path)`, …)
- AskUserQuestion form cards with animated option selection
- Task-notification XML collapsed to a single `✓` notice
- Thinking spinner with rotating verb + fake token counter
- Persistent bottom input box with animated user typing / submit

## License

MIT. See [LICENSE](./LICENSE).
