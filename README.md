# claude-code-player

Replay a Claude Code session as a demo-friendly TUI.

Point it at a session ID (or a config file) and it re-emits the conversation
with Claude Code's look — welcome box, typewriter streaming, thinking
spinner, tool-call indicators, AskUserQuestion flows, agent pill, the whole
thing. Built for recording demos of long agent runs without sitting through
hours of real time.

## Install

```sh
git clone <this repo>
cd claude-code-player
npm install
```

## Quick start

```sh
# Ad-hoc: replay a session by its UUID
npm run dev -- c5c2ab62-fa0d-4710-8d6d-eaa17cd22f8b

# Or point at a config file
npm run dev -- examples/demo.json
```

Sessions are read from `~/.claude/projects/**/<session-id>.jsonl`. You can
find recent session IDs by listing that directory.

## Tutorial: configure a demo

1. **Find the session you want to replay.** Look under
   `~/.claude/projects/<encoded-cwd>/`. Each file is named by its session ID.

2. **Copy the example config** to your local configs folder (gitignored):

   ```sh
   cp examples/demo.json configs/my-demo.json
   ```

3. **Edit the fields** to match your demo:

   ```jsonc
   {
     // Required — the session you want to replay
     "sessionId": "c5c2ab62-fa0d-4710-8d6d-eaa17cd22f8b",

     // Greeting name in the welcome box. Defaults to $USER.
     "user": "Pete",

     // Agent label shown in the bottom pill
     "agent": {
       "name": "my-agent",
       "color": "orange"     // or hex like "#d97757"
     },

     // Playback pacing
     "speed": {
       "wpm": 3500,          // typing speed (words/min)
       "turnDelayMs": 800,   // pause between turns
       "toolDelayMs": 400,   // pause after a tool indicator
       "thinkMs": 1400       // thinking-spinner duration (0 disables)
     },

     // Hide plumbing turns you don't want on screen
     "filters": {
       "excludeUser":      ["^skip$", "^continue$", "try again"],
       "excludeAssistant": ["^I apologize"],
       "excludeTools":     ["Bash"]
     }
   }
   ```

4. **Run it:**

   ```sh
   npm run dev -- configs/my-demo.json
   ```

5. **Record your terminal window.** QuickTime or any screen recorder works.
   The whole demo plays top-to-bottom in a single terminal buffer, so no
   post-editing is needed.

### Tweaking on the fly

Any CLI flag overrides the config without editing the file:

```sh
# Faster playback, skip the thinking pause
npm run dev -- configs/my-demo.json --wpm 6000 --think-ms 0

# Try a different agent color for the demo
npm run dev -- configs/my-demo.json --agent-color blue
```

## Config reference

All fields except `sessionId` are optional.

| Field | Type | Notes |
| --- | --- | --- |
| `sessionId` | string | Required. Claude Code session UUID. |
| `user` | string | Greeting name (`Welcome back <user>!`). Defaults to `$USER`. |
| `agent.name` | string | Label shown in the bottom pill. Defaults to whatever the session used. |
| `agent.color` | string | Hex (`#d97757`) or named: `orange`, `blue`, `green`, `purple`, `red`, `yellow`, `pink`, `teal`. |
| `speed.wpm` | number | Typing speed in words/min. Default 3500. |
| `speed.turnDelayMs` | number | Pause between turns. Default 800. |
| `speed.toolDelayMs` | number | Pause after a tool indicator. Default 400. |
| `speed.thinkMs` | number | Thinking-spinner duration. 0 disables. Default 1400. |
| `filters.excludeUser` | string[] | Case-insensitive regexes. Matching user messages are dropped. |
| `filters.excludeAssistant` | string[] | Same, for assistant text blocks. |
| `filters.excludeTools` | string[] | Tool names (exact match) to drop entirely. |

Inline `//` and `/* … */` comments are allowed in the JSON file.

## CLI flags

CLI flags override config values, which override defaults.

| Flag | Purpose | Default |
| --- | --- | --- |
| `--wpm <n>` | Typing speed (words/min) | 3500 |
| `--turn-delay <ms>` | Pause between turns | 800 |
| `--tool-delay <ms>` | Pause after a tool indicator | 400 |
| `--think-ms <ms>` | Thinking-spinner duration (0 disables) | 1400 |
| `--agent <name>` | Agent label (bottom pill) | from session |
| `--agent-color <c>` | Agent pill color | brand orange |
| `--user <name>` | Greeting name | `$USER` |

## Tips

- **Terminal width matters.** The two-column welcome box auto-sizes to your
  terminal. 110+ columns looks best.
- **Keep `FORCE_COLOR=3`** if you ever pipe output anywhere — the renderer
  relies heavily on 24-bit color.
- **The `configs/` directory is gitignored** — your personal configs won't
  leak into the repo. Drop as many as you like there.
- **Built-in filters** ship empty on purpose. Add `"^skip$"`, `"^continue$"`,
  `"try again"`, etc. to strip the plumbing turns you accumulated while the
  agent was actually running.
- **Want to hide a noisy tool?** Add it to `filters.excludeTools` (e.g.
  `["Bash"]`) to suppress every `● Bash(…)` line.

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
