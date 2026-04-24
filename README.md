# claude-code-player

Replay a Claude Code session as a demo-friendly TUI.

Reads a session JSONL from `~/.claude/projects/**` by session ID and re-emits
the essential conversation (user messages + assistant text + tool-call
indicators) with a typewriter effect — useful for recording demos of long
agent runs without sitting through hours of real-time.

## Usage

```sh
npm install
npm run build
./dist/cli.js <session-id>
```

Or during development:

```sh
npm run dev -- <session-id>
```

### Flags

- `--wpm <n>` — typing speed in words per minute (default 600)
- `--turn-delay <ms>` — pause between turns (default 800)
- `--tool-delay <ms>` — pause after a tool-call indicator (default 400)
