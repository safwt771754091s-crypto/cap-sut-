# Developer API

Planned stable surface:

GET /health
POST /v1/projects
GET /v1/projects/:id
POST /v1/render-jobs
GET /v1/render-jobs/:id
POST /v1/render-jobs/:id/cancel

Production requirements: authentication, authorization, schema validation, idempotency keys, quotas, payload limits, audit logging and secret redaction.