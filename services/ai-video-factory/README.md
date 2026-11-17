# AI Video Factory

Pipeline: brief -> script/storyboard -> assets -> voice/captions -> project/timeline -> validation -> shared renderer.

AI providers are adapters. Provider credentials stay server-side. Generated assets may carry provenance/licensing metadata. Expensive operations need explicit limits and observable jobs.

The output is a normal Cap sut project that can be opened and edited manually.

## Text-to-image and text-to-video HTTP contract

The web editor exposes a provider-neutral creation panel. The secure provider service must implement:
- `POST /v1/generations/images`
- `POST /v1/generations/videos`

Requests include `prompt`, `aspect_ratio`, and for video `duration_seconds`. The Cap sut web interface offers video durations from **15 seconds minimum to 480 seconds (8 minutes) maximum for Golpo**. The provider adapter must validate this range and must reject unsupported durations clearly; actual maximum duration, generation time, and cost remain subject to the selected provider's limits. Return a JSON result URL or a queued job ID. See `services/ai-video-factory/README.md` for the full contract and security requirements.

Do not place provider API keys in browser code or local storage. Deploy a server-side provider adapter with authentication, quotas, moderation, restricted CORS, and controlled media storage before enabling public generation.

The Golpo server adapter is now included in this repository, and the editor can submit and poll long-form Golpo video jobs. It is not live until the adapter is deployed with a valid Golpo API plan/key and server access settings. The existing browser slideshow tool remains separate from AI text-to-video.


## Golpo long-form provider adapter

Cap sut includes a Node.js 20+ server adapter in `golpo-server.mjs` for Golpo API v2.

- `POST /v1/generations/videos` accepts `prompt`, `aspect_ratio`, and `duration_seconds`.
- `GET /v1/generations/videos/:job_id` polls the provider and returns the completed MP4 URL.
- Supported durations in this adapter: 15 seconds, 30 seconds, 1 minute, 2 minutes, 4 minutes, and 8 minutes.
- 10-second generation is not offered by Golpo; its shortest documented timing is 15 seconds.
- Golpo's API uses the `x-api-key` header. The provider key is read only from server environment variables.

Required server environment:
- `GOLPO_API_BASE_URL` — the API base URL issued by Golpo when creating an API key.
- `GOLPO_API_KEY` — Golpo API key; never expose it to the browser.
- `CAPSUT_GENERATION_TOKEN` — private bearer token protecting the adapter.
- `CAPSUT_ALLOWED_ORIGIN` — exact deployed Cap sut editor origin.
- `PORT` — hosting platform port (default 8090).

Run with `node golpo-server.mjs` from this directory. Use HTTPS in production. Do not expose this shared-token adapter as a public multi-user service until it is replaced or fronted by per-user authentication, quotas, abuse controls, and persistent job records.

**Commercial/API access note:** Golpo's published API-only tier currently lists a USD $200 minimum entry and describes up to 10-minute long videos; actual availability depends on the account plan and the API base URL/key issued to that account. The Cap sut adapter intentionally caps requests at 8 minutes. See https://video.golpoai.com/api-docs/endpoints/v2 and https://video.golpoai.com/pricing.
