use capsut_core::Project;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RenderJobState { Queued, Running, Completed, Failed, Cancelled }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderRequest {
    pub job_id: String,
    pub project: Project,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderArtifact {
    pub uri: String,
    pub mime_type: String,
    pub size_bytes: u64,
}

pub fn validate_render_request(request: &RenderRequest) -> Result<(), String> {
    request.project.validate().map_err(|errors| format!("invalid project: {errors:?}"))?;
    if request.job_id.is_empty() { return Err("job_id is required".into()); }
    if request.format.is_empty() { return Err("format is required".into()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_project_is_rejected_before_rendering() {
        let project = Project {
            schema_version: "0.1.0".into(),
            project: capsut_core::ProjectInfo { id: "p".into(), name: "x".into(), width: 0, height: 1080, frame_rate: capsut_core::RationalFrameRate { numerator: 30, denominator: 1 } },
            assets: vec![],
            timeline: capsut_core::Timeline { duration_seconds: 0.0, tracks: vec![] },
        };
        let req = RenderRequest { job_id: "j1".into(), project, format: "mp4".into() };
        assert!(validate_render_request(&req).is_err());
    }
}
