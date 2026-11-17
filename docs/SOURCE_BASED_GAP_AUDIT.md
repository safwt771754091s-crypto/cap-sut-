# Cap sut — Source-Based Engineering Gap Audit

Audit basis: current `main` source files inspected on 2026-11-17. This is a source review, not a penetration test or runtime certification.

## Verified current behavior

### Web editor
- `apps/web/src/app.js` implements a browser editor with media import, a video preview, one visible video track, clip selection, trim fields, split, project save/open, and export submission.
- Imported browser media uses object URLs. Video files are uploaded to `POST /v1/assets`; the returned server URI is stored in the project.
- The editor UI labels itself as an initial studio version.
- `apps/web/src/ai-creation.js` exposes text-to-image and text-to-video panels, but image generation is explicitly not implemented by the current Golpo adapter. The video flow uses a provider endpoint and polls a job status endpoint.
- The AI creation UI offers 15s, 30s, 60s, 120s, 240s, and 480s choices and explicitly describes the limit in Golpo terms.
- `apps/web/src/photo-video.js` creates a slideshow locally in the browser and documents that the browser output is usually WebM; MP4 is not guaranteed there.

### API and renderer
- `apps/api/src/main.rs` exposes `GET /health`, `POST /v1/assets`, `POST /v1/renders`, and a render download endpoint.
- The API uses `CorsLayer::permissive()`.
- The API accepts multipart uploads under a 512 MiB global request-body limit, stores uploaded bytes on disk, and does not show user authentication, per-user quotas, content inspection, or retention cleanup in this source file.
- `POST /v1/renders` executes FFmpeg in a blocking task and returns only after rendering finishes. It does not persist a queued job record or expose status/progress/cancellation.
- `crates/render/src/lib.rs` validates that the initial renderer receives exactly one video clip. It builds an FFmpeg argument vector (not a shell command) and verifies that a non-empty output file exists.
- `apps/api/README.md` confirms that the API is synchronous by design and says a persistent asynchronous queue/status store is deferred.

### AI provider
- `services/ai-video-factory/golpo-server.mjs` is a Golpo-specific adapter requiring server environment secrets. It is not a generic provider runtime.
- The adapter checks a shared bearer token and optional exact allowed origin, but its shared-token model is not suitable as the final multi-user public authorization system.
- The current adapter's output status contract and the browser polling logic need a documented provider-neutral contract before adding alternate providers.

## Release-blocking gaps

| Priority | Gap | Why it blocks public launch | Required work |
|---|---|---|---|
| P0 | Permissive API CORS | Any origin can attempt browser calls | Exact origin allowlist, preflight tests |
| P0 | No user authentication/authorization in API | Uploaded assets and render operations are not tenant-isolated | Auth middleware, ownership checks, scoped downloads |
| P0 | No durable async render jobs | Long renders can tie up requests and lose state on restart | Persistent queue, job state machine, worker process |
| P0 | Upload validation and quotas are incomplete | Large or malicious uploads can exhaust storage/CPU | File type sniffing, limits per user, rate limits, cleanup |
| P1 | Single-video-clip renderer | Cannot yet render a full multitrack timeline | Track/clip composition, audio mixing, overlays, transitions |
| P1 | Provider coupling in UI | Replacing Golpo is not yet clean | Provider-neutral capabilities and job contracts |
| P1 | Image generation has no connected provider | UI cannot fulfill text-to-image | Separate image-provider adapter and tests |
| P1 | Browser-local slideshow exports WebM | Not a reliable MP4 delivery path | Submit slideshow project to shared server renderer |
| P1 | No durable asset storage abstraction | Local filesystem paths are unsuitable for horizontally scaled workers | Object storage interface and signed URLs |
| P2 | SDK contract is planned only | External developers cannot rely on a stable typed API | Versioned OpenAPI and SDK tests |

## Mandatory architecture contracts

### Generation provider contract
Each provider adapter must implement capability discovery and:
- `createImage(input, context) -> accepted job`
- `createVideo(input, context) -> accepted job`
- `getJob(providerJobId, context) -> normalized status`
- `cancelJob(providerJobId, context) -> result` (when provider supports cancellation)
- `health() -> readiness and supported capabilities`

Normalized job states: `queued`, `preparing`, `running`, `finalizing`, `completed`, `failed`, `cancelled`, `expired`.

Every provider response must be normalized; the browser must not contain provider-specific polling assumptions or secrets.

### Render job contract
The public API should return `202 Accepted` with an opaque `job_id`, then provide:
- `GET /v1/jobs/{job_id}` for state and progress
- `POST /v1/jobs/{job_id}/cancel` where cancellation is supported
- `GET /v1/jobs/{job_id}/artifact` using authenticated or short-lived signed access

Persist ownership, idempotency key, timestamps, stage, progress, project version, worker lease, artifact metadata, and sanitized error code. Never persist secrets in project JSON.

## Security acceptance gates
- No permissive production CORS.
- Every write and artifact read is authenticated and ownership-checked.
- File content is validated by signature/type, not extension alone.
- Per-user storage, duration, concurrency, and request quotas exist.
- Provider credentials exist only in server-side secret storage.
- Logs redact bearer tokens, prompts where configured sensitive, and signed URLs.
- Worker tasks have timeouts, bounded retries, cancellation semantics, and cleanup.
- CI includes API auth, CORS, upload validation, job lifecycle, and artifact access tests.

## Next implementation sequence
1. Introduce provider-neutral API contract and capability discovery; keep Golpo disabled by default.
2. Harden the API boundary before exposing it publicly.
3. Add persistent asynchronous job storage and a separate worker.
4. Expand the renderer from one video clip to multiple video/audio/image/text tracks.
5. Route browser slideshow output through the shared MP4 renderer.
6. Add HyperFrames as an isolated deterministic composition adapter and test output parity.
7. Deploy a GPU worker only after the exact model code/weights license and hardware profile are verified.

## Explicit non-claims
This audit does not certify production security, does not prove any AI provider is currently connected, and does not establish that free GPU capacity is available. Open-source model weights do not make GPU inference free.
