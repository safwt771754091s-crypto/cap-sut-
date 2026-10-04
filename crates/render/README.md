# Rendering Engine

Shared renderer for manual exports, AI projects and developer/company workloads.

Lifecycle: queued -> running -> completed, failed or cancelled.

The renderer validates a project before execution, generates a deterministic render plan, enforces resource limits, supports cancellation/progress, and verifies the output artifact before reporting success.

MVP target: real FFmpeg-backed MP4 rendering. Headless and batch rendering use this same renderer rather than a second implementation.