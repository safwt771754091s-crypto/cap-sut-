const root = document.querySelector("#app");
let mode = "image";
let busy = false;
let resultUrl = "";

function addAIStudioButton() {
  const topbar = root?.querySelector(".topbar");
  if (!topbar || topbar.querySelector("#ai-studio-open")) return;
  const button = document.createElement("button");
  button.id = "ai-studio-open";
  button.textContent = "استوديو الذكاء الاصطناعي";
  button.title = "توليد الصور والفيديو";
  topbar.insertBefore(button, topbar.querySelector("#export"));
  button.addEventListener("click", openAIStudio);
}

function openAIStudio() {
  document.querySelector("#ai-studio-panel")?.remove();
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = "";
  const panel = document.createElement("div");
  panel.id = "ai-studio-panel";
  panel.dir = "rtl";
  panel.innerHTML = `
    <section class="ai-studio-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-studio-title">
      <header class="ai-studio-head"><div><h2 id="ai-studio-title">استوديو الإنشاء بالذكاء الاصطناعي</h2><p>أنشئ صورًا وفيديوهات حقيقية من وصفك، ثم أرسل الفيديو الناتج إلى محرر Cap sut.</p></div><button id="ai-studio-close">إغلاق ✕</button></header>
      <label class="ai-studio-field">عنوان خدمة الذكاء الاصطناعي (API)<input id="ai-studio-endpoint" type="url" placeholder="https://capsut-api.اسم-حسابك.workers.dev"></label>
      <div class="ai-studio-auth">
        <input id="ai-studio-email" type="email" autocomplete="email" placeholder="البريد الإلكتروني">
        <input id="ai-studio-password" type="password" autocomplete="current-password" placeholder="كلمة المرور (10 أحرف على الأقل)">
        <div><button id="ai-studio-login">دخول</button><button id="ai-studio-register">إنشاء حساب</button><span id="ai-studio-account"></span></div>
        <small>الحساب يتفعّل فورًا بالبريد وكلمة المرور؛ لا يلزم التحقق من البريد في هذه المرحلة.</small>
      </div>
      <div class="ai-studio-tabs"><button data-mode="image" class="active">نص ← صورة</button><button data-mode="video">نص ← فيديو</button></div>
      <label class="ai-studio-field" id="ai-studio-prompt-label">اكتب وصف الصورة<textarea id="ai-studio-prompt" rows="5" maxlength="1200" placeholder="مثال: مشهد سينمائي لمدينة صنعاء القديمة وقت الغروب، إضاءة ذهبية وتفاصيل واقعية…"></textarea></label>
      <label class="ai-studio-field">جودة الصورة<select id="ai-studio-quality"><option value="4">سريعة — 4 خطوات</option><option value="8">أعلى جودة — 8 خطوات</option></select></label>
      <div class="ai-studio-status" id="ai-studio-status">أدخل رابط خادم API وسجّل الدخول لبدء توليد الصور.</div>
      <div id="ai-studio-result" class="ai-studio-result"></div>
      <section class="ai-studio-library">
        <div class="ai-studio-library-head"><h3>مكتبتي · الأصول المولدة</h3><button id="ai-studio-refresh-assets" type="button">تحديث المكتبة</button></div>
        <div id="ai-studio-assets" class="ai-studio-assets"><small>اضغط تحديث المكتبة لعرض ملفاتك المحفوظة.</small></div>
      </section>
      <footer class="ai-studio-actions"><button id="ai-studio-generate" class="primary">إنشاء الصورة</button></footer>
    </section>`;
  document.body.append(panel);
  panel.querySelector("#ai-studio-endpoint").value = localStorage.getItem("capsut.aiApiUrl") || "";
  panel.querySelector("#ai-studio-close").addEventListener("click", () => panel.remove());
  panel.addEventListener("click", event => { if (event.target === panel) panel.remove(); });
  panel.querySelector("#ai-studio-endpoint").addEventListener("change", event => {
    const value = event.target.value.trim().replace(/\/$/, "");
    localStorage.setItem("capsut.aiApiUrl", value);
    event.target.value = value;
  });
  panel.querySelector("#ai-studio-login").addEventListener("click", () => authenticate("login"));
  panel.querySelector("#ai-studio-register").addEventListener("click", () => authenticate("register"));
  panel.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  panel.querySelector("#ai-studio-generate").addEventListener("click", generate);
  panel.querySelector("#ai-studio-refresh-assets").addEventListener("click", loadGeneratedAssets);
  setMode("image");
}

