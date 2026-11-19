export interface Env {
  DB: D1Database;
  AI?: Ai;
  MEDIA?: R2Bucket;
  ALLOWED_ORIGINS?: string;
  SESSION_TTL_SECONDS?: string;
  FAL_KEY?: string;
  FAL_VIDEO_MODEL?: string;
}

const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_KEY_LENGTH = 256;
const SESSION_COOKIE = "__Host-capsut_session";
const MAX_BODY_BYTES = 16 * 1024;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  status: string;
};

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const output = new Headers(headers);
  output.set("Content-Type", "application/json; charset=utf-8");
  output.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: output });
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "https://safwt771754091s-crypto.github.io")
    .split(",").map(value => value.trim()).filter(Boolean);
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}

function cookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    material,
    PASSWORD_KEY_LENGTH
  );
  const toHex = (data: Uint8Array) => Array.from(data, value => value.toString(16).padStart(2, "0")).join("");
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltHex, expectedHex] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  if (!/^[a-f0-9]{32}$/.test(saltHex ?? "") || !/^[a-f0-9]{64}$/.test(expectedHex ?? "")) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(value => parseInt(value, 16)));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, 256);
  const actual = Array.from(new Uint8Array(bits), value => value.toString(16).padStart(2, "0")).join("");
  return actual === expectedHex;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) return null;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return null;
    const body = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

async function rateLimit(env: Env, key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempt_count)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_started_at = CASE WHEN ? - window_started_at >= ? THEN ? ELSE window_started_at END,
      attempt_count = CASE WHEN ? - window_started_at >= ? THEN 1 ELSE attempt_count + 1 END
  `).bind(key, now, now, windowSeconds, now, now, windowSeconds).run();
  const row = await env.DB.prepare("SELECT attempt_count FROM auth_rate_limits WHERE bucket_key = ?").bind(key).first<{attempt_count:number}>();
  return (row?.attempt_count ?? maxAttempts + 1) <= maxAttempts;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

async function createSession(env: Env, userId: string): Promise<{token:string; maxAge:number}> {
  const token = randomToken();
  const maxAge = Math.max(3600, Math.min(Number(env.SESSION_TTL_SECONDS ?? "2592000"), 60 * 60 * 24 * 90));
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, await sha256(token), new Date(Date.now() + maxAge * 1000).toISOString()).run();
  return { token, maxAge };
}

async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const rawCookie = request.headers.get("Cookie") ?? "";
  const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]{64})(?:;|$)`));
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  return env.DB.prepare(`
    SELECT u.id, u.email, u.password_hash, u.display_name, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND u.status = 'active'
  `).bind(tokenHash, new Date().toISOString()).first<UserRow>();
}

async function register(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim().slice(0, 80) : null;
  if (!body || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 256) {
    return json({ ok:false, error:"أدخل بريدًا إلكترونيًا صحيحًا وكلمة مرور من 10 أحرف على الأقل." }, 400);
  }
  const ipKey = await sha256(`register:ip:${clientIp(request)}`);
  const emailKey = await sha256(`register:email:${email}`);
  if (!await rateLimit(env, ipKey, 10, 3600) || !await rateLimit(env, emailKey, 5, 3600)) {
    return json({ ok:false, error:"محاولات كثيرة. حاول لاحقًا." }, 429);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first<{id:string}>();
  if (existing) return json({ ok:false, error:"تعذر إنشاء الحساب بهذه البيانات." }, 409);
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, status) VALUES (?, ?, ?, ?, 'active')"
  ).bind(userId, email, passwordHash, displayName).run();
  const session = await createSession(env, userId);
  return json({ ok:true, user:{ id:userId, email, display_name:displayName }, email_verified:false }, 201, {
    "Set-Cookie": cookie(session.token, session.maxAge)
  });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!body || !email || !password || password.length > 256) return json({ok:false,error:"بيانات الدخول غير صحيحة."},400);
  const key = await sha256(`login:${clientIp(request)}:${email}`);
  if (!await rateLimit(env, key, 10, 900)) return json({ok:false,error:"محاولات كثيرة. حاول بعد 15 دقيقة."},429);
  const user = await env.DB.prepare(
    "SELECT id, email, password_hash, display_name, status FROM users WHERE email = ? COLLATE NOCASE"
  ).bind(email).first<UserRow>();
  if (!user || user.status !== "active" || !await verifyPassword(password, user.password_hash)) {
    return json({ok:false,error:"البريد الإلكتروني أو كلمة المرور غير صحيحة."},401);
  }
  const session = await createSession(env, user.id);
  return json({ok:true,user:{id:user.id,email:user.email,display_name:user.display_name}},200,{
    "Set-Cookie":cookie(session.token,session.maxAge)
  });
}

