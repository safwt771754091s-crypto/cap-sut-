import { mkdir, cp } from "node:fs/promises";
await mkdir("dist", {recursive:true});
for (const file of ["index.html","editor.html","manifest.webmanifest","sw.js","icon.svg"]) await cp(file, "dist/" + file);
await cp("src","dist/src",{recursive:true});
console.log("Cap sut landing page, editor, AI creation UI and PWA assets built");