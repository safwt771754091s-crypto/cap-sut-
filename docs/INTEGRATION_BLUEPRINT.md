# Cap sut — Global Video Platform Integration Blueprint

Status: architecture proposal; not a production-readiness claim.

## Product boundary
Cap sut remains the independent product and canonical home for the editor, project format, media library, render API, AI creation workflows, and developer SDK. Other repositories are evaluated as references or isolated services; they are not copied wholesale.

## Mobile-first operating model
The Android phone is the control plane: create projects, submit jobs, inspect progress, review previews, manage assets, and download/share finished exports. Heavy inference and FFmpeg rendering run on a remote worker/runtime. A phone-only setup cannot host the target video diffusion models reliably.

## Proposed subsystem map
- Editor and canonical timeline: keep the Cap sut project schema as the source of truth; extend it only through versioned migrations.
- Agent manager: one coordinator dispatches bounded roles: creative brief consultant, script/storyboard planner, technical architect, media researcher, generation operator, editor/timeline assembler, QA reviewer, and publishing assistant.
- Agent execution reference: OpenHands / software-agent-sdk are candidates for controlled coding and task execution, not runtime dependencies of every video request.
- Research reference: gpt-researcher can inform source-backed research workflows; isolate it behind a service interface.
- Deterministic video composition: HyperFrames is a strong candidate for HTML/CSS-to-video templates, motion graphics, captions, charts, and agent-authored compositions. Keep its Apache-2.0 notices and validate version compatibility before integration.
- AI video provider adapters: evaluate Wan2.2, LongCat-Video, and LTX-2 as independently deployable providers. Do not bundle model weights into Git; fetch approved weights at worker deployment after checking the exact model-weight license and hardware requirements.
- Template/agent patterns: selectively adapt examples from awesome-llm-apps and the owner's video-template repository only after file-level license and dependency review.
- Render core: FFmpeg-based deterministic rendering remains separate from generative inference.

## Required service contracts
Define a provider-neutral interface:
- createImage(request) -> job
- createVideo(request) -> job
- getJob(jobId) -> status/progress/result/error
- cancelJob(jobId) -> cancellation result
- health() -> provider capability and readiness

Use durable job records, idempotency keys, bounded retries, cancellation, quotas, artifact retention, and signed download URLs. Never report a job complete until the artifact is verified and downloadable.

## Job lifecycle
queued -> validating -> preparing -> generating -> assembling -> rendering -> verifying -> completed
Terminal alternatives: failed, cancelled, expired.

Persist timestamps, provider/model/version, prompt metadata, seed when supported, source asset references, output metadata, error category, and audit events. Do not store provider secrets in browser code or repository files.

## Phased delivery gates
1. Repository and license inventory; preserve main and existing draft PR #9 until separately reviewed.
2. Stabilize canonical project schema, upload API, render API, and automated tests.
3. Add durable asynchronous jobs and object-storage abstraction.
4. Add HyperFrames composition adapter and verify MP4 output.
5. Add agent manager with strict tool permissions and approval boundaries.
6. Add one free/open-weight video provider adapter only after a real GPU runtime is available and its model/weight license is verified.
7. Add mobile-first job dashboard, progress, retries, cancellation, and downloads.
8. Load, security, abuse, privacy, and cost testing before production claims.

## Non-goals and safeguards
- No blind merge of unrelated repositories.
- No Firebase dependency.
- No paid Golpo dependency.
- No secrets, API keys, or model weights committed to Git.
- No promise of unlimited free video generation: open-source code does not provide free GPU compute.
- Do not merge draft PR #9 into main as it depends on Golpo credentials and is not the selected free provider path.

## Initial acceptance criteria
- A user can submit a project from a mobile browser and see a durable job ID.
- Refreshing the page does not lose job state.
- A worker can render a deterministic test project and produce a verified MP4.
- A failed provider returns a clear error without corrupting the project.
- All imported components have recorded source, version, license, and notices.
