use capsut_core::Project;
use capsut_media::local_media_path;
use serde::{Deserialize, Serialize};
use std::{path::{Path, PathBuf}, process::{Command, ExitStatus}};

const DEFAULT_WATERMARK_FONT: &str = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RenderJobState { Queued, Running, Completed, Failed, Cancelled }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderRequest { pub job_id: String, pub project: Project, pub format: String }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderArtifact { pub uri: String, pub mime_type: String, pub size_bytes: u64 }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum WatermarkPosition { TopLeft, TopRight, BottomLeft, BottomRight }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WatermarkConfig {
    pub text: String,
    /// Text alpha, from 0.0 (transparent) to 1.0 (opaque).
    pub opacity: f32,
    pub position: WatermarkPosition,
}

impl Default for WatermarkConfig {
    fn default() -> Self {
        Self {
            text: "Made with Cap sut".into(),
            opacity: 0.75,
            position: WatermarkPosition::BottomRight,
        }
    }
}

impl WatermarkConfig {
    fn validate(&self) -> Result<(), String> {
        if self.text.trim().is_empty() || self.text.len() > 160 {
            return Err("watermark text must contain 1 to 160 bytes".into());
        }
        if !self.opacity.is_finite() || !(0.0..=1.0).contains(&self.opacity) {
            return Err("watermark opacity must be between 0.0 and 1.0".into());
        }
        Ok(())
    }
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
pub struct RenderPlan { pub executable: PathBuf, pub args: Vec<String>, pub output: PathBuf }

pub fn build_render_plan(request: &RenderRequest, ffmpeg_bin: impl Into<PathBuf>, output: impl Into<PathBuf>) -> Result<RenderPlan, String> {
    build_render_plan_with_watermark(request, ffmpeg_bin, output, &WatermarkConfig::default())
}

/// Builds a render plan with a server-selected watermark policy.
/// The public API currently always uses the default Cap sut watermark. Paid-plan
/// customization must be resolved server-side from an authenticated entitlement;
/// never accept a client-supplied policy as proof of a paid subscription.
pub fn build_render_plan_with_watermark(
    request: &RenderRequest,
    ffmpeg_bin: impl Into<PathBuf>,
    output: impl Into<PathBuf>,
    watermark: &WatermarkConfig,
) -> Result<RenderPlan, String> {
    validate_render_request(request)?;
    watermark.validate()?;
    let clip = request.project.timeline.tracks.iter().filter(|t| t.kind == "video").flat_map(|t| &t.clips).next().expect("validated exactly one video clip");
    let asset = request.project.assets.iter().find(|a| a.id == clip.asset_id).ok_or_else(|| format!("missing asset {}", clip.asset_id))?;
    let input = local_media_path(&asset.uri).map_err(|_| "only local/file media is supported".to_string())?;
    let output = output.into();
    if output.as_os_str().is_empty() { return Err("output is required".into()); }
    let duration = clip.source_out_seconds - clip.source_in_seconds;
    let fps = format!("{}/{}", request.project.project.frame_rate.numerator, request.project.project.frame_rate.denominator);
    let width = request.project.project.width;
    let height = request.project.project.height;
    let font_path = std::env::var_os("CAPSUT_WATERMARK_FONT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_WATERMARK_FONT));
    let filter = build_video_filter(width, height, &font_path, watermark);
    let args = vec![
        "-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into(),
        "-ss".into(), clip.source_in_seconds.to_string(), "-i".into(), input.to_string_lossy().into_owned(),
        "-t".into(), duration.to_string(), "-map".into(), "0:v:0".into(), "-map".into(), "0:a:0?".into(),
        "-vf".into(), filter,
        "-r".into(), fps, "-c:v".into(), "libx264".into(), "-pix_fmt".into(), "yuv420p".into(),
        "-c:a".into(), "aac".into(), "-movflags".into(), "+faststart".into(), output.to_string_lossy().into_owned(),
    ];
    Ok(RenderPlan { executable: ffmpeg_bin.into(), args, output })
}

fn build_video_filter(width: u32, height: u32, font_path: &Path, watermark: &WatermarkConfig) -> String {
    let (x, y) = match watermark.position {
        WatermarkPosition::TopLeft => ("24".to_string(), "24".to_string()),
        WatermarkPosition::TopRight => ("w-tw-24".to_string(), "24".to_string()),
        WatermarkPosition::BottomLeft => ("24".to_string(), "h-th-24".to_string()),
        WatermarkPosition::BottomRight => ("w-tw-24".to_string(), "h-th-24".to_string()),
    };
    let font = escape_filter_value(&font_path.to_string_lossy());
    let text = escape_filter_value(&watermark.text);
    let opacity = format!("{:.2}", watermark.opacity);
    format!(
        "scale={width}:{height}:force_original_aspect_ratio=decrease,pad=width={width}:height={height}:x=(ow-iw)/2:y=(oh-ih)/2,drawtext=fontfile='{font}':text='{text}':fontcolor=white@{opacity}:fontsize=h*0.035:box=1:boxcolor=black@0.28:boxborderw=12:x={x}:y={y}"
    )
}

/// Escape values embedded in a quoted FFmpeg filter option.
fn escape_filter_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace(',', "\\,")
        .replace('%', "\\%")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

#[derive(Debug)]
pub enum RenderError { Validation(String), Spawn(String), Failed(Option<i32>), OutputMissing, Io(std::io::Error) }

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message) => write!(f, "render validation failed: {message}"),
            Self::Spawn(message) => write!(f, "failed to start renderer: {message}"),
            Self::Failed(code) => write!(f, "ffmpeg failed with exit code {:?}", code),
            Self::OutputMissing => write!(f, "renderer did not produce a non-empty output file"),
            Self::Io(error) => write!(f, "render I/O error: {error}"),
        }
    }
}
impl std::error::Error for RenderError {}

