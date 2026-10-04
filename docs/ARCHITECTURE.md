# Architecture

Cap sut uses one shared core for three products: the manual editor, the AI Video Factory, and the developer/company rendering platform.

Flow: Manual Editor + AI Factory + Developer API -> Shared Project/Timeline Model -> Render Engine.

The web app is presentation and interaction. The API handles authentication, validation, project persistence, render jobs and webhooks. The Rust core owns canonical project/timeline semantics. Media owns probing and FFmpeg boundaries. Render owns render planning and verified artifacts. The AI service turns a brief into an ordinary editable project.

Non-negotiables: AI output remains editable; rendering is shared; IDs and schema versions are stable; render submission is idempotent; secrets never enter projects/events/client bundles; unsupported required schema features fail loudly.

Cap sut is independent from Alfaeq Yemen.