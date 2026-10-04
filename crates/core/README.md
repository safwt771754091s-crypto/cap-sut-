# Cap sut Core

Canonical project and timeline semantics. UI frameworks, AI providers and cloud services must not be dependencies of this crate.

Responsibilities: project schema/versioning, stable IDs, assets, tracks, clips, time ranges, validation, edit-operation contracts, serialization and migration boundaries.

The same model is consumed by the web editor, AI factory and renderer.