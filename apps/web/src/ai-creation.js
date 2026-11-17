const root = document.querySelector("#app");
const escapeAI = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let mode = "image";
let busy = false;
let resultUrl = "";

function addAIStudioButton() {
  const topbar = root?.querySelector(".topbar");
  if (!topbar || topbar.querySelector("#ai-studio-open")) return;
  const button = document.createElement("button");
  button.id = "ai-studio-open";
  button.textContent = "إنشاء من النص";
  button.title = "تحويل النص إلى صورة أو فيديو";
  topbar.insertBefore(button, topbar.querySelector("#export"));
  button.addEventListener("click", openAIStudio);
}

function openAIStudio() {
  document.querySelector("#ai-studio-panel")?.remove();
  const panel = document.createElement("div");
  panel.id = "ai-studio-panel";
  panel.dir = "rtl";
  panel.innerHTML = `
    <section class="ai-studio-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-studio-title">
      <header class="ai-studio-head"><div><h2 id="ai-studio-title">استوديو الإنشاء بالذكاء الاصطناعي</h2><p>حوّل وصفك إلى صورة أو فيديو عبر مزوّد ذكاء اصطناعي متصل بالخادم.</p></div><button id="ai-studio-close">إغلاق ✕</button></header>
      <div class="ai-studio-tabs"><button data-mode="image" class="active">نص ← صورة</button><button data-mode="video">نص ← فيديو</button></div>
      <label class="ai-studio-field">اكتب وصف ما تريد إنشاءه<textarea id="ai-studio-prompt" rows="5" maxlength="5000" placeholder="مثال: مشهد سينمائي لمدينة صنعاء القديمة وقت الغروب، إضاءة ذهبية وتفاصيل واقعية…"></textarea></label>
      <div class="ai-studio-options">
        <label class="ai-studio-field">الأبعاد<select id="ai-studio-ratio"><option value="16:9">أفقي 16:9</option><option value="9:16">عمودي 9:16</option><option value="1:1">مربع 1:1</option></select></label>
        <label class="ai-studio-field" id="ai-studio-duration-wrap">مدة الفيديو<select id="ai-studio-duration"><option value="15">15 ثانية (أقل مدة)</option><option value="30">30 ثانية</option><option value="60">دقيقة واحدة</option><option value="120">دقيقتان</option><option value="240">4 دقائق</option><option value="480">8 دقائق (الحد الأقصى)</option></select><small>مع مزوّد Golpo: من 15 ثانية إلى 8 دقائق.</small></label>
      </div>
      <details class="ai-studio-settings"><summary>إعداد اتصال خدمة التوليد</summary><label class="ai-studio-field">رابط خادم التوليد<input id="ai-studio-endpoint" type="url" placeholder="https://your-secure-api.example"></label><label class="ai-studio-field">رمز الوصول إلى خادم Cap sut<input id="ai-studio-access-token" type="password" autocomplete="off" placeholder="رمز الخادم — لا تضع مفتاح Golpo هنا"></label><p>رمز الوصول للخادم فقط. مفتاح Golpo يبقى محفوظًا في إعدادات الخادم ولا يصل إلى المتصفح.</p></details>
      <div class="ai-studio-status" id="ai-studio-status">خدمة التوليد غير متصلة حتى الآن. يمكنك كتابة وصفك وتجهيزه، ثم تفعيل الخادم لإنتاج الصور والفيديو.</div>
      <div id="ai-studio-result" class="ai-studio-result"></div>
      <footer class="ai-studio-actions"><button id="ai-studio-copy">نسخ الوصف</button><button id="ai-studio-generate" class="primary">إنشاء الآن</button></footer>
    </section>`;
  document.body.append(panel);
  const endpoint = localStorage.getItem("capsut.aiEndpoint") || "";
  panel.querySelector("#ai-studio-endpoint").value = endpoint;
  panel.querySelector("#ai-studio-close").addEventListener("click", () => panel.remove());
  panel.addEventListener("click", event => { if (event.target === panel) panel.remove(); });
  panel.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  panel.querySelector("#ai-studio-endpoint").addEventListener("change", event => {
    const value = event.target.value.trim().replace(/\/$/, "");
    localStorage.setItem("capsut.aiEndpoint", value);
    event.target.value = value;
  });
  panel.querySelector("#ai-studio-copy").addEventListener("click", copyPrompt);
  panel.querySelector("#ai-studio-generate").addEventListener("click", generate);
  setMode("image");
}

