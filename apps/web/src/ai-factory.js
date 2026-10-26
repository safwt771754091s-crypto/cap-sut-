const SOURCE_DATA = "https://raw.githubusercontent.com/safwt771754091s-crypto/مكتبة الأفكار الأصلية/main/data/videos.json";
const SOURCE_REPO = "https://github.com/safwt771754091s-crypto/مكتبة الأفكار الأصلية";
let catalog = [];
let catalogLoaded = false;
let loading = false;
let activePrompt = null;

const escapeText = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const appRoot = document.querySelector("#app");

function addFactoryButton() {
  const topbar = appRoot?.querySelector(".topbar");
  if (!topbar || topbar.querySelector("#ai-factory-open")) return;
  const button = document.createElement("button");
  button.id = "ai-factory-open";
  button.className = "ai-factory-launch";
  button.textContent = "مصنع الفيديو بالذكاء الاصطناعي";
  button.title = "تصفح أفكار وموجّهات الفيديو";
  const exportButton = topbar.querySelector("#export");
  if (exportButton) topbar.insertBefore(button, exportButton);
  else topbar.append(button);
  button.addEventListener("click", openFactory);
}

function openFactory() {
  document.querySelector("#ai-factory-panel")?.remove();
  const panel = document.createElement("div");
  panel.id = "ai-factory-panel";
  panel.className = "ai-factory-panel";
  panel.innerHTML = `
    <section class="ai-factory-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-factory-title">
      <div class="ai-factory-top">
        <div><h2 id="ai-factory-title">مصنع الفيديو بالذكاء الاصطناعي · مكتبة الأفكار</h2><div class="ai-factory-help">استكشف مكتبة الأفكار والموجّهات، اختر فكرة، ثم عدّل موجّهك واحفظه كملف Brief لاستخدامه في سير عمل إنتاج الفيديو.</div></div>
        <span class="spacer"></span><button id="ai-factory-close" aria-label="إغلاق">إغلاق ✕</button>
      </div>
      <div class="ai-factory-status" id="ai-factory-status">لم يتم تحميل المكتبة بعد.</div>
      <div class="ai-factory-controls">
        <input id="ai-factory-search" type="search" placeholder="ابحث في الأفكار والموجّهات…" aria-label="ابحث في أفكار الفيديو">
        <select id="ai-factory-category" aria-label="تصفية حسب الفئة"><option value="">كل الأنواع</option></select>
      </div>
      <div class="ai-factory-results" id="ai-factory-results"></div>
      <div class="ai-factory-brief-wrap">
        <h3>موجّه الفيديو</h3>
        <p class="ai-factory-help">هذه الخطوة تجهّز الموجّه فقط؛ توليد المشاهد بالذكاء الاصطناعي يحتاج موفّرًا مضبوطًا على الخادم. لن يتم تشغيل نصوص المكتبة ككود.</p>
        <textarea class="ai-factory-brief" id="ai-factory-brief" placeholder="اختر فكرة من المكتبة أو اكتب موجّهك هنا…"></textarea>
        <div class="ai-factory-top"><button id="ai-factory-copy">نسخ الموجّه</button><button id="ai-factory-download" class="primary">حفظ الموجّه بصيغة JSON</button></div>
      </div>
      <div class="ai-factory-legal">المصدر: <a href="${SOURCE_REPO}" target="_blank" rel="noopener noreferrer">مكتبة الأفكار الأصلية</a>. Each entry retains its author/source links. The repository license does not automatically grant rights to third-party videos, images, music, or referenced assets.</div>
    </section>`;
  document.body.append(panel);
  panel.addEventListener("click", event => { if (event.target === panel) panel.remove(); });
  panel.querySelector("#ai-factory-close").addEventListener("click", () => panel.remove());
  panel.querySelector("#ai-factory-search").addEventListener("input", renderResults);
  panel.querySelector("#ai-factory-category").addEventListener("change", renderResults);
  panel.querySelector("#ai-factory-copy").addEventListener("click", copyBrief);
  panel.querySelector("#ai-factory-download").addEventListener("click", saveBrief);
  loadCatalog();
}

