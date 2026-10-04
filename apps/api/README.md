# Cap sut API

The API is the HTTP entry point to the shared Cap sut rendering engine.

## Endpoints

### Health
`GET /health`

### Render
`POST /v1/renders`

Request:
```json
{
  "project": { "...": "canonical Cap sut Project JSON" },
  "format": "mp4"
}
```

The API validates the canonical project, creates the same `RenderPlan` used by the CLI, executes FFmpeg, and returns the generated MP4 artifact.

## Configuration

- `CAPSUT_API_PORT` — default `8080`
- `CAPSUT_FFMPEG` — default `ffmpeg`
- `CAPSUT_OUTPUT_DIR` — default system temp directory `capsut-renders`

The initial API is synchronous by design. A persistent asynchronous job queue and status store will be added after the core render contract is stable.
