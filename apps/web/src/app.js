const state = {
  project: {
    schema_version: "0.1.0",
    project: { id: "capsut-web", name: "Untitled Project", width: 1280, height: 720, frame_rate: { numerator: 30, denominator: 1 } },
    assets: [],
    timeline: { duration_seconds: 0, tracks: [] }
  },
  selectedTrack: null,
  selectedClip: null,
  previewUrl: null
};

const app = document.querySelector("#app");

function ensureVideoTrack() {
  let track = state.project.timeline.tracks.find(t => t.kind === "video");
  if (!track) {
    track = { id: "video-1", kind: "video", clips: [] };
    state.project.timeline.tracks.push(track);
  }
  return track;
}

function render() {
  const videoTrack = state.project.timeline.tracks.find(t => t.kind === "video");
  const clips = videoTrack?.clips ?? [];
  const selected = state.selectedClip;
  app.innerHTML = `
    <header class="topbar">
      <strong>Cap sut</strong>
      <span class="badge">Studio MVP</span>
      <span class="spacer"></span>
      <button id="new">New</button>
      <button id="open">Open</button>
      <button id="save">Save</button>
      <button class="primary" id="export">Export MP4</button>
    </header>
    <main class="workspace">
      <aside class="panel assets">
        <h2>Media</h2>
        <label class="drop">
          Import media
          <input id="media" type="file" accept="video/*,audio/*,image/*" multiple>
        </label>
        <div id="asset-list">${state.project.assets.map(a => '<div class="asset" title="'+a.name+'">'+a.name+'</div>').join("")}</div>
      </aside>
      <section class="center">
        <div class="preview-wrap">
          <video id="preview" controls playsinline></video>
          <div id="empty" class="empty">Import a video to begin</div>
        </div>
        <div class="transport">
          <button id="play">Play</button>
          <span id="time">0.00s</span>
          <input id="scrub" type="range" min="0" max="0" step="0.01" value="0">
        </div>
        <div class="timeline">
          <div class="timeline-head"><h2>Timeline</h2><span>${state.project.timeline.duration_seconds.toFixed(2)}s</span></div>
          <div class="track">
            <span class="track-label">Video</span>
            <div class="clips">${clips.map(c => `
              <button class="clip ${selected === c.id ? "selected" : ""}" data-clip="${c.id}" style="width:${Math.max(120, c.timeline_duration * 90)}px">
                ${assetName(c.asset_id)}
              </button>`).join("")}</div>
          </div>
        </div>
      </section>
      <aside class="panel inspector">
        <h2>Inspector</h2>
        ${selected ? inspector(selected) : '<p class="muted">Select a clip.</p>'}
      </aside>
    </main>
  `;
  bind();
}

function assetName(id) {
  return state.project.assets.find(a => a.id === id)?.name ?? id;
}

function inspector(id) {
  const clip = state.project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === id);
  if (!clip) return "";
  return `
    <label>Start<input id="start" type="number" step="0.01" value="${clip.timeline_start_seconds}"></label>
    <label>Source In<input id="in" type="number" step="0.01" value="${clip.source_in_seconds}"></label>
    <label>Source Out<input id="out" type="number" step="0.01" value="${clip.source_out_seconds}"></label>
    <button id="split">Split at midpoint</button>
  `;
}

function bind() {
  document.querySelector("#media")?.addEventListener("change", e => {
    for (const file of e.target.files) importFile(file);
  });
  document.querySelector("#play")?.addEventListener("click", () => {
    const v = document.querySelector("#preview");
    v.paused ? v.play() : v.pause();
  });
  document.querySelector("#preview")?.addEventListener("timeupdate", syncPreview);
  document.querySelector("#scrub")?.addEventListener("input", e => {
    document.querySelector("#preview").currentTime = Number(e.target.value);
  });
  document.querySelectorAll("[data-clip]").forEach(b => b.onclick = () => { state.selectedClip = b.dataset.clip; render(); });
  document.querySelector("#new")?.addEventListener("click", newProject);
  document.querySelector("#save")?.addEventListener("click", saveProject);
  document.querySelector("#open")?.addEventListener("click", openProject);
  document.querySelector("#export")?.addEventListener("click", exportProject);
  document.querySelector("#split")?.addEventListener("click", splitSelected);
  for (const [id,key] of [["start","timeline_start_seconds"],["in","source_in_seconds"],["out","source_out_seconds"]]) {
    document.querySelector("#"+id)?.addEventListener("change", e => updateClip(key, Number(e.target.value)));
  }
  refreshPreview();
}

