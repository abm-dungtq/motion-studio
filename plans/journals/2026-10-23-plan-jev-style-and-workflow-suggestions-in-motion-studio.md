---
title: "Plan: Jev style and workflow suggestions in Motion Studio"
date: 2026-10-23
summary: Brainstorm and 8-phase advice plan for a style_suggest tool backed by TypeSafe Jev with deterministic fallback
---

# Plan: Jev style and workflow suggestions in Motion Studio

## What happened
Brainstormed integrating TypeSafe Jev (typesafe-ai/skills) into Motion Studio so the director suggests direction A1–A8, style profile and operating mode. The opus-video plugin already ships jev-client.mjs, rerank-composite.mjs and 64 style profiles plus 8 directions, and the TypeSafe key already lives in the plugin env file.

## Decision
Chose a reduced variant of option A. Studio only ranks candidates that code has already filtered (8 directions, then 6–12 suggested styles, then one Choice over 4 modes). The result goes through the existing direction gate (make-pitch choose --style-profile), with no new BRIEF.md write path. With only 14 labelled samples, an offline gate would mean little. The suggestion card therefore runs in observe mode, showing Jev and deterministic picks side by side, and logs real user picks to .opus/suggest/picks.jsonl. After 30 picks, suggest-eval.mjs applies the 10-point hit@3 rule. The upstream PR adds COMMANDS.suggest, make-pitch init --directions and a set_workflow_mode gateway op. Studio detects these through provider keys, never through version checks, and STUDIO_API stays at 4.

## Next steps
Run /ak:cook --advice on plans/261023-1529-jev-style-suggest/plan.md. Phase 7, the upstream PR, runs in parallel.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
