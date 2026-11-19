CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'fal',
  provider_request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  status_url TEXT NOT NULL,
  response_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  asset_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS video_jobs_owner_created
  ON video_generation_jobs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_jobs_provider_request
  ON video_generation_jobs(provider_request_id);
