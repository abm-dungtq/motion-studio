# Motion Studio

**English** · [Tiếng Việt](README.vi.md)

**The video editor where an AI director does the building and you make the calls.** Motion Studio is a web app that runs on your own machine. Start a project, drop in footage, brief the director in plain language, approve its choices on cards, trim the result on a CapCut-style timeline and export an MP4 or a layered project for Final Cut Pro, Premiere and DaVinci Resolve. After the first start you never need a terminal. The interface is in Vietnamese; this guide gives English glosses for its labels.

[![Release](https://img.shields.io/badge/release-v2.0.0-orange.svg)](https://github.com/abm-dungtq/motion-studio/releases/tag/v2.0.0)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-339933.svg)
![Runs locally](https://img.shields.io/badge/runs-127.0.0.1%20only-555.svg)
![Tests](https://img.shields.io/badge/tests-499%20passing-brightgreen.svg)

![Motion Studio: the director asks you to pick a direction while the timeline shows shots, voice, music and SFX](plans/261023-1018-react-ui-rewrite/screens/1440-director.jpg)

[Why Motion Studio](#why-motion-studio) · [Features](#features) · [Quick start](#quick-start) · [Timeline](#timeline) · [Export](#export-to-your-editor) · [For developers](#for-developers) · [Work with us](#work-with-us)

---

## Why Motion Studio

AI can now build whole videos, but most tools make you choose: a chat box that hands you a finished file you cannot fix, or a classic editor where the AI is a plug-in on the side. Motion Studio puts both in one window.

- **The director is your own Claude Code.** Studio runs the `claude` already signed in on your machine, with memory of the project. There is no extra AI subscription, and nothing leaves your computer except the calls made by your agent and by the services you approve.
- **You stay in charge.** When the director needs a decision, such as which of three looks to use or whether the animatic is good, it asks on a card and waits. Only you can approve a direction or a cut; the director cannot sign off its own work.
- **Every edit is a version.** Dragging a shot, retiming a line or moving a sound effect becomes one numbered version with undo and redo, whether you made it or the director did.
- **Private by design.** Studio listens on `127.0.0.1` only, rejects requests from other web pages, and never reads, prints or copies your API key files.

## Features

| | |
|---|---|
| **AI director** | Multi-turn chat with the director, approval cards for directions, animatics and scenes, suggestion cards that rank directions and styles from your brief, and a status chip showing whether `claude` is installed and signed in |
| **Timeline** | Shot, B-roll, Voice, Music and SFX tracks; ripple and roll trims; cut a shot at the playhead; snapping to shots, lines, beats and word starts; waveforms; mute and solo; editable beat and word markers; gate chips that tell you what still blocks export |
| **Look and motion** | 59 code-driven visual styles from lemo-opuscar in 11 families, applied to the whole project or one shot; a library of 54 transitions with live previews; four anime packs (impact frame, smear cut, ink wipe, speed lines); a clip fixer for trims, speed, freeze frames, LUTs and reframing |
| **Footage** | Browse your disk and register video, audio and images; a content-hashed B-roll index that finds shots by description in Vietnamese or English and places them with undo |
| **Reference library** | About 1,250 videos made with Claude Opus 5.5, 200 of them explained in Vietnamese, plus scene techniques, style recipes and professional prompt templates |
| **Series production** | Shared characters, voices, backgrounds and tools across episodes; asset boards to approve character sheets and backgrounds; batch image generation with self-checks; voice casting per character; rebuild and approve one scene without re-rendering the episode |
| **Delivery** | One-click MP4 export and compression, per-platform versions for YouTube, Facebook and TikTok, titles and descriptions with chapters, SRT captions, three thumbnail options, and upload to Google Drive after you consent |
| **Trust** | Consent cards before any job that spends credits (Codex, ElevenLabs, Drive), receipts with pass, warn or fail verdicts from nine quality checks, and a hand-off card when a step fails twice so you can paste the fix into Claude Code |
| **Open ends** | MCP tools for Claude Code, Codex, Antigravity and opencode; a provider contract; plug-in folders for routes, tabs, tools, quality checks and agent CLIs |

## Quick start

You need Node.js 22.18 or later, ffmpeg with ffprobe, and Claude Code (`claude`) signed in if you want the AI director.

```bash
git clone https://github.com/abm-dungtq/motion-studio ~/Projects/motion-studio
cd ~/Projects/motion-studio && npm run setup
node bin/motion-studio.mjs start --background
```

Open `http://127.0.0.1:4317`.

`npm run setup` builds the interface and checks the default provider, the [opus-video](https://github.com/abm-dungtq/opus-video) plugin, against its latest release on GitHub. If it is missing or out of date, Studio asks "Install/update opus-video to the latest version? [Y/n]". A git checkout is updated with `git pull --ff-only` and left alone if it has uncommitted changes or sits on another branch; anything else goes through the plugin's official installer, which backs up the old copy. Options: `--yes` (no prompt), `--ref <branch or tag>`, `--host claude|codex|all`.

```bash
node bin/motion-studio.mjs status                 # running <url> … | stopped
node bin/motion-studio.mjs stop                   # stop the server and every job
node bin/motion-studio.mjs start --background --root <folder that holds your projects>
```

Each project is a sub-folder with a `project.json`. The root folder comes from `--root`, then `MOTION_STUDIO_ROOT`, then the root of the previous run.

### Upgrading from 1.x

Version 2.0 rewrote the interface in React, TypeScript, Tailwind and shadcn/ui with a dark, NLE-style layout. Run `npm run setup` once after pulling. The `public/` folder is gone, so interface extensions now live in `ui/src/ext/<name>/index.ts` (see [docs/extensions.md](docs/extensions.md)). Node.js 22.18 or later is required.

## Timeline

Dragging previews in place; releasing sends one patch, which becomes one version.

- **SFX:** drag to move; right-click "Thêm SFX tại đây…" (Add SFX here) to pick a file from the project or `shared-assets/sfx/`. Delete removes only sound effects added in Studio; the director's own effects offer "Nhờ đạo diễn" (Ask the director).
- **Music:** drag the body to move, drag the edges to trim; the inspector sets volume, fade in and fade out. Fades are heard in the exported video only.
- **Cut a shot:** select it, put the playhead inside and press S. The new shot is empty and Studio offers "Nhờ đạo diễn dựng shot mới" (Ask the director to build it).
- **Snap** (N or the "Hít" button) to the playhead, shot edges, lines, SFX, beats and word starts.
- **M/S** on a track label mutes or solos it in the player only.
- **Gate chips** next to the Xuất bản (Publish) menu say "Cần duyệt lại animatic" (animatic needs re-approval) or "Chưa đủ cổng xuất" (export gates not met) and open the card or the list of failures.

### Keyboard shortcuts

Shortcuts are off while you type in a field, while a dialog or menu is open, or while focus is on the tab rail. Alt+1…9 picks a rail tab.

| Key | Action |
|---|---|
| Space | Play / pause |
| J / K / L | Back one second / pause / play |
| ← / → | Back / forward one frame |
| Shift+← / Shift+→ | Back / forward one second |
| Home / End | Start / end of the video |
| S | Cut the selected shot at the playhead |
| Delete / Backspace | Delete the selected SFX (Studio-added only) |
| N | Snap on / off |
| R | Shot edge mode: Ripple (the video gets longer or shorter) or Roll (only the cut moves) |
| Shift+drag a line | Move that line and the lines after it in the same shot |
| = or + / - | Zoom in / out |
| Shift+Z | Fit to view |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z, Ctrl+Y | Redo |

More in [docs/timeline.md](docs/timeline.md).

## Export to your editor

"Xuất bộ lớp dựng" (Export layer bundle) in the Xuất bản menu turns a project into layers you can keep cutting in CapCut, Final Cut Pro, Premiere or DaVinci Resolve:

```bash
node bundle.mjs --project <project folder> [--ratio 9x16] [--source <rendered mp4>] [--out <folder>]
```

The bundle in `renders/<project>-<time>[-<ratio>]-bundle/` holds:

- `shots/NN-<shot>.mp4`: each shot as H.264 CRF 12 without sound, cut to frame-accurate shot boundaries;
- `audio/mix.wav`, `voice.wav`, `music.wav`, `sfx.wav`: the full mix and stems at 48 kHz, as long as the video;
- `captions.srt`, split on word timings;
- `manifest.json` (schema `motion-studio/bundle@1`);
- `timeline.fcpxml` (Final Cut Pro, DaVinci Resolve), `timeline.xml` (Premiere, Resolve) and `timeline.otio` (OpenTimelineIO), with shots in order, stems on their own tracks and markers for lines and SFX. Details and limits: [docs/nle-export.md](docs/nle-export.md).

Transitions are baked into the shots they span, so keeping shot order and length joins them seamlessly.

## Reference library

The Library tab has four sections, searchable in Vietnamese with or without diacritics, or in English: sample videos, scene techniques, styles and prompt templates. You can browse and copy prompts without opening a project; inside a project, "Dùng cho dự án" (Use for this project) sends the sample to the director with its notes.

Cover images are not in the repository. Download them once (about 25 MB) to `~/.cache/motion-studio/library/thumbs`:

```bash
node scripts/library-thumbs.mjs
```

Sources, licences and how to rebuild the data are in [library/SOURCES.md](library/SOURCES.md).

## For developers

<details>
<summary><b>Extension points</b></summary>

Add a feature by adding a file, without touching `server.mjs` or the shell in `ui/src/shell/`:

- `routes/*.mjs`: HTTP routes. Studio's own routes are tried first; a clash stops Studio at start-up.
- `ui/src/ext/<name>/index.ts`: export `register(studio)` and call `registerTab`, `registerSection`, `registerInspectorSection`, `registerAgentRows` or `registerTimelineDecorator`.
- `lib/tools/*.mjs`: tools for the AI director and MCP clients.
- `lib/quality/*.mjs`: checks that run on every file Studio produces; results land in `<project>/.opus/receipts/`.
- `lib/agents/cli/*.mjs`: local agent CLIs (claude, codex, codex-pool, agy, gemini, cursor-agent, opencode) for writing, reading images and generating images.

Working examples: [docs/extensions.md](docs/extensions.md). Agents and fallback order: [docs/agents.md](docs/agents.md). MCP: [docs/mcp.md](docs/mcp.md). Receipts: [docs/receipts.md](docs/receipts.md). AI images and clips per shot through gflow-cli (Google Flow): [docs/videogen.md](docs/videogen.md).

</details>

<details>
<summary><b>Provider and compatibility</b></summary>

Everything Studio needs from outside goes through `lib/provider.mjs`: reading and validating `project.json`, the command gateway (patch, undo, redo, history), the director's request queue, tools and prompt text for `claude -p`, command paths (render, mix, pitch, import, demo, preflight, timing and more) and library files. The contract is documented at the top of that file.

Adapters live in `lib/providers/`, one file per provider shipped with Studio; Studio never loads code from outside the repository. Today there is `lib/providers/opus-video.mjs`. The provider loads lazily: if it is missing or incompatible, the server still runs, `GET /api/status` explains what is wrong, and routes that need it answer 503 with the reason. Installing the provider does not require a restart.

| Motion Studio | opus-video | `STUDIO_API` |
|---|---|---|
| 1.0.x | 2.1.0 up to, not including, 3.0 | 2 |
| 1.1.x | 2.3.0 up to, not including, 3.0 | 3 |
| 2.0.x | 2.3.0 up to, not including, 3.0 | 3 or 4 |

</details>

<details>
<summary><b>Environment variables</b></summary>

| Variable | Purpose |
|---|---|
| `MOTION_STUDIO_ROOT` | Folder that holds your projects |
| `MOTION_STUDIO_PORT` | Port (default 4317), for a test Studio beside the real one; pair it with its own `MOTION_STUDIO_STATE` |
| `MOTION_STUDIO_STATE` | State file (default `~/.config/motion-studio/studio.json`, chmod 600) |
| `MOTION_STUDIO_COMPRESS` | Compression command after export (default `<root>/scripts/compress-final.sh`) |
| `MOTION_STUDIO_PROVIDER` | Provider in `lib/providers/` |
| `MOTION_STUDIO_HOME` | Where the provider's shim looks for Studio |
| `MOTION_STUDIO_HF_RUNTIME`, `MOTION_STUDIO_HF_SKILLS` | HyperFrames runtime file for the player; HyperFrames skill folder (default `~/.claude/skills`) |
| `MOTION_STUDIO_AGENT_PATH` | Search path for agent CLIs; when set, Studio looks only there |
| `MOTION_STUDIO_GWS` | The `gws` binary used for Google Drive uploads |
| `MOTION_STUDIO_CACHE`, `MOTION_STUDIO_BROLL_CACHE`, `MOTION_STUDIO_LEMO_CACHE`, `MOTION_STUDIO_THUMBS` | Cache folders (default under `~/.cache/motion-studio/`) |
| `OPUS_VIDEO_HOME` | opus-video plugin folder (default provider only); when set, Studio uses only that folder |

The old names `OPUS_STUDIO_ROOT`, `OPUS_STUDIO_STATE`, `OPUS_COMPRESS_FINAL` and `OPUS_HF_RUNTIME` still work with a one-time warning, as does the legacy default root `/Volumes/2/Edit-Video`. Both are deprecated and will be removed in a future major release. `OPUS_STUDIO_RUNNER` and `OPUS_STUDIO_REQUEST` keep their names because they are the protocol with the plugin's MCP server.

</details>

<details>
<summary><b>Tests</b></summary>

```bash
npm test
```

Most tests need the default provider installed (set `OPUS_VIDEO_HOME` if the plugin lives elsewhere). `tests/no-provider.test.mjs` and `tests/config.test.mjs` run without it.

</details>

The full history is in [CHANGELOG.md](CHANGELOG.md).

## Work with us

Motion Studio is free and open source under the MIT license. If you want it set up for your team, a provider for your own pipeline, custom tabs or tools, or help producing videos with it, [open an issue](https://github.com/abm-dungtq/motion-studio/issues) or reach out through [@abm-dungtq](https://github.com/abm-dungtq) on GitHub.

## License

MIT, see `LICENSE`. The lemo-opuscar styles are MIT with images under CC BY 4.0 (credit LemoLab); library data sources and their licences are listed in [library/SOURCES.md](library/SOURCES.md).
