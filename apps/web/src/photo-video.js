const PHOTO_VIDEO_STYLE = `
#photo-video-panel{position:fixed;inset:0;z-index:10000;background:#000b;display:grid;place-items:center;padding:16px}
#photo-video-panel .pv-dialog{width:min(980px,100%);max-height:92vh;overflow:auto;background:#111820;color:#eef2f7;border:1px solid #354252;border-radius:14px;padding:18px;box-shadow:0 20px 70px #0009}
#photo-video-panel .pv-head,#photo-video-panel .pv-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#photo-video-panel .pv-head{margin-bottom:12px}
#photo-video-panel .pv-head h2{font-size:19px;margin:0}
#photo-video-panel .pv-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(250px,1fr);gap:16px}
#photo-video-panel .pv-preview{width:100%;aspect-ratio:16/9;background:#070a0e;border-radius:8px;object-fit:contain}
#photo-video-panel .pv-list{display:flex;flex-direction:column;gap:8px;max-height:310px;overflow:auto;margin-top:10px}
#photo-video-panel .pv-photo{display:flex;align-items:center;gap:8px;padding:8px;background:#1a232e;border:1px solid #354252;border-radius:8px}
#photo-video-panel .pv-photo img{width:66px;height:48px;object-fit:cover;border-radius:4px}
#photo-video-panel .pv-photo .pv-name{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}
#photo-video-panel input[type=text],#photo-video-panel input[type=number]{background:#0c1117;color:#fff;border:1px solid #3b4756;border-radius:6px;padding:9px;min-width:0}
#photo-video-panel .pv-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-size:13px;color:#cbd5e1}
#photo-video-panel .pv-note{color:#9eacbd;font-size:12px;line-height:1.6}
#photo-video-panel .pv-primary{background:#fff;color:#111;font-weight:700}
#photo-video-panel button:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:720px){#photo-video-panel .pv-grid{grid-template-columns:1fr}#photo-video-panel .pv-dialog{padding:12px}}
`;

let photoVideoItems = [];
let photoVideoBusy = false;
let photoVideoObjectUrls = [];

function installPhotoVideoButton() {
  const topbar = document.querySelector("#app .topbar");
  if (!topbar || topbar.querySelector("#photo-video-open")) return;
  const button = document.createElement("button");
  button.id = "photo-video-open";
  button.textContent = "صناعة فيديو من الصور";
  button.title = "حوّل مجموعة صور إلى فيديو";
  const style = document.createElement("style");
  style.textContent = PHOTO_VIDEO_STYLE;
  if (!document.querySelector("#photo-video-style")) {
    style.id = "photo-video-style";
    document.head.append(style);
  }
  topbar.insertBefore(button, topbar.querySelector("#export"));
  button.addEventListener("click", openPhotoVideo);
}

