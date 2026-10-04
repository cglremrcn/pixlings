# Pixlings

A tiny pixel creature that lives above your Claude Code prompt. It counts down your prompt cache and asks before a model switch throws a warm one away, wakes Claude when your usage limit resets, brings a little helper for every subagent, makes sound and desktop notifications on Windows, macOS and Linux, yelps before risky shell commands, and rolls its eyes at "You're absolutely right".

Coming from the retired `/buddy`? `/pixling adopt` brings your companion back with its name, personality and days together, read locally from your Claude Code config.

## Install

```sh
claude plugin marketplace add cglremrcn/pixlings
claude plugin install pixlings@pixlings
```

Needs Claude Code 2.1.287 or newer. Start a new session and an egg hatches.

## Use

- `/pixling` shows its card; `/pixling help` lists every command.
- `/pixling room` opens its room, which works in the terminal, the desktop app, VS Code and the mobile app.
- Every setting is in `/config` under Pixlings.

Out of the box it never calls a model and adds nothing to Claude's prompt. AI quips (Claude Haiku, about a hundred tokens each, at most one a minute, cost shown) are off until you turn them on.

Full documentation: https://github.com/cglremrcn/pixlings