async function generateImage(request: Request, env: Env): Promise<Response> {
  if (!env.AI) return json({ok:false,error:"خدمة توليد الصور غير مفعّلة على الخادم."},503);
  const user = await currentUser(request, env);
  if (!user) return json({ok:false,error:"سجّل الدخول لاستخدام مولّد الصور."},401);
  const body = await readBody(request);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!body || prompt.length < 3 || prompt.length > 1200) {
    return json({ok:false,error:"اكتب وصفًا للصورة بين 3 و1200 حرف."},400);
  }
  const day = new Date().toISOString().slice(0,10);
  const bucket = await sha256(`image:${user.id}:${day}`);
  if (!await rateLimit(env, bucket, 10, 24 * 60 * 60)) {
    return json({ok:false,error:"وصلت إلى الحد اليومي التجريبي لتوليد الصور. حاول غدًا."},429);
  }
  const requestedSteps = Number(body.steps);
  const steps = requestedSteps === 8 ? 8 : 4;
  let imageBase64: string;
  try {
    const output = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt, steps });
    imageBase64 = output.image ?? "";
  } catch {
    return json({ok:false,error:"تعذر توليد الصورة حاليًا؛ قد تكون الحصة اليومية انتهت أو الخدمة مزدحمة. حاول لاحقًا."},503);
  }
  if (!imageBase64) return json({ok:false,error:"لم يُرجع مزود الصور ملفًا صالحًا."},502);
  const binary = atob(imageBase64);
  const imageBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  let assetId: string | null = null;
  if (env.MEDIA) {
    assetId = crypto.randomUUID();
    const objectKey = `generated/${user.id}/${assetId}.jpg`;
    await env.MEDIA.put(objectKey, imageBytes, {
      httpMetadata: { contentType: "image/jpeg", cacheControl: "private, no-store" },
      customMetadata: { ownerId: user.id, provider: "cloudflare-workers-ai", model: "flux-1-schnell" }
    });
    await env.DB.prepare(
      "INSERT INTO assets (id, owner_id, object_key, original_name, mime_type, size_bytes, status) VALUES (?, ?, ?, ?, 'image/jpeg', ?, 'ready')"
    ).bind(assetId, user.id, objectKey, `capsut-${assetId}.jpg`, imageBytes.byteLength).run();
  }
  await env.DB.prepare(
    "INSERT INTO usage_events (id, owner_id, event_type, quantity, metadata_json) VALUES (?, ?, 'image.generated', 1, ?)"
  ).bind(crypto.randomUUID(), user.id, JSON.stringify({provider:"cloudflare-workers-ai",model:"@cf/black-forest-labs/flux-1-schnell",steps,asset_id:assetId})).run();
  return new Response(imageBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-CapSut-Provider": "cloudflare-workers-ai",
      "X-CapSut-Model": "flux-1-schnell",
      ...(assetId ? { "X-CapSut-Asset-ID": assetId } : {})
    }
  });
}