function apiBase() {
  const value = document.querySelector("#ai-studio-endpoint")?.value.trim().replace(/\/$/, "");
  if (!value) throw new Error("أدخل رابط خادم API أولًا.");
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("يجب أن يستخدم الخادم اتصال HTTPS.");
  localStorage.setItem("capsut.aiApiUrl", value);
  return value;
}

function setStatus(message) {
  const node = document.querySelector("#ai-studio-status");
  if (node) node.textContent = message;
}

function setMode(next) {
  mode = next === "video" ? "video" : "image";
  const panel = document.querySelector("#ai-studio-panel");
  if (!panel) return;
  panel.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  const button = panel.querySelector("#ai-studio-generate");
  button.textContent = mode === "video" ? "توليد الفيديو" : "إنشاء الصورة";
  button.disabled = false;
  const label = panel.querySelector("#ai-studio-prompt-label");
  const prompt = panel.querySelector("#ai-studio-prompt");
  const quality = panel.querySelector("#ai-studio-quality")?.closest(".ai-studio-field");
  if (label) label.textContent = mode === "video" ? "اكتب وصف الفيديو" : "اكتب وصف الصورة";
  if (prompt) prompt.placeholder = mode === "video"
    ? "مثال: لقطة سينمائية لطائرة تحلق فوق جبال اليمن عند الشروق، حركة كاميرا سلسة وتفاصيل واقعية…" 
    : "مثال: مشهد سينمائي لمدينة صنعاء القديمة وقت الغروب، إضاءة ذهبية وتفاصيل واقعية…";
  if (quality) quality.hidden = mode === "video";
  setStatus(mode === "video"
    ? "يُنشأ الفيديو عبر مزود GPU خارجي. يلزم ضبط FAL_KEY على الخادم، وقد تُحتسب تكلفة لكل عملية."
    : "توليد الصور متاح عند تفعيل Cloudflare Workers AI على الخادم.");
}

