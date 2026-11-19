# Cap sut Edge API

Cloudflare Worker control-plane API. The current implementation provides health, email/password registration, login, logout, and the authenticated profile endpoint.

## Initial account behavior

- Email and password are required.
- Accounts become active immediately; email verification is intentionally deferred.
- Passwords are stored as PBKDF2-SHA-256 hashes with per-account random salts.
- Session tokens are random, stored only as SHA-256 digests, and delivered in Secure, HttpOnly, SameSite=None cookies.
- Registration and login have D1-backed attempt counters.
- Configure exact browser origins with `ALLOWED_ORIGINS`.

## Provisioning

1. Create a Cloudflare D1 database named `capsut-production`.
2. Replace the placeholder `database_id` in `wrangler.toml` with the real D1 database ID.
3. From this directory, apply migrations with `npx wrangler d1 migrations apply capsut-production`.
4. Run `npm install` and `npm run check`.
5. Deploy with `npx wrangler deploy` only after the database binding and allowed origins are reviewed.

Do not commit real Cloudflare identifiers, API tokens, passwords, or secrets. The Worker is not deployed by this repository change.

## Image generation API

The Worker can call Cloudflare Workers AI through the native `AI` binding:

- `POST /v1/generate/image`
- Requires an authenticated Cap sut session cookie.
- JSON body: `{"prompt":"..."}`
- Returns a JPEG image response (not a chat completion).
- Model: `@cf/black-forest-labs/flux-1-schnell`.
- Per-user protection: at most 10 generation attempts per UTC day, tracked in D1.
- Successful generations are recorded in `usage_events`.

The binding is declared in `wrangler.toml` as `[ai]`. Generated images are also persisted in the private R2 bucket `capsut-media` when the `MEDIA` binding is provisioned; the Worker records the asset ownership and object key in D1. The endpoint is implemented in source but is not live until the D1 database and R2 bucket are created in the owner's Cloudflare account, the `database_id` placeholder is replaced, the migration is applied, and the Worker is deployed and tested with an authenticated session. Cloudflare's free allocation is account-level and subject to the provider's current quota; the per-user limit does not increase that quota.

## Text-to-video generation

The Worker now includes a real asynchronous fal queue integration for text-to-video:

- `POST /v1/generate/video` submits a prompt (8–1200 characters), five-second duration, 720p resolution for `fal-ai/wan/v2.7/text-to-video`.
- `GET /v1/generate/video/:job_id` checks the provider queue, downloads a completed MP4/WebM to the private R2 bucket, and records it as an owner-scoped asset in D1.
- `GET /v1/assets` lists the signed-in user's ready assets; `GET /v1/assets/:asset_id` streams only that user's asset.
- Each account is limited to three video submissions per UTC day. Downloads are streamed and capped at 100 MB. Provider queue and media URLs are host-validated before fetching.
- The browser never receives the fal API key. Store it as a Worker secret: `npx wrangler secret put FAL_KEY`.
- Optional model override: `FAL_VIDEO_MODEL` in Worker vars. Default: `fal-ai/wan/v2.7/text-to-video`.

Provisioning is required before this feature can run: replace the D1 placeholder with the real database ID, create the named D1 database and R2 bucket, apply migrations remotely, set `FAL_KEY`, and deploy the Worker. The provider performs paid GPU inference; set a spending limit and review fal's current model pricing before enabling it for public users. GitHub Pages is only the static frontend, not the inference server. No video is generated when the provider secret or storage bindings are missing.

## GitHub Actions deployment

A manual production deployment workflow is available at **Actions → Deploy Cap sut Edge Worker → Run workflow**. Before running it, add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`: token with Workers Scripts edit, D1 edit, R2 read, and account access needed by Wrangler.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `CAPSUT_D1_DATABASE_ID`: the UUID of the existing D1 database named `capsut-production`.
- `FAL_KEY`: the fal API key. Do not put this value in source code or share it in chat.

The R2 bucket `capsut-media` must already exist. The workflow substitutes the D1 ID at runtime, applies pending migrations, writes `FAL_KEY` as a Worker secret, and deploys `capsut-api`. It does not create or delete Cloudflare resources. Review fal billing and set provider-side spending limits before running production generation.

The workflow is manual by design: pushing frontend changes does not deploy or alter the production Worker.