async function generateVideo(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ok:false,error:"سجّل الدخول لاستخدام توليد الفيديو."},401);
  if (!env.FAL_KEY) return json({ok:false,error:"مزود توليد الفيديو غير مضبوط بعد على الخادم (FAL_KEY). لم يتم إنشاء فيديو وهمي."},503);
  const body = await readBody(request);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!body || prompt.length < 8 || prompt.length > 1200) return json({ok:false,error:"اكتب وصف فيديو بين 8 و1200 حرف."},400);
  const day = new Date().toISOString().slice(0,10);
  const bucket = await sha256(`video:${user.id}:${day}`);
  if (!await rateLimit(env,bucket,3,24*60*60)) return json({ok:false,error:"وصلت إلى الحد التجريبي اليومي لتوليد الفيديو (3 فيديوهات). حاول غدًا."},429);
  const model = env.FAL_VIDEO_MODEL || "fal-ai/wan/v2.7/text-to-video";
  let queued: {request_id?:string;status_url?:string;response_url?:string};
  try {
    const response = await fetch("https://queue.fal.run/" + model, {
      method:"POST",
      headers:{"Authorization":`Key ${env.FAL_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({prompt, resolution:"720p", aspect_ratio:"16:9", duration:5, enable_safety_checker:true, enable_prompt_expansion:true})
    });
    const payload = await response.json() as typeof queued & {detail?:string;error?:string};
    if (!response.ok || !payload.request_id || !payload.status_url || !payload.response_url ||
      !isFalQueueUrl(payload.status_url) || !isFalQueueUrl(payload.response_url)) {
      return json({ok:false,error:payload.detail || payload.error || "أعاد مزود الفيديو بيانات مهمة غير صالحة."},502);
    }
    queued = payload;
  } catch {
    return json({ok:false,error:"تعذر الاتصال بمزود توليد الفيديو."},503);
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO video_generation_jobs
    (id,owner_id,provider,provider_request_id,status,status_url,response_url,prompt)
    VALUES (?,?, 'fal', ?, 'queued', ?, ?, ?)`)
    .bind(id,user.id,queued.request_id,queued.status_url,queued.response_url,prompt).run();
  await env.DB.prepare("INSERT INTO usage_events (id,owner_id,event_type,quantity,metadata_json) VALUES (?,?,'video.queued',1,?)")
    .bind(crypto.randomUUID(),user.id,JSON.stringify({provider:"fal",model,job_id:id})).run();
  return json({ok:true,job_id:id,status:"queued"},202);
}

function isFalQueueUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "queue.fal.run" &&
      !url.username && !url.password && !url.port;
  } catch { return false; }
}

function isFalMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const falMediaHost = url.hostname === "fal.media" || url.hostname.endsWith(".fal.media");
    const falTestStoragePath = url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/falserverless/");
    return url.protocol === "https:" && (falMediaHost || falTestStoragePath) &&
      !url.username && !url.password && !url.port;
  } catch { return false; }
}