async function authenticate(action) {
  let base;
  try { base = apiBase(); } catch (error) { return setStatus(error.message); }
  const email = document.querySelector("#ai-studio-email").value.trim();
  const password = document.querySelector("#ai-studio-password").value;
  if (!email || !password) return setStatus("أدخل البريد الإلكتروني وكلمة المرور.");
  const button = document.querySelector(action === "login" ? "#ai-studio-login" : "#ai-studio-register");
  button.disabled = true;
  setStatus(action === "login" ? "جارٍ تسجيل الدخول…" : "جارٍ إنشاء الحساب…");
  try {
    const response = await fetch(base + "/v1/auth/" + action, {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
    document.querySelector("#ai-studio-account").textContent = "تم الدخول: " + body.user.email;
    setStatus(action === "register" ? "تم إنشاء الحساب وتفعيله فورًا. يمكنك الآن إنشاء الصور." : "تم تسجيل الدخول. يمكنك الآن إنشاء الصور.");
  } catch (error) {
    setStatus("تعذر تسجيل الدخول: " + error.message + ". تحقق من رابط الخادم وإعداد CORS.");
  } finally { button.disabled = false; }
}

async function generate() {
  if (busy) return;
  if (mode === "video") return generateVideo();
  const panel = document.querySelector("#ai-studio-panel");
  const prompt = panel.querySelector("#ai-studio-prompt").value.trim();
  if (prompt.length < 3) return setStatus("اكتب وصفًا واضحًا للصورة.");
  let base;
  try { base = apiBase(); } catch (error) { return setStatus(error.message); }
  busy = true;
  const button = panel.querySelector("#ai-studio-generate");
  button.disabled = true;
  setStatus("جارٍ التحقق من الجلسة ثم إرسال طلب توليد الصورة…");
  try {
    const response = await fetch(base + "/v1/generate/image", {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt,steps:Number(panel.querySelector("#ai-studio-quality").value)})
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || ("HTTP " + response.status));
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("استجابة الخادم ليست ملف صورة.");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    const result = panel.querySelector("#ai-studio-result");
    result.replaceChildren();
    const image = document.createElement("img");
    image.src = resultUrl;
    image.alt = "الصورة التي أنشأها Cap sut";
    result.append(image);
    const download = document.createElement("a");
    download.href = resultUrl;
    download.download = "capsut-generated-image.jpg";
    download.textContent = "تنزيل الصورة";
    result.append(download);
    setStatus("نجح توليد الصورة من Cloudflare Workers AI.");
  } catch (error) {
    setStatus("لم يكتمل التوليد: " + error.message + ". تأكد من تسجيل الدخول ونشر خادم Cap sut وتفعيل AI binding.");
  } finally { busy = false; button.disabled = false; }
}

async function fetchGeneratedAsset(asset) {
  const base = apiBase();
  const response = await fetch(base + "/v1/assets/" + encodeURIComponent(asset.id), {credentials:"include"});
  if (!response.ok) throw new Error("تعذر تنزيل الملف من مكتبتك.");
  const blob = await response.blob();
  return new File([blob],asset.original_name || ("capsut-asset-" + asset.id),{type:asset.mime_type || blob.type || "application/octet-stream"});
}

async function loadGeneratedAssets() {
  const list = document.querySelector("#ai-studio-assets");
  if (!list) return;
  list.textContent = "جارٍ تحميل الأصول المحفوظة…";
  try {
    const base = apiBase();
    const response = await fetch(base + "/v1/assets",{credentials:"include"});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
    const assets = Array.isArray(body.assets) ? body.assets : [];
    list.replaceChildren();
    if (!assets.length) { list.textContent = "لا توجد ملفات محفوظة في مكتبتك حتى الآن."; return; }
    for (const asset of assets) {
      const row = document.createElement("div");
      row.className = "ai-studio-asset-row";
      const details = document.createElement("span");
      details.textContent = (asset.original_name || "ملف") + " · " + Math.max(1,Math.round((asset.size_bytes || 0)/1024)) + " KB";
      row.append(details);
      if ((asset.mime_type || "").startsWith("video/")) {
        const preview = document.createElement("button");
        preview.type = "button"; preview.textContent = "معاينة";
        preview.addEventListener("click",async () => {
          try {
            const file = await fetchGeneratedAsset(asset);
            const url = URL.createObjectURL(file);
            const video = document.createElement("video");
            video.controls = true; video.playsInline = true; video.src = url;
            video.style.maxWidth = "100%"; video.style.maxHeight = "240px";
            list.querySelector(".ai-studio-library-preview")?.remove();
            const holder = document.createElement("div"); holder.className = "ai-studio-library-preview"; holder.append(video);
            row.after(holder);
          } catch (error) { setStatus(error.message); }
        });
        row.append(preview);
        const add = document.createElement("button");
        add.type = "button"; add.textContent = "إضافة للمحرر";
        add.addEventListener("click",async () => {
          add.disabled = true;
          try {
            const file = await fetchGeneratedAsset(asset);
            window.dispatchEvent(new CustomEvent("capsut:import-generated-video",{detail:{file}}));
            setStatus("تم إرسال الملف من مكتبتك إلى المحرر.");
          } catch (error) { setStatus(error.message); }
          finally { add.disabled = false; }
        });
        row.append(add);
      }
      list.append(row);
    }
  } catch (error) { list.textContent = "تعذر تحميل المكتبة: " + error.message; }
}

async function generateVideo() {
  const panel = document.querySelector("#ai-studio-panel");
  const prompt = panel?.querySelector("#ai-studio-prompt")?.value.trim() || "";
  if (prompt.length < 8) return setStatus("اكتب وصفًا للفيديو لا يقل عن 8 أحرف.");
  let base;
  try { base = apiBase(); } catch (error) { return setStatus(error.message); }
  busy = true;
  const button = panel.querySelector("#ai-studio-generate");
  button.disabled = true;
  const result = panel.querySelector("#ai-studio-result");
  result.replaceChildren();
  setStatus("جارٍ إرسال مهمة الفيديو إلى مزود التوليد…");
  try {
    const response = await fetch(base + "/v1/generate/video", {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
    if (!body.job_id) throw new Error("لم يُرجع الخادم رقم مهمة صالحًا.");
    setStatus("تم قبول المهمة. جارٍ توليد الفيديو؛ قد يستغرق ذلك عدة دقائق…");
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 6000));
      const poll = await fetch(base + "/v1/generate/video/" + encodeURIComponent(body.job_id), {credentials:"include"});
      const status = await poll.json().catch(() => ({}));
      if (!poll.ok) throw new Error(status.error || ("HTTP " + poll.status));
      if (status.status === "failed") throw new Error("أخفق مزود الفيديو في إنشاء المقطع. جرّب وصفًا آخر.");
      if (status.status === "succeeded" && status.asset_url) {
        const url = base + status.asset_url;
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = url;
        video.style.maxWidth = "100%";
        video.style.maxHeight = "420px";
        result.append(video);
        const download = document.createElement("a");
        download.href = url;
        download.download = status.file_name || "capsut-generated-video.mp4";
        download.textContent = "تنزيل الفيديو الناتج";
        result.append(download);
        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.textContent = "إضافة الفيديو إلى محرر Cap sut";
        importButton.addEventListener("click", async () => {
          importButton.disabled = true;
          try {
            const fileResponse = await fetch(url,{credentials:"include"});
            if (!fileResponse.ok) throw new Error("تعذر تنزيل الفيديو من مكتبة الأصول.");
            const blob = await fileResponse.blob();
            const file = new File([blob],download.download,{type:status.mime_type || blob.type || "video/mp4"});
            window.dispatchEvent(new CustomEvent("capsut:import-generated-video",{detail:{file}}));
            setStatus("تم إرسال الفيديو إلى المحرر. أكمل رفعه إلى خادم التصيير عند الطلب.");
          } catch (error) {
            setStatus("تعذر إدخال الفيديو للمحرر: " + error.message);
          } finally { importButton.disabled = false; }
        });
        result.append(importButton);
        setStatus("اكتمل توليد الفيديو وحُفظ في مكتبة أصول حسابك. يمكنك تنزيله أو إدخاله إلى المحرر.");
        return;
      }
      setStatus(status.status === "running" ? "المزوّد ينشئ الفيديو الآن…" : "الفيديو في قائمة الانتظار…");
    }
    throw new Error("ما زالت المهمة قيد التنفيذ. أعد فتح الاستوديو وتحقق من المهمة لاحقًا.");
  } catch (error) {
    setStatus("لم يكتمل توليد الفيديو: " + error.message);
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

const style = document.createElement("style");
style.textContent = `
#ai-studio-panel{position:fixed;inset:0;z-index:12000;background:#000c;display:grid;place-items:center;padding:14px;color:#edf2fa;font-family:system-ui,sans-serif}
.ai-studio-dialog{width:min(760px,100%);max-height:94vh;overflow:auto;background:#111a28;border:1px solid #ffffff2a;border-radius:18px;padding:20px;box-shadow:0 24px 80px #000a}
.ai-studio-head,.ai-studio-actions,.ai-studio-tabs{display:flex;align-items:center;gap:10px;justify-content:space-between}.ai-studio-head h2{margin:0;font-size:21px}.ai-studio-head p,.ai-studio-auth small{color:#a9b6c8;font-size:13px;margin:5px 0 14px}
.ai-studio-field{display:flex;flex-direction:column;gap:7px;margin:12px 0;font-size:13px;color:#d9e2f0}.ai-studio-field textarea,.ai-studio-field select,.ai-studio-field input,.ai-studio-auth input{width:100%;box-sizing:border-box;background:#09111d;border:1px solid #39465a;border-radius:9px;padding:12px;color:#fff;font:inherit}
.ai-studio-auth{display:grid;gap:9px;padding:12px;border:1px solid #ffffff1c;border-radius:10px}.ai-studio-auth>div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ai-studio-auth span{color:#8ee9de;font-size:12px}
.ai-studio-tabs{justify-content:flex-start;border-bottom:1px solid #ffffff1b;margin:15px 0}.ai-studio-tabs button.active{background:#7861e9;border-color:#7861e9;color:white}
.ai-studio-status{margin:14px 0;padding:12px;background:#202b3d;border-radius:9px;color:#cbd8eb;font-size:13px;line-height:1.7}
.ai-studio-result{display:grid;gap:10px;justify-items:start}.ai-studio-result img{max-width:100%;max-height:420px;border-radius:10px}.ai-studio-result a{color:#8ee9de}
.ai-studio-actions{justify-content:flex-start;margin-top:15px}.ai-studio-actions .primary{background:linear-gradient(135deg,#8b78ff,#624be8);color:white;border:0;font-weight:700;padding:11px 20px}.ai-studio-actions button,.ai-studio-head button,.ai-studio-tabs button,.ai-studio-auth button{border-radius:9px;padding:9px 13px;cursor:pointer}.ai-studio-actions button:disabled{opacity:.55;cursor:wait}
@media(max-width:600px){.ai-studio-dialog{padding:14px}.ai-studio-head h2{font-size:17px}}
`;
document.head.append(style);
if (root) { new MutationObserver(addAIStudioButton).observe(root,{childList:true,subtree:true}); addAIStudioButton(); }
