import { mkdir, cp } from "node:fs/promises";
await mkdir("dist", {recursive:true});
await cp("index.html","dist/index.html");
await cp("editor.html","dist/editor.html");
await cp("manifest.webmanifest","dist/manifest.webmanifest");
await cp("sw.js","dist/sw.js");
await cp("icon.svg","dist/icon.svg");
await cp("src","dist/src",{recursive:true});
console.log("Cap sut landing page, editor and PWA assets built");