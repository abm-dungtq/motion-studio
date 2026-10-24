---
title: Motion Studio upgrade for Song Lag episode 2
date: 2026-10-24
summary: 11 phases shipped across motion-studio and opus-video; Studio 4317 restarted on new build
---

# Motion Studio upgrade for Song Lag episode 2

## What happened
Executed plan plans/261024-1239-studio-series-tap-2 (11 phases + wide board view + two fix PRs) from the user-approved contract docs/motion-studio-nang-cap-tap-2.md in the Hoat hinh workspace. Merged motion-studio #23-#33 and opus-video #5-#10. Studio 4317 runs the new build (root /Volumes/2/Edit-Video, a-01/a-02 linked by symlink), plugin installed via npm run setup.

## Decisions
- Kept Studio root at Edit-Video and linked series episodes by symlink instead of switching root (switching would break compress-final, shared-assets and New Project). Required projectsOf symlink support and cwd realpath for the director (claude resolves cwd to the real path and rejected writes via the link).
- Series tools run only through declared tools in studio-series.json with typed flags, --flag=value argv, read/write allowlists; a follow-up PR closed positional path reads, in-project series dirs, and symlink targets.
- Director is denied eleven.mjs tts/audio-meta for series projects via --disallowedTools; sfx/music stay open.
- Final gate compares picture hash instead of mtime; voice-only changes give WARN (listen again), speaker changes FAIL because lip-sync changes the picture.

## Evidence
Real Codex batch for ba-noi cost 16 calls (8 draw, 8 vision) versus an estimate of 4; the consent card now shows the maximum. One Voice Design call produced 3 samples pending the user's pick. Final review found pixel-arcade-hd missing from the installed plugin, missing direction in the episode BRIEF, and a real email in a public code comment; all fixed in opus-video #10 and motion-studio #33.

## Next steps
User works through reports/viec-nguoi-dung-tap-2.md in Studio. Pending user decisions: self-check cost options (C'+D recommended), rewrite of main history for AI trailers in opus-video a1b7438/17745d0 and the email in motion-studio history.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
