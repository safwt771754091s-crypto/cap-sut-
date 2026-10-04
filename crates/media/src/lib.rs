use serde::{Deserialize, Serialize};
use std::{path::{Path, PathBuf}, process::Command};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MediaMetadata {
    pub duration_seconds: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MediaAsset {
    pub id: String,
    pub uri: String,
    pub mime_type: String,
    pub metadata: MediaMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaValidationError {
    EmptyId,
    EmptyUri,
    InvalidMimeType,
}

pub fn validate_asset(asset: &MediaAsset) -> Result<(), Vec<MediaValidationError>> {
    let mut errors = Vec::new();
    if asset.id.trim().is_empty() { errors.push(MediaValidationError::EmptyId); }
    if asset.uri.trim().is_empty() { errors.push(MediaValidationError::EmptyUri); }
    if !asset.mime_type.contains('/') { errors.push(MediaValidationError::InvalidMimeType); }
    if errors.is_empty() { Ok(()) } else { Err(errors) }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaProbeError {
    InvalidUri,
    CommandFailed(i32),
    InvalidJson,
    MissingFormat,
}

#[derive(Debug, Clone, Deserialize)]
struct ProbeDocument {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Debug, Clone, Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

pub fn local_media_path(uri: &str) -> Result<PathBuf, MediaProbeError> {
    if let Some(path) = uri.strip_prefix("file://") {
        let path = path.strip_prefix('/').map_or(path, |p| format!("/{p}").leak());
        return Ok(PathBuf::from(path));
    }
    if uri.contains("://") {
        return Err(MediaProbeError::InvalidUri);
    }
    Ok(PathBuf::from(uri))
}

pub fn probe_with_ffprobe(uri: &str, ffprobe_bin: &Path) -> Result<MediaMetadata, MediaProbeError> {
    let input = local_media_path(uri)?;
    let output = Command::new(ffprobe_bin)
        .args([
            "-v", "error",
            "-show_streams",
            "-show_format",
            "-of", "json",
        ])
        .arg(&input)
        .output()
        .map_err(|_| MediaProbeError::CommandFailed(-1))?;

    if !output.status.success() {
        return Err(MediaProbeError::CommandFailed(output.status.code().unwrap_or(-1)));
    }

    let doc: ProbeDocument = serde_json::from_slice(&output.stdout)
        .map_err(|_| MediaProbeError::InvalidJson)?;
    if doc.format.duration.is_none() {
        return Err(MediaProbeError::MissingFormat);
    }

    let video = doc.streams.iter().find(|s| s.codec_type.as_deref() == Some("video"));
    let audio = doc.streams.iter().find(|s| s.codec_type.as_deref() == Some("audio"));

    Ok(MediaMetadata {
        duration_seconds: doc.format.duration.and_then(|v| v.parse().ok()),
        width: video.and_then(|s| s.width),
        height: video.and_then(|s| s.height),
        has_audio: audio.is_some(),
        video_codec: video.and_then(|s| s.codec_name.clone()),
        audio_codec: audio.and_then(|s| s.codec_name.clone()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_contract_is_validated() {
        let asset = MediaAsset {
            id: "a1".into(),
            uri: "file:///clip.mp4".into(),
            mime_type: "video/mp4".into(),
            metadata: MediaMetadata {
                duration_seconds: Some(4.0),
                width: Some(1920),
                height: Some(1080),
                has_audio: true,
                video_codec: Some("h264".into()),
                audio_codec: Some("aac".into()),
            },
        };
        assert!(validate_asset(&asset).is_ok());
    }

    #[test]
    fn remote_uri_is_not_accepted_by_local_renderer() {
        assert_eq!(local_media_path("https://example.com/a.mp4"), Err(MediaProbeError::InvalidUri));
    }

    #[test]
    fn local_path_is_preserved() {
        assert_eq!(local_media_path("/tmp/a.mp4").unwrap(), PathBuf::from("/tmp/a.mp4"));
    }
}
