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
- `integrations/sources.json` — pinned open-source project integration manifest
- `docs/integrations/OPEN_SOURCE_COMPONENTS.md` — integration boundaries and license obligations
- `packages/render-sdk` — typed developer SDK
- `docs/` — architecture and project-format contracts

## First real milestone

Import local media → multitrack timeline → trim/split → text/audio → preview → save/open project → real MP4 export.

## Engineering sources

OpenCut is the primary editor-engine reference. The owner's other repositories are treated as engineering references only; Cap sut remains an independent project and is not integrated into Alfaeq Yemen.

## AI generation status

- Text-to-video: asynchronous fal.ai Wan 2.7 queue integration is implemented in the Cloudflare Worker.
- Image-to-video: the same authenticated endpoint accepts a JPG/PNG/WEBP/BMP upload (up to 20 MB) and submits it to fal.ai Wan 2.7 image-to-video.
- Generated videos are downloaded server-side into the user's private R2 library; the browser never receives `FAL_KEY`.
- Both modes require the Cloudflare D1/R2 bindings and a configured fal API key. fal inference is paid; free/open-source code does not make GPU generation free.

## Status

The AI text-to-video and image-to-video request paths are implemented in source, but production operation is not claimed until Cloudflare resources and secrets are configured, migrations are applied, the Worker is deployed, and authenticated end-to-end generation tests pass. The full manual editor and native render engine also remain subject to their own implementation and test gates.