function openPhotoVideo() {
  document.querySelector("#photo-video-panel")?.remove();
  photoVideoItems = [];
  photoVideoObjectUrls.forEach(URL.revokeObjectURL);
  photoVideoObjectUrls = [];
  const panel = document.createElement("div");
  panel.id = "photo-video-panel";
  panel.innerHTML = `
    <section class="pv-dialog" role="dialog" aria-modal="true" aria-labelledby="pv-title" dir="rtl">
      <div class="pv-head"><h2 id="pv-title">صناعة فيديو من الصور</h2><span style="flex:1"></span><button id="pv-close">إغلاق ✕</button></div>
      <p class="pv-note">اختر صورًا من جهازك، رتّبها، حدّد مدة عرض الصورة، وأضف عنوانًا اختياريًا ثم أنشئ الفيديو.</p>
      <div class="pv-grid">
        <div>
          <canvas class="pv-preview" id="pv-canvas" width="1280" height="720"></canvas>
          <div class="pv-row" style="margin-top:10px"><button id="pv-preview-btn">معاينة الصور</button><span id="pv-status" class="pv-note">لم تُضف صور بعد.</span></div>
          <div id="pv-list" class="pv-list"></div>
        </div>
        <div>
          <label class="pv-field">إضافة الصور (يمكن اختيار عدة صور)
            <input id="pv-files" type="file" accept="image/*" multiple>
          </label>
          <label class="pv-field">مدة كل صورة بالثواني
            <input id="pv-duration" type="number" min="1" max="30" step="1" value="3">
          </label>
          <label class="pv-field">عنوان يظهر على الفيديو (اختياري)
            <input id="pv-title-text" type="text" maxlength="100" placeholder="اكتب عنوان الفيديو">
          </label>
          <label class="pv-field">مقاس الفيديو
            <select id="pv-size"><option value="landscape">أفقي 16:9</option><option value="portrait">عمودي 9:16</option><option value="square">مربع 1:1</option></select>
          </label>
          <button id="pv-create" class="pv-primary" disabled>إنشاء الفيديو وتنزيله</button>
          <p class="pv-note">يُنشأ الفيديو داخل المتصفح دون رفع صورك إلى خادم. صيغة التنزيل تعتمد على دعم المتصفح (عادةً WebM). تصدير MP4 غير مضمون في المتصفح؛ يمكن إضافته لاحقًا عبر خادم FFmpeg.</p>
        </div>
      </div>
    </section>`;
  document.body.append(panel);
  panel.querySelector("#pv-close").addEventListener("click", closePhotoVideo);
  panel.addEventListener("click", e => { if (e.target === panel) closePhotoVideo(); });
  panel.querySelector("#pv-files").addEventListener("change", onPhotoFiles);
  panel.querySelector("#pv-duration").addEventListener("change", renderPhotoList);
  panel.querySelector("#pv-title-text").addEventListener("input", () => drawPhotoFrame(0));
  panel.querySelector("#pv-size").addEventListener("change", changePhotoCanvasSize);
  panel.querySelector("#pv-preview-btn").addEventListener("click", previewPhotoSlideshow);
  panel.querySelector("#pv-create").addEventListener("click", createPhotoVideo);
  drawPhotoFrame(0);
}

function closePhotoVideo() {
  if (photoVideoBusy) return;
  document.querySelector("#photo-video-panel")?.remove();
  photoVideoObjectUrls.forEach(URL.revokeObjectURL);
  photoVideoObjectUrls = [];
  photoVideoItems = [];
}

function onPhotoFiles(event) {
  const files = [...(event.target.files || [])].filter(file => file.type.startsWith("image/"));
  for (const file of files) {
    const url = URL.createObjectURL(file);
    photoVideoObjectUrls.push(url);
    const image = new Image();
    image.onload = () => {
      photoVideoItems.push({ name: file.name, url, image });
      renderPhotoList();
      drawPhotoFrame(photoVideoItems.length - 1);
    };
    image.onerror = () => setPhotoStatus("تعذّر فتح الصورة: " + file.name);
    image.src = url;
  }
  event.target.value = "";
}

function renderPhotoList() {
  const list = document.querySelector("#pv-list");
  if (!list) return;
  list.innerHTML = photoVideoItems.map((item, index) => `
    <div class="pv-photo">
      <img src="${item.url}" alt="">
      <span class="pv-name">${escapePhotoText(item.name)}</span>
      <button data-pv-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="تحريك للأعلى">↑</button>
      <button data-pv-down="${index}" ${index === photoVideoItems.length - 1 ? "disabled" : ""} aria-label="تحريك للأسفل">↓</button>
      <button data-pv-remove="${index}" aria-label="حذف الصورة">حذف</button>
    </div>`).join("");
  list.querySelectorAll("[data-pv-up]").forEach(button => button.addEventListener("click", () => movePhoto(Number(button.dataset.pvUp), -1)));
  list.querySelectorAll("[data-pv-down]").forEach(button => button.addEventListener("click", () => movePhoto(Number(button.dataset.pvDown), 1)));
  list.querySelectorAll("[data-pv-remove]").forEach(button => button.addEventListener("click", () => {
    photoVideoItems.splice(Number(button.dataset.pvRemove), 1);
    renderPhotoList();
    drawPhotoFrame(0);
  }));
  const create = document.querySelector("#pv-create");
  if (create) create.disabled = photoVideoItems.length === 0 || photoVideoBusy;
  setPhotoStatus(photoVideoItems.length ? `عدد الصور: ${photoVideoItems.length} · المدة التقريبية: ${photoVideoItems.length * getPhotoDuration()} ثانية` : "لم تُضف صور بعد.");
}

function movePhoto(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= photoVideoItems.length) return;
  [photoVideoItems[index], photoVideoItems[target]] = [photoVideoItems[target], photoVideoItems[index]];
  renderPhotoList();
  drawPhotoFrame(target);
}

