# Cap sut

Independent video creation platform with one shared core for three modes:

- Manual Editor for everyday creators
- AI Video Factory for prompt-to-editable-video workflows
- Rendering Engine + API/SDK for developers and companies

## Architecture

```
Manual Editor ─────┐
AI Video Factory ──┼──> Shared Project/Timeline Model ──> Render Engine
Developer API/SDK ┘
```

The AI factory and API must create the same editable project format used by the manual editor. Rendering is a shared capability, not a separate video pipeline.

## Repository layout

- `apps/web` — creator-facing manual editor
- `apps/api` — developer/company API boundary
- `crates/core` — canonical project/timeline model
- `crates/media` — media and FFmpeg integration boundary
- `crates/render` — render-plan and render-job engine
- `services/ai-video-factory` — AI-to-editable-project pipeline
- `packages/render-sdk` — typed developer SDK
- `docs/` — architecture and project-format contracts

## First real milestone

Import local media → multitrack timeline → trim/split → text/audio → preview → save/open project → real MP4 export.

## Engineering sources

OpenCut is the primary editor-engine reference. The owner's other repositories are treated as engineering references only; Cap sut remains an independent project and is not integrated into Alfaeq Yemen.

## Status

Foundation initialized. Production readiness is not claimed until the editor, renderer, recovery, security limits, and end-to-end tests are implemented and passing.
