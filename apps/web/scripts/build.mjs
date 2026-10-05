import { mkdir, cp } from "node:fs/promises";
await mkdir("dist", {recursive:true});
await cp("index.html","dist/index.html");
await cp("src","dist/src",{recursive:true});
console.log("Cap sut web build complete");
