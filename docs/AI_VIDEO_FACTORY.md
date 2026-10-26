# Cap sut AI Video Factory — Prompt catalog integration

## What is connected

The web editor adds an **AI Video Factory** panel that loads the public catalog JSON from:

- Repository: https://github.com/safwt771754091s-crypto/awesome-opus5-5-videos
- Catalog source: https://raw.githubusercontent.com/safwt771754091s-crypto/awesome-opus5-5-videos/main/data/videos.json

The catalog is fetched on demand; it is not copied into the Cap sut repository. Users can search by prompt text, author, category, and technique, review the original source link, choose a prompt as a brief, copy it, or download a JSON brief with provenance metadata.

## Safety and licensing

- Treat every imported prompt as untrusted user content. The UI renders prompts as text and never executes prompt contents as JavaScript, shell commands, or API instructions.
- Never copy API keys or secrets mentioned in a prompt. Provider credentials belong on the server, never in browser code.
- The source repository's MIT license does not automatically license third-party videos, images, music, logos, or referenced source material. Preserve attribution and check rights before commercial use.
- Prompt selection is a brief-preparation feature. It does **not** claim to generate AI footage by itself.

## Architecture boundary

Cap sut's Project/Timeline schema and shared renderer remain authoritative. The next production milestone is a server-side provider adapter that converts a reviewed brief into a validated, editable Cap sut project, followed by render-job status, storage, authentication, quota controls, and end-to-end tests.

## Publish plan

The GitHub Pages workflow publishes the static editor and prompt catalog panel. The Rust API/render service must be deployed separately. Do not expose the current render API publicly until authentication, upload quotas, storage policy, and strict asset-path validation are implemented; its current permissive CORS and filesystem-based media handling are development-grade.
