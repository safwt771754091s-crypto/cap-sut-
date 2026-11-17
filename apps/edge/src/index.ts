export interface Env {
  DB: D1Database;
  AI?: Ai;
  ALLOWED_ORIGINS?: string;
  SESSION_TTL_SECONDS?: string;
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
    const body = await request.json() as Record<string, unknown>;
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
  const output = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
    prompt,
    steps: 4
  });
  if (!output.image) throw new Error("Workers AI returned no image data.");
  const binary = atob(output.image);
  const imageBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  await env.DB.prepare(
    "INSERT INTO usage_events (id, owner_id, event_type, quantity, metadata_json) VALUES (?, ?, 'image.generated', 1, ?)"
  ).bind(crypto.randomUUID(), user.id, JSON.stringify({provider:"cloudflare-workers-ai",model:"@cf/black-forest-labs/flux-1-schnell"})).run();
  return new Response(imageBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-CapSut-Provider": "cloudflare-workers-ai",
      "X-CapSut-Model": "flux-1-schnell"
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
      else response = json({ok:false,error:"Not found."},404);
    } catch {
      response = json({ok:false,error:"حدث خطأ داخلي. حاول لاحقًا."},500);
    }
    return withCors(response,request,env);
  }
};
