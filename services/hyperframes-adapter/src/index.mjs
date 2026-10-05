import { readFile, writeFile } from "node:fs/promises";

export function compositionHtml(project) {
  const width = project.project.width;
  const height = project.project.height;
  const duration = project.timeline.duration_seconds;
  const clips = project.timeline.tracks.flatMap(t => t.clips).filter(c => c.kind === "composition");
  const nodes = clips.map((clip, i) => {
    const text = String(clip.text ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    return '<div class="clip" data-start="' + clip.timeline_start_seconds + '" data-duration="' + clip.timeline_duration + '" data-track-index="' + i + '">' + text + '</div>';
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;overflow:hidden}#root{position:relative;width:${width}px;height:${height}px;color:white;font-family:Inter,Arial,sans-serif}.clip{position:absolute;inset:0;display:grid;place-items:center;font-size:72px}
  </style></head><body><div id="root" data-composition-id="${project.project.id}" data-start="0" data-width="${width}" data-height="${height}" data-duration="${duration}">
  ${nodes}
  </div></body></html>`;
}

if (process.argv[1]?.endsWith("index.mjs")) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: node index.mjs project.json output.html");
  const project = JSON.parse(await readFile(input, "utf8"));
  await writeFile(output, compositionHtml(project));
}
