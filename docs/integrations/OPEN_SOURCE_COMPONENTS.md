# Cap sut — Open-source integration plan

Cap sut remains an independent product. These repositories are connected as isolated engineering sources, not copied wholesale into the browser bundle.

## 1. OpenMontage — agentic video production

- Owner repository: https://github.com/safwt771754091s-crypto/OpenMontage
- Upstream: https://github.com/calesthio/OpenMontage
- License: AGPL-3.0.
- Target role: optional production-orchestration service for research, scripting, shot planning, asset generation, composition, and render orchestration.
- Boundary: communicate with Cap sut through a versioned job/project API. Keep the service isolated from the editor and perform an AGPL network-use/distribution review before deployment or modification.

## 2. BitNet — local language-model inference

- Owner repository: https://github.com/safwt771754091s-crypto/BitNet
- Upstream: https://github.com/microsoft/BitNet
- License: MIT.
- Target role: optional local inference backend for prompt improvement, story/script drafting, scene planning, and agent assistance.
- Boundary: run as a separate native service on supported CPU/GPU hardware. It is not a video generator. Model downloads, RAM/CPU requirements, and supported architectures must be checked on the target server before enabling it.

## 3. Everything — selective application catalog

- Owner repository: https://github.com/safwt771754091s-crypto/everything
- Upstream: https://github.com/HeyPuter/everything
- License: MIT.
- Target role: source of selected creative/productivity tools that can complement a creator workspace.
- Boundary: do not bundle the entire monorepo. Select individual apps only after checking each app's runtime, dependencies, security posture, and license notices. Integrate via separately deployed apps or explicit links/SSO adapters.

## Integration rules

1. Keep all three upstream projects independently versioned and retain their license notices.
2. Never copy secrets, provider keys, user media, or credentials into these source repositories.
3. All generated media and jobs remain owned by the authenticated Cap sut account.
4. OpenMontage and BitNet are optional services; Cap sut's editor and fal/Cloudflare generation path must continue to work if either is offline.
5. The `integrations/sources.json` file is the machine-readable source registry. It does not claim that upstream source code has already been vendored or deployed.

## Current implemented video generation

- Text prompt → fal.ai Wan 2.7 text-to-video queue.
- Still image + motion prompt → fal.ai Wan 2.7 image-to-video queue.
- Completed MP4/WebM → private owner-scoped Cloudflare R2 storage and D1 asset record.

Production generation still requires owner-provisioned Cloudflare D1/R2 resources and a valid fal API key. fal inference is metered/paid; no free unlimited generation is implied.
