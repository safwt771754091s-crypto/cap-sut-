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
- JSON body: `{"prompt":"...","width":768,"height":768}`
- Returns a PNG image response (not a chat completion).
- Model: `@cf/black-forest-labs/flux-1-schnell`.
- Per-user protection: at most 10 generation attempts per UTC day, tracked in D1.
- Successful generations are recorded in `usage_events`.

The binding is declared in `wrangler.toml` as `[ai]`. The endpoint is implemented in source but is not live until the Worker is deployed in the owner's Cloudflare account and tested with an authenticated session. Cloudflare's free allocation is account-level and subject to the provider's current quota; the per-user limit does not increase that quota.

## Video generation status

Video generation is deliberately not advertised as active yet. Cloudflare Workers are the API/control plane, not a long-running GPU renderer. A separate GPU/container execution provider must be connected for real image-to-video and text-to-video jobs. Do not route video jobs to GitHub Actions or claim that GitHub Pages is a rendering server.
