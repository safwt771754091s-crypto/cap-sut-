# Cap sut — Cloudflare Worker (Golpo API)

This Worker is a lightweight, authenticated API gateway. Video rendering is performed by Golpo; the Worker does not render or store video files.

## Required Worker secrets

Set these in **Cloudflare Dashboard → Workers & Pages → capsut-golpo-api → Settings → Variables and Secrets**:

- `GOLPO_API_BASE_URL` — the API base URL issued by your Golpo account.
- `GOLPO_API_KEY` — your Golpo API key (Secret).
- `CAPSUT_GENERATION_TOKEN` — a long random bearer token used by the Cap sut web app (Secret).

The allowed browser origin is configured in `wrangler.toml`. Do not put provider keys or the generation token in GitHub source files.

## Deploy from the Cloudflare dashboard

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Create a Worker named `capsut-golpo-api`.
3. Open its editor, replace the starter code with the contents of `worker.js`, and deploy.
4. Add the three values above as secrets/environment variables. Keep them out of chat and GitHub.
5. Open `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/health`. It should return JSON with `configured: true`.
6. In Cap sut → **إنشاء من النص** → **نص ← فيديو**, enter the Worker URL and the same `CAPSUT_GENERATION_TOKEN` you configured as a secret.

## API

- `GET /health` — public health/configuration status (never reveals secret values).
- `POST /v1/generations/videos` — authenticated; JSON: `prompt`, `duration_seconds` (15, 30, 60, 120, 240, 480), optional `aspect_ratio`.
- `GET /v1/generations/videos/:job_id` — authenticated status lookup.

The browser sends the bearer token to this Worker. The Worker alone sends `GOLPO_API_KEY` to Golpo using `x-api-key`.

## Important limits

- GitHub Pages remains the static frontend; it cannot host this API.
- Cloudflare Workers is only the secure gateway. It does not provide free Golpo video-generation credits.
- The current Cap sut UI stores the gateway token in the browser's local storage only if the user chooses to save the endpoint; the token field itself is not persisted by this integration.
- The Worker has no persistent job database. Job status is retrieved from Golpo by job ID.
- Confirm your Golpo account's API base URL, supported engine, durations, and billing before running paid generations.
