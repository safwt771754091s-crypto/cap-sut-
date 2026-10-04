use serde::{Deserialize, Serialize};

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
pub enum MediaValidationError { EmptyId, EmptyUri, InvalidMimeType }

pub fn validate_asset(asset: &MediaAsset) -> Result<(), Vec<MediaValidationError>> {
    let mut errors = Vec::new();
    if asset.id.trim().is_empty() { errors.push(MediaValidationError::EmptyId); }
    if asset.uri.trim().is_empty() { errors.push(MediaValidationError::EmptyUri); }
    if !asset.mime_type.contains('/') { errors.push(MediaValidationError::InvalidMimeType); }
    if errors.is_empty() { Ok(()) } else { Err(errors) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn asset_contract_is_validated() {
        let asset = MediaAsset { id: "a1".into(), uri: "file:///clip.mp4".into(), mime_type: "video/mp4".into(), metadata: MediaMetadata { duration_seconds: Some(4.0), width: Some(1920), height: Some(1080), has_audio: true, video_codec: Some("h264".into()), audio_codec: Some("aac".into()) } };
        assert!(validate_asset(&asset).is_ok());
    }
}
