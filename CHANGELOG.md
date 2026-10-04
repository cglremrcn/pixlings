# Changelog

## 0.3.0

### New

- **Bring back your Buddy.** `/pixling adopt` reads the companion Claude Code's retired `/buddy` left in `~/.claude.json` and adopts its name, personality and hatch date (the days together count from it). Only those three fields are kept; nothing is sent anywhere. `/pixling adopt <species>` changes its body too. `/buddy`, `/buddy pet`, `/buddy off` and `/buddy on` work as aliases.
- **Personalities.** Every pixling hatches with a one-line personality, written from templates (no model call). Old saves get one too, the same every session.
- **Six new species:** capybara, turtle, snail, penguin, goose and rabbit, fifteen in all. Each tier is now rarer than the one below it.
- **The subagent squad.** Every subagent Claude starts gets a small helper beside the pixling, tinted by agent type and carrying that agent's tools. When it finishes it jumps for joy and goes.
- **The cache guard.** Before a `/model` switch throws away a warm prompt cache that would cost more than about $0.25 to write again on the new model, the pixling asks (`cacheGuard`, on by default; never in headless or SDK runs).
- **A model switch names the cache lifetime.** The countdown stops guessing after a `/model` switch.
- **More reactions.** Squished under a press during compaction and springing back after; sweating once the context passes 85%; a thinking cap in plan mode.
- **More vitals.** How much of a rate-limit window the last turn used (`turn +2%`), and the model and effort (`opus 5.5 · high`).
- **The room.** `/pixling room` opens a pane with the pixling, its stats, a garden of the species found and a badge shelf. It works in the terminal, the desktop app, VS Code and the mobile app, so the pixling is no longer terminal- and desktop-only.
- **A hover card.** Hover over the band for the personality, streak, badges, days together and the tics it has heard.
- **Away mode.** `/pixling off` sends it away (no band, sound, voice, notifications or auto-continue; stats still count) until `/pixling on`, across sessions.
- **AI quips, opt-in.** With `quips: haiku`, red tests, API errors, big edits and saying its name now and then get a one-liner from Claude Haiku: at most one a minute, about a hundred tokens each, the cost shown beside the line. The request holds the pixling's name, species, personality and what happened in numbers, never code, prompts or files. Off by default.
- **Heckle, opt-in.** With `heckle` on, a faint `(¬_¬) #N` appears under Claude's "You're absolutely right". Only the drawing changes; the conversation is untouched.

### Fixed

- After `/clear` or a resume, a nap no longer sends "continue" into the new conversation; a nap older than six hours announces the reset instead of continuing, and retries without a reset time are quiet and stop after three.
- Two sessions open at once no longer overwrite each other's save; their changes are merged.
- Typing free text into the release dialog no longer releases the pixling; only the exact choice does.
- A save that can't be read is backed up and never overwritten; the session runs on a stand-in.
- `claude -p` and SDK runs hatch no egg and make no sound, voice or notification.
- Risky commands are read the way a shell reads them: quoted text, heredocs and commit messages no longer trigger the alarm, and spellings like `rm -Rf`, `rm -r --force` and `DELETE FROM schema.table` are caught. A commit that is only mentioned (`echo "git commit"`) no longer counts, and a line that commits and then tests counts both.
- The hour-long cache lifetime is learned only from two near-full hits after long pauses, unlearned by a full miss, and expires from the save after two weeks.
- The cache warning fires even when the band or the vitals are off.
- "Apologies for the confusion" is heard; "a good point to add logging" is not praise.
- A message from Remote Control cancels the nap's auto-continue, as typing does.
- The weekly limit's reset shows its day.
- The band folds into one line when it would be taller than the space it is given.
- Windows: PowerShell no longer asks to bypass the execution policy, and speech reads UTF-8.

### Changed

- Badges, the streak and the tic counts now stay when you hatch a new egg.
- The README no longer claims the band shows in VS Code: it shows in the terminal and the desktop app; the room shows everywhere.

## 0.2.0

The vitals row (prompt cache countdown and hit rate, context, rate-limit windows), the cache warning and cold-start count, tics and the eye roll, 16 badges, the daily streak and morning recap, `/pixling share` trading cards, roaming, and the animalese voice.

## 0.1.0

The first egg: nine species, moods and reactions, cross-platform sound and notifications, the rate-limit nap with auto-continue, levels and wearables.
