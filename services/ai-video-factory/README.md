# AI Video Factory

Pipeline: brief -> script/storyboard -> assets -> voice/captions -> project/timeline -> validation -> shared renderer.

AI providers are adapters. Provider credentials stay server-side. Generated assets may carry provenance/licensing metadata. Expensive operations need explicit limits and observable jobs.

The output is a normal Cap sut project that can be opened and edited manually.

## Text-to-image and text-to-video HTTP contract

The web editor exposes a provider-neutral creation panel. The secure provider service must implement:
- `POST /v1/generations/images`
- `POST /v1/generations/videos`

Requests include `prompt`, `aspect_ratio`, and for video `duration_seconds`. The Cap sut web interface offers video durations from **10 seconds minimum to 480 seconds (8 minutes) maximum**. The provider adapter must validate this range and must reject unsupported durations clearly; actual maximum duration, generation time, and cost remain subject to the selected provider's limits. Return a JSON result URL or a queued job ID. See `services/ai-video-factory/README.md` for the full contract and security requirements.

Do not place provider API keys in browser code or local storage. Deploy a server-side provider adapter with authentication, quotas, moderation, restricted CORS, and controlled media storage before enabling public generation.

The current UI is wired to this contract, but no AI provider is deployed or configured yet. The existing browser slideshow tool is not AI text-to-video.
