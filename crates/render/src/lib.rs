use capsut_core::{Clip, Project};
use capsut_media::local_media_path;
use serde::{Deserialize, Serialize};
use std::{path::{Path, PathBuf}, process::{Command, ExitStatus}};

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
    if request.format != "mp4" { return Err("only mp4 is supported by the initial renderer".into()); }
    if request.project.timeline.tracks.iter().filter(|t| t.kind == "video").flat_map(|t| &t.clips).count() != 1 {
        return Err("initial renderer requires exactly one video clip".into());
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq)]
pub struct RenderPlan {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub output: PathBuf,
}

pub fn build_render_plan(request: &RenderRequest, ffmpeg_bin: impl Into<PathBuf>, output: impl Into<PathBuf>) -> Result<RenderPlan, String> {
    validate_render_request(request)?;
    let clip = request.project.timeline.tracks.iter()
        .filter(|t| t.kind == "video")
        .flat_map(|t| &t.clips)
        .next()
        .expect("validated exactly one video clip");
    let asset = request.project.assets.iter()
        .find(|a| a.id == clip.asset_id)
        .ok_or_else(|| format!("missing asset {}", clip.asset_id))?;
    let input = local_media_path(&asset.uri).map_err(|_| "only local/file media is supported".to_string())?;
    let output = output.into();
    if output.as_os_str().is_empty() { return Err("output is required".into()); }
    let duration = clip.source_out_seconds - clip.source_in_seconds;
    let fps = format!("{}/{}", request.project.project.frame_rate.numerator, request.project.project.frame_rate.denominator);
    let size = format!("{}x{}", request.project.project.width, request.project.project.height);

    let args = vec![
        "-hide_banner".into(),
        "-loglevel".into(), "error".into(),
        "-y".into(),
        "-ss".into(), clip.source_in_seconds.to_string(),
        "-i".into(), input.to_string_lossy().into_owned(),
        "-t".into(), duration.to_string(),
        "-map".into(), "0:v:0".into(),
        "-map".into(), "0:a:0?".into(),
        "-vf".into(), format!("scale={size}:force_original_aspect_ratio=decrease,pad={size}:(ow-iw)/2:(oh-ih)/2"),
        "-r".into(), fps,
        "-c:v".into(), "libx264".into(),
        "-pix_fmt".into(), "yuv420p".into(),
        "-c:a".into(), "aac".into(),
        "-movflags".into(), "+faststart".into(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(RenderPlan { executable: ffmpeg_bin.into(), args, output })
}

#[derive(Debug)]
pub enum RenderError {
    Validation(String),
    Spawn(String),
    Failed(Option<i32>),
    OutputMissing,
    Io(std::io::Error),
}

pub fn execute_render(plan: &RenderPlan) -> Result<RenderArtifact, RenderError> {
    let output = Command::new(&plan.executable)
        .args(&plan.args)
        .status()
        .map_err(|e| RenderError::Spawn(e.to_string()))?;
    ensure_success(output, &plan.output)
}

fn ensure_success(status: ExitStatus, output: &Path) -> Result<RenderArtifact, RenderError> {
    if !status.success() {
        return Err(RenderError::Failed(status.code()));
    }
    let metadata = std::fs::metadata(output).map_err(|e| RenderError::Io(e))?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(RenderError::OutputMissing);
    }
    Ok(RenderArtifact {
        uri: format!("file://{}", output.to_string_lossy()),
        mime_type: "video/mp4".into(),
        size_bytes: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use capsut_core::{AssetRef, ProjectInfo, RationalFrameRate, Timeline, Track};

    fn project() -> Project {
        Project {
            schema_version: "0.1.0".into(),
            project: ProjectInfo { id: "p1".into(), name: "Render".into(), width: 1280, height: 720, frame_rate: RationalFrameRate { numerator: 30, denominator: 1 } },
            assets: vec![AssetRef { id: "a1".into(), uri: "file:///tmp/input.mp4".into(), mime_type: "video/mp4".into(), duration_seconds: Some(10.0) }],
            timeline: Timeline {
                duration_seconds: 3.0,
                tracks: vec![Track { id: "v1".into(), kind: "video".into(), clips: vec![Clip { id: "c1".into(), asset_id: "a1".into(), timeline_start_seconds: 0.0, source_in_seconds: 2.0, source_out_seconds: 5.0 }] }],
            },
        }
    }

    #[test]
    fn plan_is_argument_vector_not_shell_text() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "mp4".into() };
        let plan = build_render_plan(&req, "ffmpeg", "/tmp/out.mp4").unwrap();
        assert_eq!(plan.executable, PathBuf::from("ffmpeg"));
        assert!(plan.args.contains(&"-ss".into()));
        assert!(plan.args.contains(&"2".into()));
        assert!(plan.args.contains(&"-i".into()));
        assert!(!plan.args.join(" ").contains("&&"));
    }

    #[test]
    fn unsupported_format_is_rejected() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "webm".into() };
        assert!(validate_render_request(&req).is_err());
    }

    #[test]
    fn multiple_video_clips_are_rejected_by_initial_renderer() {
        let mut p = project();
        p.timeline.tracks[0].clips.push(Clip { id: "c2".into(), asset_id: "a1".into(), timeline_start_seconds: 3.0, source_in_seconds: 5.0, source_out_seconds: 6.0 });
        let req = RenderRequest { job_id: "j1".into(), project: p, format: "mp4".into() };
        assert!(validate_render_request(&req).is_err());
    }
}
