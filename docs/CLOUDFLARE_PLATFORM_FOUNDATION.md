# Cap sut — Cloudflare Platform Foundation

Status: architecture decision and implementation contract. This document does not claim that Cloudflare resources have been provisioned or deployed.

## Accepted product direction

- Keep the existing creator/editor frontend and its development workflow. The public frontend remains independently deployable on GitHub Pages during this phase.
- Build the platform control plane on Cloudflare Workers.
- Use Cloudflare D1 for relational metadata and transactional state.
- Use Cloudflare R2 for uploaded source media, generated outputs, thumbnails, and project exports.
- Keep the renderer as a separate compute concern. The existing Rust/FFmpeg renderer is not assumed to run inside a normal Worker request. A Worker can authenticate, validate, persist, queue/dispatch, and issue signed upload/download access; rendering must run on a compatible compute worker/container with FFmpeg.
- Do not introduce Firebase or Supabase.
- Ads are a monetization feature for public content pages, not an interruption inside the editing canvas.

## Logical architecture

```
GitHub Pages frontend
  | HTTPS / JSON API
  v
Cloudflare Worker (API gateway + control plane)
  |-- D1: users, sessions, projects, assets, render jobs, usage
  |-- R2: media objects and render outputs
  |-- Queue / dispatch adapter (later milestone)
  v
Dedicated render worker (Rust + FFmpeg, compatible compute)
  |
  v
R2 output object

Public landing / tutorials / gallery
  |-- ad placements (provider integration after approval)
  |-- editor route: no intrusive ads
```

## Responsibilities

### Worker API

- Validate request shape, content type, size, and ownership.
- Authenticate every private API operation; never trust a user ID supplied in a request body.
- Create project and asset metadata in D1.
- Issue short-lived, narrowly scoped upload/download authorization for R2.
- Create render-job records and dispatch work only after a durable queue/worker exists.
- Apply per-user rate limits and usage quotas before expensive operations.
- Return stable JSON errors and request IDs; never expose secrets or internal filesystem paths.

### D1

D1 stores metadata and state only. Do not store video/image binary data in D1.

Initial entities:
- users
- sessions (only if first-party session auth is selected; store token hashes, not raw bearer tokens)
- projects
- assets
- render_jobs
- usage_events

### R2

- Use opaque, generated object keys; never accept arbitrary bucket paths from clients.
- Separate namespaces for source assets, generated renders, thumbnails, and exports.
- Enforce ownership through D1 metadata before issuing signed access.
- Add lifecycle/retention rules only after product retention requirements are decided.
- Keep large media out of Git and D1.

## Initial D1 schema proposal

The initial migration creates metadata and first-party email/password authentication tables. Email is required for registration and account contact, but email verification is deferred; a new account can use the platform immediately.

- users(id, email, password_hash, display_name, email_verified_at, status, created_at, updated_at)
- email_verification_tokens(id, user_id, token_hash, expires_at, used_at, created_at)
- sessions(id, user_id, token_hash, expires_at, revoked_at, last_seen_at, created_at)
- projects(id, owner_id, title, project_json, schema_version, created_at, updated_at)
- assets(id, owner_id, project_id, object_key, original_name, mime_type, size_bytes, status, created_at)
- render_jobs(id, owner_id, project_id, status, input_json, output_object_key, error_code, created_at, started_at, completed_at)
- usage_events(id, owner_id, event_type, quantity, metadata_json, created_at)

Required constraints:
- Unique normalized email address. Email verification is not required in the initial release; accounts are usable immediately. Keep email_verified_at nullable so verification can be added later.
- Store only salted password hashes using a documented, versioned password-hashing format; never store plaintext passwords.
- Store only SHA-256 digests of random, single-use verification tokens and opaque session tokens; never store the raw tokens.
- Verification tokens expire, are single-use, and are invalidated after successful verification or replacement.
- Session cookies are Secure, HttpOnly, and SameSite; rotate session tokens after authentication and revoke them on logout/password reset.
- Foreign keys from project, asset, render job, and usage event to owner.
- Indexes on owner_id + updated_at/created_at and render_jobs.status + created_at.
- Every query for a private resource must include owner_id, not just the resource ID.
- No client-controlled owner_id in create/update payloads.

## API contract — proposed, not implemented

- GET /v1/health — service health only; no private data.
- GET /v1/me — authenticated profile.
- GET/POST /v1/projects — list/create the caller's projects.
- GET/PATCH/DELETE /v1/projects/:id — owner-scoped project operations.
- POST /v1/assets/upload-intent — validate metadata and issue scoped R2 upload authorization.
- POST /v1/assets/:id/complete — verify object exists and finalize metadata.
- GET /v1/assets/:id/download-intent — owner-scoped download authorization.
- POST /v1/renders — validate project and create a durable render job.
- GET /v1/renders/:id — owner-scoped job status and progress.
- POST /v1/renders/:id/cancel — supported only after worker cancellation is implemented.

No render endpoint may report success until an output object has been verified in R2.

## Selected identity: email/password now, verification later

The product owner clarified that the initial release must require an email address, but must not block registration or usage on email verification. Verification will be added in a later development phase.

Initial behavior:
1. User submits email and password over HTTPS.
2. Normalize the email consistently and enforce uniqueness.
3. Store only a salted, versioned password hash; never store plaintext passwords.
4. Create the account as active immediately. A nullable email_verified_at field records that verification has not yet happened.
5. Issue an opaque session token after successful registration/login; store only its digest in D1.
6. Use Secure, HttpOnly, SameSite cookies; rotate sessions and support logout/revocation.
7. Rate-limit registration and login; return non-enumerating responses for email lookup.
8. Add email verification and password recovery flows in a later phase, without making verification a prerequisite for initial account access.

The email delivery provider is not needed for initial registration. When verification and email-based recovery are implemented, select a provider and verify the sender domain first. Provider API keys and all signing/secrets belong in Cloudflare Worker secrets, never in frontend code, D1 rows, or Git.

Do not deploy placeholder authentication, accept unsigned user IDs, or treat CORS as authentication. The CORS allowlist merged in PR #11 is only a browser-origin control.

## Ads and monetization

- Reserve responsive ad slots on public landing, tutorials, and public gallery/content pages.
- Keep the editing workspace, timeline, preview, export dialogs, and account/security screens free of disruptive ad overlays.
- Load ads only after the selected provider's policy and consent requirements are satisfied.
- Do not generate fake impressions, clicks, or revenue. Revenue reporting must come from the advertising provider's verified reporting interface/API.
- Ad provider and eligibility are not selected in this architecture document.

## Delivery phases

1. Cloudflare account/resource setup: Worker, D1 database, R2 bucket, environment bindings, domains and secrets.
2. Worker health endpoint and D1 migration pipeline.
3. Identity and owner-scoped project CRUD.
4. R2 upload/download intents and asset verification.
5. Durable render dispatch, compatible FFmpeg compute worker, job progress and cancellation.
6. Frontend integration while preserving the current editor and GitHub Pages workflow.
7. Public landing, tutorials, gallery, ad-slot components, provider approval and reporting.
8. Security, quota, backup/restore, retention, and end-to-end production checks.

## Release gates

- D1 migration applies cleanly in a disposable test database.
- Tests prove cross-user reads, updates, deletes, and asset access are denied.
- R2 upload/download authorization is short-lived and owner-scoped.
- Upload size/type limits and rate limits are enforced server-side.
- Render jobs survive Worker restarts and have observable terminal states.
- No claim of AI generation, MP4 rendering, ad earnings, or production readiness until each path is implemented and tested.
