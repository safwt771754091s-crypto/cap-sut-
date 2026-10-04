# Project Format v0.1

The project format is the compatibility contract between editor, AI factory and renderer.

Example fields: schemaVersion, project(id/name/width/height/frameRate), assets, timeline(durationSeconds/tracks), metadata(createdAt/updatedAt).

Track kinds: video, audio, image, text, subtitle, overlay.

A clip references an asset and contains timelineStartSeconds, sourceInSeconds and sourceOutSeconds. Optional transform, audio, effect and transition fields are versioned extensions.

Binary media is never embedded in project JSON. AI provenance is optional metadata and must never be required to open, edit or render a project.

Timing and schema migrations must be explicit and tested.