async function getVideoJob(request: Request, env: Env, jobId: string): Promise<Response> {
  const user = await currentUser(request,env);
  if (!user) return json({ok:false,error:"يلزم تسجيل الدخول."},401);
  if (!env.FAL_KEY) return json({ok:false,error:"مزود توليد الفيديو غير مضبوط على الخادم."},503);
  const job = await env.DB.prepare(`SELECT j.id,j.status,j.status_url,j.response_url,j.asset_id,j.updated_at,a.mime_type,a.original_name
    FROM video_generation_jobs j LEFT JOIN assets a ON a.id=j.asset_id WHERE j.id=? AND j.owner_id=?`).bind(jobId,user.id)
    .first<{id:string;status:string;status_url:string;response_url:string;asset_id:string|null;updated_at:string;mime_type:string|null;original_name:string|null}>();
  if (!job) return json({ok:false,error:"مهمة الفيديو غير موجودة."},404);
  if (job.status === "succeeded" && job.asset_id) return json({ok:true,job_id:job.id,status:"succeeded",asset_id:job.asset_id,asset_url:`/v1/assets/${job.asset_id}`,mime_type:job.mime_type, file_name:job.original_name});
  if (job.status === "failed") return json({ok:true,job_id:job.id,status:"failed"});
  if (job.status === "finalizing" && Date.now() - Date.parse(job.updated_at) < 5 * 60 * 1000) {
    return json({ok:true,job_id:job.id,status:"running"});
  }
  if (!isFalQueueUrl(job.status_url) || !isFalQueueUrl(job.response_url)) {
    return json({ok:false,error:"روابط مهمة الفيديو غير موثوقة."},502);
  }
  try {
    const statusResponse = await fetch(job.status_url,{headers:{"Authorization":`Key ${env.FAL_KEY}`},redirect:"error"});
    if (!statusResponse.ok) throw new Error("provider status unavailable");
    const statusBody = await statusResponse.json() as {status?:string;error?:string};
    if (statusBody.status === "COMPLETED") {
      const claim = await env.DB.prepare("UPDATE video_generation_jobs SET status='finalizing',updated_at=? WHERE id=? AND owner_id=? AND (status IN ('queued','running') OR (status='finalizing' AND updated_at < ?))")
        .bind(new Date().toISOString(),job.id,user.id,new Date(Date.now()-5*60*1000).toISOString()).run();
      if (!claim.meta.changes) return json({ok:true,job_id:job.id,status:"running"});
      const resultResponse = await fetch(job.response_url,{headers:{"Authorization":"Key " + env.FAL_KEY},redirect:"error"});
      if (!resultResponse.ok) throw new Error("provider result unavailable");
      const result = await resultResponse.json() as {video?:{url?:string;content_type?:string;file_name?:string}};
      const videoUrl = result.video?.url;
      if (!videoUrl || !isFalMediaUrl(videoUrl)) throw new Error("provider returned an invalid video URL");
      const download = await fetch(videoUrl,{redirect:"error"});
      if (!download.ok || !download.body) throw new Error("video download failed");
      const headerType = (download.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      const providerType = (result.video?.content_type || "").split(";")[0].trim().toLowerCase();
      const contentType = headerType.startsWith("video/") ? headerType : providerType;
      if (!contentType.startsWith("video/")) throw new Error("provider result is not a video");
      const declaredSize = Number(download.headers.get("Content-Length") || "0");
      const maxBytes = 100 * 1024 * 1024;
      if (declaredSize > maxBytes) throw new Error("video file exceeds the 100 MB limit");
      if (!env.MEDIA) throw new Error("media storage is unavailable");
      const assetId = crypto.randomUUID();
      const extension = contentType.includes("webm") ? "webm" : "mp4";
      const objectKey = "generated/" + user.id + "/" + assetId + "." + extension;
      let sizeBytes = 0;
      const boundedStream = download.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
        transform(chunk,controller) {
          sizeBytes += chunk.byteLength;
          if (sizeBytes > maxBytes) throw new Error("video file exceeds the 100 MB limit");
          controller.enqueue(chunk);
        }
      }));
      await env.MEDIA.put(objectKey,boundedStream,{httpMetadata:{contentType,cacheControl:"private, no-store"},customMetadata:{ownerId:user.id,provider:"fal"}});
      try {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO assets (id,owner_id,object_key,original_name,mime_type,size_bytes,status) VALUES (?,?,?,?,?,?,'ready')")
            .bind(assetId,user.id,objectKey,"capsut-video-" + assetId + "." + extension,contentType,sizeBytes),
          env.DB.prepare("UPDATE video_generation_jobs SET status='succeeded',asset_id=?,updated_at=? WHERE id=? AND owner_id=?")
            .bind(assetId,new Date().toISOString(),job.id,user.id),
          env.DB.prepare("INSERT INTO usage_events (id,owner_id,event_type,quantity,metadata_json) VALUES (?,?,'video.generated',1,?)")
            .bind(crypto.randomUUID(),user.id,JSON.stringify({provider:"fal",asset_id:assetId,job_id:job.id}))
        ]);
      } catch (error) {
        await env.MEDIA.delete(objectKey);
        throw error;
      }
      return json({ok:true,job_id:job.id,status:"succeeded",asset_id:assetId,asset_url:"/v1/assets/" + assetId,mime_type:contentType,file_name:"capsut-video-" + assetId + "." + extension});
    }
    if (statusBody.status === "FAILED") {
      await env.DB.prepare("UPDATE video_generation_jobs SET status='failed',error_code='provider_failed',updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','running')")
        .bind(new Date().toISOString(),job.id,user.id).run();
      return json({ok:true,job_id:job.id,status:"failed"});
    }
    const status = statusBody.status === "IN_PROGRESS" ? "running" : "queued";
    await env.DB.prepare("UPDATE video_generation_jobs SET status=?,updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','running')")
      .bind(status,new Date().toISOString(),job.id,user.id).run();
    return json({ok:true,job_id:job.id,status});
  } catch {
    await env.DB.prepare("UPDATE video_generation_jobs SET status='running',updated_at=? WHERE id=? AND owner_id=? AND status='finalizing'")
      .bind(new Date().toISOString(),job.id,user.id).run().catch(() => undefined);
    return json({ok:false,error:"تعذر تحديث حالة الفيديو أو حفظ الملف الناتج. يمكنك إعادة المحاولة."},502);
  }
}