async function loadCatalog() {
  const status = document.querySelector("#ai-factory-status");
  if (!status) return;
  if (catalogLoaded) { populateCategories(); renderResults(); return; }
  if (loading) return;
  loading = true;
  status.textContent = "جارٍ تحميل المكتبة من المستودع الأصلي…";
  try {
    const response = await fetch(SOURCE_DATA, {cache:"no-cache"});
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Unexpected catalog format");
    catalog = data.filter(item => item && typeof item.prompt === "string" && item.slug);
    catalogLoaded = true;
    populateCategories();
    renderResults();
    status.textContent = `تم تحميل ${catalog.length} فكرة من المستودع الأصلي. اختر فكرة لمراجعتها.`;
  } catch (error) {
    status.textContent = "تعذّر تحميل المكتبة الآن: " + error.message + ". يمكنك المحاولة لاحقًا؛ لن تتعطل أدوات التحرير اليدوي.";
    const results = document.querySelector("#ai-factory-results");
    if (results) results.innerHTML = '<p class="ai-factory-help">تعذّر الوصول إلى مصدر المكتبة. تحقق من الاتصال ثم أغلق النافذة وأعد فتحها.</p>';
  } finally {
    loading = false;
  }
}

function populateCategories() {
  const select = document.querySelector("#ai-factory-category");
  if (!select || select.dataset.ready) return;
  const categories = [...new Set(catalog.map(item => item.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">كل الأنواع</option>' + categories.map(category => `<option value="${escapeText(category)}">${escapeText(category)}</option>`).join("");
  select.dataset.ready = "true";
}

function renderResults() {
  const results = document.querySelector("#ai-factory-results");
  if (!results) return;
  const query = (document.querySelector("#ai-factory-search")?.value || "").trim().toLowerCase();
  const category = document.querySelector("#ai-factory-category")?.value || "";
  const matches = catalog.filter(item => (!category || item.category === category) &&
    (!query || [item.slug,item.author,item.category,item.prompt,...(item.tech_tags || [])].join(" ").toLowerCase().includes(query))).slice(0, 60);
  if (!matches.length) {
    results.innerHTML = '<p class="ai-factory-help">لا توجد نتائج مطابقة. جرّب كلمة أخرى.</p>';
    return;
  }
  results.innerHTML = matches.map((item, index) => `
    <article class="ai-factory-item">
      <strong>${escapeText(item.slug.replace(/-/g," "))}</strong>
      <div class="meta">${escapeText(item.category || "غير مصنّف")} · ${escapeText(item.author || "مؤلف غير معروف")} · ${escapeText((item.tech_tags || []).join(", "))}</div>
      <p>${escapeText(item.prompt.slice(0, 380))}${item.prompt.length > 380 ? "…" : ""}</p>
      <div class="ai-factory-top">
        <button data-use-prompt="${index}">استخدام كفكرة</button>
        ${item.post_url ? `<a href="${escapeText(item.post_url)}" target="_blank" rel="noopener noreferrer">المصدر الأصلي</a>` : ""}
      </div>
    </article>`).join("");
  results.querySelectorAll("[data-use-prompt]").forEach(button => button.addEventListener("click", () => {
    const item = matches[Number(button.dataset.usePrompt)];
    activePrompt = item;
    const brief = document.querySelector("#ai-factory-brief");
    if (brief) {
      brief.value = item.prompt;
      brief.focus();
    }
    const status = document.querySelector("#ai-factory-status");
    if (status) status.textContent = "تم اختيار الفكرة. راجع الموجّه وحقوق الأصول قبل استخدامه.";
  }));
}

async function copyBrief() {
  const brief = document.querySelector("#ai-factory-brief")?.value || "";
  if (!brief.trim()) { alert("اكتب موجّهًا أو اختر فكرة أولًا."); return; }
  try {
    await navigator.clipboard.writeText(brief);
    const status = document.querySelector("#ai-factory-status");
    if (status) status.textContent = "تم نسخ الموجّه.";
  } catch {
    const field = document.querySelector("#ai-factory-brief");
    field?.select();
    alert("تعذّر النسخ التلقائي؛ تم تحديد النص لتنسخه يدويًا.");
  }
}

function saveBrief() {
  const prompt = document.querySelector("#ai-factory-brief")?.value || "";
  if (!prompt.trim()) { alert("اكتب موجّهًا أو اختر فكرة أولًا."); return; }
  const payload = {
    schema_version: "capsut.video-brief.v1",
    title: activePrompt?.slug || "موجّه-الفيديو-الخاص-بي",
    prompt,
    source_repository: SOURCE_REPO,
    source_prompt_url: activePrompt?.post_url || null,
    source_author: activePrompt?.author || null,
    category: activePrompt?.category || null,
    created_at: new Date().toISOString(),
    note: "راجع سلامة الموجّه وحقوق الأصول ومتطلبات مزوّد الخدمة قبل الإنتاج."
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "capsut-video-brief.json";
  link.click();
  URL.revokeObjectURL(url);
}

if (appRoot) {
  new MutationObserver(addFactoryButton).observe(appRoot, {childList:true,subtree:true});
  addFactoryButton();
}