pub fn execute_render(plan: &RenderPlan) -> Result<RenderArtifact, RenderError> {
    let output = Command::new(&plan.executable).args(&plan.args).status().map_err(|e| RenderError::Spawn(e.to_string()))?;
    ensure_success(output, &plan.output)
}

fn ensure_success(status: ExitStatus, output: &Path) -> Result<RenderArtifact, RenderError> {
    if !status.success() { return Err(RenderError::Failed(status.code())); }
    let metadata = std::fs::metadata(output).map_err(RenderError::Io)?;
    if !metadata.is_file() || metadata.len() == 0 { return Err(RenderError::OutputMissing); }
    Ok(RenderArtifact { uri: format!("file://{}", output.to_string_lossy()), mime_type: "video/mp4".into(), size_bytes: metadata.len() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use capsut_core::{AssetRef, Clip, ProjectInfo, RationalFrameRate, Timeline, Track};
    fn project() -> Project {
        Project {
            schema_version: "0.1.0".into(),
            project: ProjectInfo { id: "p1".into(), name: "Render".into(), width: 1280, height: 720, frame_rate: RationalFrameRate { numerator: 30, denominator: 1 } },
            assets: vec![AssetRef { id: "a1".into(), uri: "file:///tmp/input.mp4".into(), mime_type: "video/mp4".into(), duration_seconds: Some(10.0) }],
            timeline: Timeline { duration_seconds: 3.0, tracks: vec![Track { id: "v1".into(), kind: "video".into(), clips: vec![Clip { id: "c1".into(), asset_id: "a1".into(), timeline_start_seconds: 0.0, source_in_seconds: 2.0, source_out_seconds: 5.0 }] }] },
        }
    }
    #[test] fn plan_is_argument_vector_not_shell_text() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "mp4".into() };
        let plan = build_render_plan(&req, "ffmpeg", "/tmp/out.mp4").unwrap();
        assert_eq!(plan.executable, PathBuf::from("ffmpeg"));
        assert!(plan.args.contains(&"-ss".into())); assert!(plan.args.contains(&"2".into())); assert!(plan.args.contains(&"-i".into()));
        assert!(!plan.args.join(" ").contains("&&"));
        let vf = plan.args.iter().position(|arg| arg == "-vf").map(|i| plan.args[i + 1].clone()).unwrap();
        assert!(vf.starts_with("scale=1280:720:force_original_aspect_ratio=decrease,pad=width=1280:height=720"));
        assert!(vf.contains("drawtext="));
        assert!(vf.contains("text='Made with Cap sut'"));
        assert!(vf.contains("fontcolor=white@0.75"));
        assert!(vf.contains("x=w-tw-24:y=h-th-24"));
        assert!(!vf.contains("1280x720"));
    }
    #[test] fn custom_watermark_settings_are_supported_by_renderer() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "mp4".into() };
        let watermark = WatermarkConfig { text: "My Studio".into(), opacity: 0.5, position: WatermarkPosition::TopLeft };
        let plan = build_render_plan_with_watermark(&req, "ffmpeg", "/tmp/out.mp4", &watermark).unwrap();
        let vf = plan.args.iter().position(|arg| arg == "-vf").map(|i| plan.args[i + 1].as_str()).unwrap();
        assert!(vf.contains("text='My Studio'"));
        assert!(vf.contains("fontcolor=white@0.50"));
        assert!(vf.contains("x=24:y=24"));
    }
    #[test] fn watermark_text_is_escaped_for_filter_syntax() {
        let watermark = WatermarkConfig { text: "Studio: 50%, it's yours".into(), opacity: 0.75, position: WatermarkPosition::BottomRight };
        let filter = build_video_filter(1280, 720, Path::new("/fonts/DejaVuSans.ttf"), &watermark);
        assert!(filter.contains("Studio\\: 50\\%, it\\'s yours"));
    }
    #[test] fn invalid_watermark_settings_are_rejected() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "mp4".into() };
        let invalid = WatermarkConfig { text: " ".into(), opacity: 1.5, position: WatermarkPosition::BottomRight };
        assert!(build_render_plan_with_watermark(&req, "ffmpeg", "/tmp/out.mp4", &invalid).is_err());
    }
    #[test] fn unsupported_format_is_rejected() {
        let req = RenderRequest { job_id: "j1".into(), project: project(), format: "webm".into() };
        assert!(validate_render_request(&req).is_err());
    }
    #[test] fn multiple_video_clips_are_rejected_by_initial_renderer() {
        let mut p = project();
        p.timeline.tracks[0].clips.push(Clip { id: "c2".into(), asset_id: "a1".into(), timeline_start_seconds: 3.0, source_in_seconds: 5.0, source_out_seconds: 6.0 });
        let req = RenderRequest { job_id: "j1".into(), project: p, format: "mp4".into() };
        assert!(validate_render_request(&req).is_err());
    }
}
