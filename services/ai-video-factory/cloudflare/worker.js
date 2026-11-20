const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

function corsHeaders(origin, env) {
  const allowed = (env.CAPSUT_ALLOWED_ORIGINS || "https://safwt771754091s-crypto.github.io")
    .split(",").map(value => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

async function golpo(path, env, options = {}) {
  const base = String(env.GOLPO_API_BASE_URL || "").replace(/\/$/, "");
  if (!base || !env.GOLPO_API_KEY) throw new Error("Golpo provider is not configured");
  const response = await fetch(base + path, {
    ...options,
    signal: AbortSignal.timeout(110000),
    headers: {
      "content-type": "application/json",
      "x-api-key": env.GOLPO_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.detail || data.error || data.message || "Golpo provider request failed";
    throw new Error(String(message).slice(0, 400));
  }
  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (!cors) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (origin && !cors) return json({ ok: false, error: "Origin not allowed" }, 403);
    const headers = cors || {};

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "capsut-golpo-cloudflare-worker",
        configured: Boolean(env.GOLPO_API_BASE_URL && env.GOLPO_API_KEY && env.CAPSUT_GENERATION_TOKEN),
      }, 200, headers);
    }

    if (!env.CAPSUT_GENERATION_TOKEN || !env.GOLPO_API_BASE_URL || !env.GOLPO_API_KEY) {
      return json({ ok: false, error: "Generation service is not configured on the server" }, 503, headers);
    }

    const authorization = request.headers.get("Authorization") || "";
    const suppliedToken = authorization.replace(/^Bearer\s+/i, "");
    if (!safeEqual(suppliedToken, env.CAPSUT_GENERATION_TOKEN)) {
      return json({ ok: false, error: "Unauthorized generation request" }, 401, headers);
    }

    try {
      if (request.method === "POST" && url.pathname === "/v1/generations/videos") {
        const raw = await request.text();
        if (raw.length > 64000) return json({ ok: false, error: "Request body too large" }, 413, headers);
        let input;
        try { input = JSON.parse(raw || "{}"); }
        catch { return json({ ok: false, error: "Invalid JSON body" }, 400, headers); }

        const prompt = String(input.prompt || "").trim();
        const seconds = Number(input.duration_seconds);
        const timingBySeconds = new Map([[15, "0.25"], [30, "0.5"], [60, "1"], [120, "2"], [240, "4"], [480, "8"]]);
        const timing = timingBySeconds.get(seconds);
        if (!prompt || prompt.length > 20000) {
          return json({ ok: false, error: "Prompt is required and must be at most 20,000 characters" }, 400, headers);
        }
        if (!timing) {
          return json({ ok: false, error: "Supported durations: 15s, 30s, 1m, 2m, 4m, 8m" }, 400, headers);
        }

        const job = await golpo("/api/v2/videos/generate", env, {
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
        if (!job.job_id) return json({ ok: false, error: "Golpo did not return a job_id" }, 502, headers);
        const id = String(job.job_id);
        return json({
          ok: true, status: "queued", job_id: id,
          status_url: "/v1/generations/videos/" + encodeURIComponent(id),
          provider: "golpo",
        }, 202, headers);
      }

      const match = request.method === "GET" &&
        url.pathname.match(/^\/v1\/generations\/videos\/([A-Za-z0-9_-]{1,200})$/);
      if (match) {
        const data = await golpo("/api/v2/videos/status/" + encodeURIComponent(match[1]), env, { method: "GET" });
        const status = String(data.status || "processing").toLowerCase();
        if (data.video_url) return json({ ok: true, status: "completed", url: data.video_url, provider: "golpo" }, 200, headers);
        if (["failed", "error", "cancelled"].includes(status)) {
          return json({ ok: false, status: "failed", error: String(data.error || data.message || "Video generation failed").slice(0, 400) }, 200, headers);
        }
        return json({ ok: true, status: "processing", progress: data.progress ?? null, provider: "golpo" }, 200, headers);
      }
      return json({ ok: false, error: "Not found" }, 404, headers);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || "Provider error").slice(0, 400) }, 502, headers);
    }
  },
};
