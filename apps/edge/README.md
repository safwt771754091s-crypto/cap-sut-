# Cap sut Edge API

Cloudflare Worker control-plane API. The current implementation provides health, email/password registration, login, logout, and the authenticated profile endpoint.

## Initial account behavior

- Email and password are required.
- Accounts become active immediately; email verification is intentionally deferred.
- Passwords are stored as PBKDF2-SHA-256 hashes with per-account random salts.
- Session tokens are random, stored only as SHA-256 digests, and delivered in Secure, HttpOnly, SameSite=Lax cookies.
- Registration and login have D1-backed attempt counters.
- Configure exact browser origins with `ALLOWED_ORIGINS`.

## Provisioning

1. Create a Cloudflare D1 database named `capsut-production`.
2. Replace the placeholder `database_id` in `wrangler.toml` with the real D1 database ID.
3. From this directory, apply migrations with `npx wrangler d1 migrations apply capsut-production`.
4. Run `npm install` and `npm run check`.
5. Deploy with `npx wrangler deploy` only after the database binding and allowed origins are reviewed.

Do not commit real Cloudflare identifiers, API tokens, passwords, or secrets. The Worker is not deployed by this repository change.
