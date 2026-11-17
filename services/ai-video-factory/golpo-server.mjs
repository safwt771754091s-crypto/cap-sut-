import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || process.env.CAPSUT_AI_PORT || 8090);
const baseUrl = (process.env.GOLPO_API_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.GOLPO_API_KEY || "";
const gatewayToken = process.env.CAPSUT_GENERATION_TOKEN || "";
const allowedOrigin = process.env.CAPSUT_ALLOWED_ORIGIN || "";

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error("Request body too large");
  }
  return JSON.parse(raw || "{}");
}
async function golpo(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", "x-api-key": apiKey, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : "Golpo provider request failed";
    throw new Error(reason.slice(0, 500));
  }
  return data;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (allowedOrigin && origin !== allowedOrigin) return send(res, 403, { ok: false, error: "Origin not allowed" });
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (!baseUrl || !apiKey || !gatewayToken) return send(res, 503, { ok: false, error: "Golpo adapter is not configured on the server" });
  if (!sameSecret((req.headers.authorization || "").replace(/^Bearer\s+/i, ""), gatewayToken)) {
    return send(res, 401, { ok: false, error: "Unauthorized generation request" });
  }

  try {
    if (req.method === "POST" && req.url === "/v1/generations/videos") {
      const input = await readJson(req);
      const prompt = String(input.prompt || "").trim();
      const seconds = Number(input.duration_seconds);
      const timingBySeconds = new Map([[15, "0.25"], [30, "0.5"], [60, "1"], [120, "2"], [240, "4"], [480, "8"]]);
      const timing = timingBySeconds.get(seconds);
      if (!prompt || prompt.length > 20_000) return send(res, 400, { ok: false, error: "Prompt is required and must be at most 20,000 characters" });
      if (!timing) return send(res, 400, { ok: false, error: "Golpo supports 15 seconds, 30 seconds, 1, 2, 4, or 8 minutes in this integration" });
      const job = await golpo("/api/v2/videos/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          timing,
          video_orientation: input.aspect_ratio === "9:16" ? "vertical" : "horizontal",
          narration_language: "ar",
          golpo_video_engine: "golpo_canvas",
          canvas_style_variant: "modern_minimal",
        }),
      });
      if (!job.job_id) return send(res, 502, { ok: false, error: "Golpo did not return a job_id" });
      return send(res, 202, { ok: true, status: "queued", job_id: String(job.job_id), status_url: "/v1/generations/videos/" + encodeURIComponent(String(job.job_id)), provider: "golpo" });
    }

    const match = req.method === "GET" && req.url.match(/^\/v1\/generations\/videos\/([A-Za-z0-9_-]{1,200})$/);
    if (match) {
      const data = await golpo("/api/v2/videos/status/" + encodeURIComponent(match[1]), { method: "GET", headers: {} });
      const status = String(data.status || "processing").toLowerCase();
      if (data.video_url) return send(res, 200, { ok: true, status: "completed", url: data.video_url, provider: "golpo" });
      if (["failed", "error", "cancelled"].includes(status)) return send(res, 200, { ok: false, status: "failed", error: String(data.error || data.message || "Video generation failed").slice(0, 500) });
      return send(res, 200, { ok: true, status: "processing", progress: data.progress ?? null, provider: "golpo" });
    }
    return send(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return send(res, 502, { ok: false, error: String(error?.message || "Provider error").slice(0, 500) });
  }
});

server.listen(port, "0.0.0.0", () => console.log("Cap sut Golpo adapter listening on " + port));
