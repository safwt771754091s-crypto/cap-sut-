# Engineering Sources

The owner granted access to seven repositories. Cap sut uses them as engineering references, with Alfaeq Yemen explicitly excluded from this project's implementation boundary.

## 1. OpenCut / existing editor direction
Primary reference for editor architecture, Rust core direction, FFmpeg/media work, desktop shell, web editor structure, and future headless rendering. Cap sut should learn from the architecture rather than blindly copy unfinished code.

## 2. open-edit
Reference for agent-driven video workflows, transcription, generation, media transformations, resumable paid jobs, and the idea of turning generated work into an editable project. Its repository license is Apache-2.0; any direct reuse must preserve its license/notice requirements and attribution.

## 3. archify
Reference for deterministic artifact generation, typed intermediate representations, validation gates, source-grounded outputs, and agent-friendly workflows. Its repository license is MIT. We can reuse patterns, not its product identity.

## 4. gaia
Reference for specialist-agent orchestration, persistent local memory, contracts for work results, approval gates, and command-risk classification. Its repository license is MIT. These patterns are useful for the AI Video Factory and safe automation layer.

## 5. claude-code-skills
Reference for production skill packaging, validation, security scanning, provenance, structured workflows and reusable agent capabilities. Its repository license is MIT.

## 6. OpenWA
Reference for pluggable adapters, scoped API keys, dashboard/API separation, multi-session architecture, Docker deployment, audit/security boundaries, and integration patterns. Its repository license is MIT. These patterns inform the developer platform, not the video engine itself.

## 7. Alfaeq Yemen
Accessible for comparison only. It is NOT a Cap sut dependency, integration target, data source, authentication provider, or deployment component. No Cap sut code should be committed to Alfaeq and no Alfaeq code should be copied into Cap sut without a separately reviewed licensing and architecture decision.

## Selection rule

Before importing code from any source, check: license, dependency footprint, maturity, tests, security boundary, and whether the component matches Cap sut's shared project/timeline/rendering contract. Prefer extracting a small well-defined pattern over copying an entire subsystem.

## Target synthesis

OpenCut/editor engineering + open-edit AI media workflows + Gaia/Claude skills agent safety + Archify deterministic validation + OpenWA adapter/API security patterns -> one independent Cap sut platform with a shared editable project model and shared renderer.