async function importFile(file) {
  const id = crypto.randomUUID();
  const url = URL.createObjectURL(file);
  const asset = { id, name: file.name, uri: url, server_uri: null, mime_type: file.type || "application/octet-stream", duration_seconds: 0 };
  state.project.assets.push(asset);
  const track = ensureVideoTrack();
  const clip = { id: crypto.randomUUID(), asset_id: id, timeline_start_seconds: state.project.timeline.duration_seconds, source_in_seconds: 0, source_out_seconds: 0, timeline_duration: 0 };
  const probe = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
  probe.preload = "metadata";
  probe.src = url;
  probe.onloadedmetadata = async () => {
    asset.duration_seconds = Number.isFinite(probe.duration) ? probe.duration : 0;
    if (file.type.startsWith("video/")) {
      try {
        const endpoint = prompt("Cap sut API URL", "http://localhost:8080");
        if (!endpoint) throw new Error("API URL is required for server export");
        const form = new FormData();
        form.append("media", file, file.name);
        const response = await fetch(endpoint.replace(/\\/$/, "") + "/v1/assets", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Media upload failed");
        asset.server_uri = body.uri;
        asset.uri = body.uri;
      } catch (error) {
        alert("Media upload failed: " + error.message);
        return;
      }
    }
    clip.source_out_seconds = asset.duration_seconds;
    clip.timeline_duration = asset.duration_seconds;
    state.project.timeline.duration_seconds += asset.duration_seconds;
    track.clips.push(clip);
    state.selectedClip = clip.id;
    render();
  };
  probe.load();
}

function updateClip(key,value) {
  const clip = findClip();
  if (!clip || !Number.isFinite(value)) return;
  clip[key] = value;
  clip.timeline_duration = Math.max(0, clip.source_out_seconds - clip.source_in_seconds);
  recomputeDuration();
  render();
}

function splitSelected() {
  const clip = findClip();
  if (!clip) return;
  const duration = clip.source_out_seconds - clip.source_in_seconds;
  if (duration <= 0.02) return;
  const mid = clip.source_in_seconds + duration / 2;
  const second = { ...clip, id: crypto.randomUUID(), source_in_seconds: mid, timeline_start_seconds: clip.timeline_start_seconds + duration / 2, timeline_duration: duration / 2 };
  clip.source_out_seconds = mid;
  clip.timeline_duration = duration / 2;
  const track = state.project.timeline.tracks.find(t => t.clips.some(c => c.id === clip.id));
  track.clips.splice(track.clips.findIndex(c => c.id === clip.id)+1,0,second);
  recomputeDuration();
  state.selectedClip = second.id;
  render();
}

function findClip() {
  return state.project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === state.selectedClip);
}

function recomputeDuration() {
  state.project.timeline.duration_seconds = Math.max(0, ...state.project.timeline.tracks.flatMap(t => t.clips.map(c => c.timeline_start_seconds + c.timeline_duration)));
}

function syncPreview() {
  const v = document.querySelector("#preview");
  if (!v) return;
  document.querySelector("#time").textContent = v.currentTime.toFixed(2) + "s";
  const s = document.querySelector("#scrub");
  s.max = v.duration || 0;
  s.value = v.currentTime;
}

function refreshPreview() {
  const clip = state.project.timeline.tracks.flatMap(t => t.clips)[0];
  const asset = clip && state.project.assets.find(a => a.id === clip.asset_id);
  const v = document.querySelector("#preview");
  document.querySelector("#empty").hidden = !!asset;
  if (asset && v.src !== asset.uri) v.src = asset.uri;
}

function newProject() {
  state.project = { schema_version:"0.1.0", project:{id:crypto.randomUUID(),name:"Untitled Project",width:1280,height:720,frame_rate:{numerator:30,denominator:1}},assets:[],timeline:{duration_seconds:0,tracks:[]} };
  state.selectedClip = null;
  render();
}

function saveProject() {
  const payload = JSON.stringify(state.project, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([payload], {type:"application/json"}));
  a.download = (state.project.project.name || "capsut-project") + ".json";
  a.click();
}

function openProject() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json,application/json";
  input.onchange = async () => {
    const parsed = JSON.parse(await input.files[0].text());
    if (parsed.schema_version !== "0.1.0") throw new Error("Unsupported Cap sut schema");
    state.project = parsed;
    state.selectedClip = null;
    render();
  };
  input.click();
}

async function exportProject() {
  const endpoint = prompt("Cap sut API URL", "http://localhost:8080/v1/renders");
  if (!endpoint) return;
  for (const asset of state.project.assets) {
    if (asset.server_uri) asset.uri = asset.server_uri;
  }
  const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:state.project,format:"mp4"})});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Render failed");
  alert("Render complete: " + body.artifact.uri);
}

render();