async function listAssets(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ok:false,error:"يلزم تسجيل الدخول."},401);
  const rows = await env.DB.prepare(
    "SELECT id, original_name, mime_type, size_bytes, status, created_at FROM assets WHERE owner_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 100"
  ).bind(user.id).all();
  return json({ok:true,assets:rows.results});
}

async function getAsset(request: Request, env: Env, assetId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ok:false,error:"يلزم تسجيل الدخول."},401);
  if (!env.MEDIA) return json({ok:false,error:"تخزين الوسائط غير مفعّل."},503);
  const asset = await env.DB.prepare(
    "SELECT object_key, original_name, mime_type, size_bytes FROM assets WHERE id = ? AND owner_id = ? AND status = 'ready'"
  ).bind(assetId,user.id).first<{object_key:string;original_name:string;mime_type:string;size_bytes:number}>();
  if (!asset) return json({ok:false,error:"الملف غير موجود."},404);
  const object = await env.MEDIA.get(asset.object_key);
  if (!object) return json({ok:false,error:"ملف الوسائط غير موجود في التخزين."},404);
  return new Response(object.body,{
    headers:{
      "Content-Type":asset.mime_type,
      "Content-Length":String(asset.size_bytes),
      "Content-Disposition":`inline; filename="${asset.original_name.replace(/["\\\\]/g,"_")}"`,
      "Cache-Control":"private, no-store"
    }
  });
}

async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ok:false,error:"يلزم تسجيل الدخول."},401);
  return json({ok:true,user:{id:user.id,email:user.email,display_name:user.display_name}});
}

async function logout(request: Request, env: Env): Promise<Response> {
  const rawCookie = request.headers.get("Cookie") ?? "";
  const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]{64})(?:;|$)`));
  if (match) {
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), await sha256(match[1])).run();
  }
  return json({ok:true},200,{"Set-Cookie":clearCookie()});
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins(env).includes(origin)) return json({ok:false,error:"Origin not allowed."},403);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null,{status:204});
      return new Response(null,{status:204,headers:{
        "Access-Control-Allow-Origin":origin,
        "Access-Control-Allow-Credentials":"true",
        "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type",
        "Access-Control-Max-Age":"600",
        "Vary":"Origin"
      }});
    }
    const url = new URL(request.url);
    let response: Response;
    try {
      if (url.pathname === "/health" && request.method === "GET") response = json({ok:true,service:"capsut-edge"});
      else if (url.pathname === "/v1/auth/register" && request.method === "POST") response = await register(request,env);
      else if (url.pathname === "/v1/auth/login" && request.method === "POST") response = await login(request,env);
      else if (url.pathname === "/v1/auth/logout" && request.method === "POST") response = await logout(request,env);
      else if (url.pathname === "/v1/me" && request.method === "GET") response = await me(request,env);
      else if (url.pathname === "/v1/generate/image" && request.method === "POST") response = await generateImage(request,env);
      else if (url.pathname === "/v1/generate/video" && request.method === "POST") response = await generateVideo(request,env);
      else if (url.pathname.startsWith("/v1/generate/video/") && request.method === "GET") response = await getVideoJob(request,env,url.pathname.slice("/v1/generate/video/".length));
      else if (url.pathname === "/v1/assets" && request.method === "GET") response = await listAssets(request,env);
      else if (url.pathname.startsWith("/v1/assets/") && request.method === "GET") response = await getAsset(request,env,url.pathname.slice("/v1/assets/".length));
      else response = json({ok:false,error:"Not found."},404);
    } catch {
      response = json({ok:false,error:"حدث خطأ داخلي. حاول لاحقًا."},500);
    }
    return withCors(response,request,env);
  }
};
