use capsut_core::Project;
use capsut_render::{build_render_plan, execute_render, RenderRequest};
use std::{env, fs, path::PathBuf, process};

fn main() {
    if let Err(error) = run() {
        eprintln!("cap-sut render failed: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let project_path = args
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| "usage: capsut-render <project.json> <output.mp4> [ffmpeg]".to_string())?;
    let output = args
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| "usage: capsut-render <project.json> <output.mp4> [ffmpeg]".to_string())?;
    let ffmpeg = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("ffmpeg"));

    let project_text =
        fs::read_to_string(&project_path).map_err(|e| format!("read project: {e}"))?;
    let project: Project =
        serde_json::from_str(&project_text).map_err(|e| format!("parse project: {e}"))?;

    let request = RenderRequest {
        job_id: project.project.id.clone(),
        project,
        format: "mp4".into(),
    };
    let plan = build_render_plan(&request, ffmpeg, output)?;
    let artifact = execute_render(&plan).map_err(|e| format!("{e:?}"))?;

    println!(
        "{{\"ok\":true,\"uri\":{:?},\"mimeType\":{:?},\"sizeBytes\":{}}}",
        artifact.uri, artifact.mime_type, artifact.size_bytes
    );
    Ok(())
}