function getPhotoDuration() {
  const value = Number(document.querySelector("#pv-duration")?.value || 3);
  return Number.isFinite(value) ? Math.min(30, Math.max(1, value)) : 3;
}

function changePhotoCanvasSize() {
  const canvas = document.querySelector("#pv-canvas");
  if (!canvas) return;
  const size = document.querySelector("#pv-size")?.value;
  if (size === "portrait") { canvas.width = 720; canvas.height = 1280; }
  else if (size === "square") { canvas.width = 1080; canvas.height = 1080; }
  else { canvas.width = 1280; canvas.height = 720; }
  drawPhotoFrame(0);
}

function drawPhotoFrame(index) {
  const canvas = document.querySelector("#pv-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = "#090d13";
  ctx.fillRect(0, 0, w, h);
  const item = photoVideoItems[index];
  if (item?.image?.complete && item.image.naturalWidth) {
    const scale = Math.min(w / item.image.naturalWidth, h / item.image.naturalHeight);
    const dw = item.image.naturalWidth * scale, dh = item.image.naturalHeight * scale;
    ctx.drawImage(item.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#dbe5f1";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("أضف صورًا لبدء صناعة الفيديو", w / 2, h / 2);
  }
  const title = document.querySelector("#pv-title-text")?.value?.trim();
  if (title) {
    const fontSize = Math.max(24, Math.round(w * 0.035));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    const y = h - Math.round(h * 0.09);
    ctx.fillStyle = "rgba(0,0,0,.62)";
    const maxWidth = w * 0.9;
    ctx.fillRect(w * 0.05, y - fontSize * 1.5, w * 0.9, fontSize * 2.1);
    ctx.fillStyle = "#fff";
    ctx.fillText(title, w / 2, y, maxWidth);
  }
}

function setPhotoStatus(message) {
  const status = document.querySelector("#pv-status");
  if (status) status.textContent = message;
}

async function previewPhotoSlideshow() {
  if (!photoVideoItems.length) { setPhotoStatus("أضف صورة واحدة على الأقل أولًا."); return; }
  const canvas = document.querySelector("#pv-canvas");
  const ctx = canvas.getContext("2d");
  const duration = getPhotoDuration();
  setPhotoStatus("معاينة متتابعة للصور…");
  for (let i = 0; i < photoVideoItems.length; i++) {
    if (!document.querySelector("#photo-video-panel")) return;
    drawPhotoFrame(i);
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
  }
  drawPhotoFrame(0);
  setPhotoStatus("انتهت المعاينة.");
}

async function createPhotoVideo() {
  if (photoVideoBusy || !photoVideoItems.length) return;
  const canvas = document.querySelector("#pv-canvas");
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    setPhotoStatus("المتصفح لا يدعم تصدير الفيديو مباشرة. جرّب Chrome محدّثًا على الهاتف أو الكمبيوتر.");
    return;
  }
  const duration = getPhotoDuration();
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    setPhotoStatus("هذا المتصفح لا يدعم صيغة الفيديو المتاحة للتصدير.");
    return;
  }
  photoVideoBusy = true;
  const create = document.querySelector("#pv-create");
  if (create) { create.disabled = true; create.textContent = "جارٍ إنشاء الفيديو…"; }
  let stream;
  try {
    stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
      recorder.addEventListener("error", event => reject(event.error || new Error("فشل تسجيل الفيديو")), { once: true });
    });
    recorder.start(1000);
    for (let i = 0; i < photoVideoItems.length; i++) {
      drawPhotoFrame(i);
      setPhotoStatus(`إنشاء الفيديو: الصورة ${i + 1} من ${photoVideoItems.length}`);
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    }
    recorder.stop();
    const blob = await finished;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cap-sut-photo-video.webm";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setPhotoStatus("اكتمل إنشاء الفيديو وبدأ التنزيل بصيغة WebM.");
  } catch (error) {
    setPhotoStatus("تعذّر إنشاء الفيديو: " + (error?.message || "خطأ غير معروف"));
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    photoVideoBusy = false;
    if (create) { create.disabled = photoVideoItems.length === 0; create.textContent = "إنشاء الفيديو وتنزيله"; }
  }
}

function escapePhotoText(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

const photoVideoObserver = new MutationObserver(installPhotoVideoButton);
if (document.querySelector("#app")) {
  photoVideoObserver.observe(document.querySelector("#app"), { childList: true, subtree: true });
  installPhotoVideoButton();
}
