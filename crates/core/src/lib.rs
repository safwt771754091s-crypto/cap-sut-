use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RationalFrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: RationalFrameRate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssetRef {
    pub id: String,
    pub uri: String,
    pub mime_type: String,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
    pub timeline_start_seconds: f64,
    pub source_in_seconds: f64,
    pub source_out_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Track {
    pub id: String,
    pub kind: String,
    pub clips: Vec<Clip>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Timeline {
    pub duration_seconds: f64,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub schema_version: String,
    pub project: ProjectInfo,
    pub assets: Vec<AssetRef>,
    pub timeline: Timeline,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ValidationError {
    EmptyId(&'static str),
    InvalidDimensions,
    InvalidFrameRate,
    NegativeTime(&'static str),
    InvalidClipRange,
    MissingAsset(String),
    InvalidTrackKind(String),
}

impl Project {
    pub fn validate(&self) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        if self.project.id.is_empty() { errors.push(ValidationError::EmptyId("project")); }
        if self.project.width == 0 || self.project.height == 0 { errors.push(ValidationError::InvalidDimensions); }
        if self.project.frame_rate.numerator == 0 || self.project.frame_rate.denominator == 0 { errors.push(ValidationError::InvalidFrameRate); }
        if self.timeline.duration_seconds < 0.0 { errors.push(ValidationError::NegativeTime("timeline duration")); }

        let asset_ids: std::collections::HashSet<&str> = self.assets.iter().map(|a| a.id.as_str()).collect();
        const KINDS: &[&str] = &["video", "audio", "image", "text", "subtitle", "overlay"];
        for track in &self.timeline.tracks {
            if track.id.is_empty() { errors.push(ValidationError::EmptyId("track")); }
            if !KINDS.contains(&track.kind.as_str()) { errors.push(ValidationError::InvalidTrackKind(track.kind.clone())); }
            for clip in &track.clips {
                if clip.id.is_empty() { errors.push(ValidationError::EmptyId("clip")); }
                if !asset_ids.contains(clip.asset_id.as_str()) { errors.push(ValidationError::MissingAsset(clip.asset_id.clone())); }
                if clip.timeline_start_seconds < 0.0 { errors.push(ValidationError::NegativeTime("clip timeline start")); }
                if clip.source_in_seconds < 0.0 || clip.source_out_seconds < 0.0 || clip.source_out_seconds <= clip.source_in_seconds {
                    errors.push(ValidationError::InvalidClipRange);
                }
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Project {
        Project {
            schema_version: "0.1.0".into(),
            project: ProjectInfo { id: "p1".into(), name: "Test".into(), width: 1920, height: 1080, frame_rate: RationalFrameRate { numerator: 30, denominator: 1 } },
            assets: vec![AssetRef { id: "a1".into(), uri: "file:///video.mp4".into(), mime_type: "video/mp4".into(), duration_seconds: Some(10.0) }],
            timeline: Timeline { duration_seconds: 5.0, tracks: vec![Track { id: "t1".into(), kind: "video".into(), clips: vec![Clip { id: "c1".into(), asset_id: "a1".into(), timeline_start_seconds: 0.0, source_in_seconds: 0.0, source_out_seconds: 5.0 }] }] },
        }
    }

    #[test]
    fn valid_project_passes() { assert!(fixture().validate().is_ok()); }

    #[test]
    fn missing_asset_fails() {
        let mut p = fixture();
        p.timeline.tracks[0].clips[0].asset_id = "missing".into();
        assert!(p.validate().is_err());
    }
}