function setMode(next) {
  mode = next === "video" ? "video" : "image";
  const panel = document.querySelector("#ai-studio-panel");
  if (!panel) return;
  panel.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  panel.querySelector("#ai-studio-duration-wrap").hidden = mode !== "video";
  panel.querySelector("#ai-studio-generate").textContent = mode === "video" ? "إنشاء الفيديو" : "إنشاء الصورة";
  panel.querySelector("#ai-studio-result").replaceChildren();
  resultUrl = "";
}

async function copyPrompt() {
  const prompt = document.querySelector("#ai-studio-prompt")?.value.trim();
  if (!prompt) return setStatus("اكتب الوصف أولًا.");
  try { await navigator.clipboard.writeText(prompt); setStatus("تم نسخ الوصف."); }
  catch { setStatus("تعذّر النسخ التلقائي؛ حدّد النص وانسخه يدويًا."); }
}

function setStatus(message) {
  const status = document.querySelector("#ai-studio-status");
  if (status) status.textContent = message;
}

async function generate() {
  if (busy) return;
  const panel = document.querySelector("#ai-studio-panel");
  const prompt = panel?.querySelector("#ai-studio-prompt").value.trim();
  const endpoint = panel?.querySelector("#ai-studio-endpoint").value.trim().replace(/\/$/, "");
  const accessToken = panel?.querySelector("#ai-studio-access-token").value.trim();
  if (!prompt) return setStatus("اكتب وصفًا واضحًا قبل بدء الإنشاء.");
  if (mode === "image") return setStatus("تكامل Golpo المثبّت مخصص للفيديوهات الطويلة. توليد الصور يحتاج مزوّد صور منفصلًا.");
  if (!endpoint) return setStatus("أدخل عنوان خادم Cap sut أولًا.");
  if (!accessToken) return setStatus("أدخل رمز الوصول إلى خادم Cap sut. لا تستخدم مفتاح Golpo هنا.");
  let url;
  try { url = new URL(endpoint); if (!["https:","http:"].includes(url.protocol)) throw new Error(); }
  catch { return setStatus("رابط الخادم غير صالح. استخدم عنوان HTTPS موثوقًا."); }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return setStatus("لأمان حساباتك ومفاتيح الخدمة، يجب استخدام HTTPS.");
  }
  busy = true;
  const button = panel.querySelector("#ai-studio-generate");
  button.disabled = true;
  setStatus("جارٍ إرسال طلب الإنشاء إلى الخادم…");
  const path = mode === "video" ? "/v1/generations/videos" : "/v1/generations/images";
  const durationSeconds = Number(panel.querySelector("#ai-studio-duration").value);
  if (mode === "video" && ![15,30,60,120,240,480].includes(durationSeconds)) { setStatus("اختر مدة يدعمها مزوّد Golpo من 15 ثانية إلى 8 دقائق."); busy = false; button.disabled = false; return; }
  const payload = {prompt, aspect_ratio:panel.querySelector("#ai-studio-ratio").value, ...(mode === "video" ? {duration_seconds:durationSeconds} : {})};
  try {
    const response = await fetch(endpoint + path, {method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer " + accessToken},body:JSON.stringify(payload)});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
    if (body.status === "queued" || body.job_id) {
      if (!body.job_id) throw new Error("لم يُرجع الخادم رقم المهمة.");
      setStatus("استلم الخادم طلبك. جارٍ إنشاء الفيديو الطويل…");
      for (let attempt = 0; attempt < 360; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const statusResponse = await fetch(endpoint + "/v1/generations/videos/" + encodeURIComponent(body.job_id), {headers:{"Authorization":"Bearer " + accessToken}});
        const statusBody = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusBody.error || "تعذّر متابعة مهمة الفيديو.");
        if (statusBody.status === "failed") throw new Error(statusBody.error || "فشل إنشاء الفيديو.");
        if (statusBody.status === "completed" && statusBody.url) { body.url = statusBody.url; break; }
        setStatus("الفيديو قيد الإنشاء لدى Golpo… انتظر حتى يكتمل.");
      }
      if (!body.url) throw new Error("انتهت مهلة الانتظار؛ راجع لوحة Golpo لحالة المهمة.");
    }
    const output = body.url || body.output_url || body.output?.url;
    if (!output) throw new Error("استجاب الخادم دون رابط ملف. راجع عقد API.");
    const safe = new URL(output, endpoint);
    if (!["https:","http:"].includes(safe.protocol)) throw new Error("رابط النتيجة غير آمن.");
    resultUrl = safe.href;
    const result = panel.querySelector("#ai-studio-result");
    if (mode === "image") {
      const img = document.createElement("img"); img.src = resultUrl; img.alt = "الصورة الناتجة"; result.append(img);
    } else {
      const video = document.createElement("video"); video.src = resultUrl; video.controls = true; video.playsInline = true; result.append(video);
    }
    const link = document.createElement("a"); link.href = resultUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "فتح / تنزيل النتيجة"; result.append(link);
    setStatus("اكتمل التوليد واستلم Cap sut رابط النتيجة.");
  } catch (error) {
    setStatus("لم يكتمل التوليد: " + error.message + ". تأكد من تشغيل خدمة التوليد والسماح باتصال CORS من موقع Cap sut.");
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

const style = document.createElement("style");
style.textContent = `
#ai-studio-panel{position:fixed;inset:0;z-index:12000;background:#000c;display:grid;place-items:center;padding:14px;color:#edf2fa;font-family:system-ui,sans-serif}
.ai-studio-dialog{width:min(760px,100%);max-height:94vh;overflow:auto;background:#111a28;border:1px solid #ffffff2a;border-radius:18px;padding:20px;box-shadow:0 24px 80px #000a}
.ai-studio-head,.ai-studio-actions,.ai-studio-tabs{display:flex;align-items:center;gap:10px;justify-content:space-between}.ai-studio-head h2{margin:0;font-size:21px}.ai-studio-head p,.ai-studio-settings p{color:#a9b6c8;font-size:13px;margin:5px 0 14px}
.ai-studio-tabs{justify-content:flex-start;border-bottom:1px solid #ffffff1b;margin:15px 0}.ai-studio-tabs button.active{background:#7861e9;border-color:#7861e9;color:white}
.ai-studio-field{display:flex;flex-direction:column;gap:7px;margin:12px 0;font-size:13px;color:#d9e2f0}.ai-studio-field textarea,.ai-studio-field select{width:100%;box-sizing:border-box;background:#09111d;border:1px solid #39465a;border-radius:9px;padding:12px;color:#fff;font:inherit;transition:border-color .18s,box-shadow .18s}.ai-studio-field textarea:focus,.ai-studio-field select:focus{outline:none;border-color:#8b7aff;box-shadow:0 0 0 3px #806aff2b}.ai-studio-field small{color:#9eacc0;font-size:11px;line-height:1.6}
.ai-studio-options{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ai-studio-settings{padding:12px;border:1px solid #ffffff1c;border-radius:10px;color:#dce5f2;font-size:13px}.ai-studio-status{margin:14px 0;padding:12px;background:#202b3d;border-radius:9px;color:#cbd8eb;font-size:13px;line-height:1.7}
.ai-studio-result{display:grid;gap:10px;justify-items:start}.ai-studio-result img,.ai-studio-result video{max-width:100%;max-height:360px;border-radius:10px}.ai-studio-result a{color:#8ee9de}.ai-studio-actions{justify-content:flex-start;margin-top:15px}.ai-studio-actions .primary{background:linear-gradient(135deg,#8b78ff,#624be8);color:white;border:0;font-weight:700;padding:11px 20px}.ai-studio-actions button,.ai-studio-head button,.ai-studio-tabs button{border-radius:9px;padding:9px 13px;cursor:pointer}.ai-studio-actions button:disabled{opacity:.55;cursor:wait}
@media(max-width:600px){.ai-studio-dialog{padding:14px}.ai-studio-options{grid-template-columns:1fr}.ai-studio-head h2{font-size:17px}}
`;
document.head.append(style);
if (root) { new MutationObserver(addAIStudioButton).observe(root,{childList:true,subtree:true}); addAIStudioButton(); }
