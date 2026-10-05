use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header::{CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE}, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use capsut_core::Project;
use capsut_render::{build_render_plan, execute_render, RenderRequest};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    ffmpeg_bin: String,
    output_dir: PathBuf,
    asset_dir: PathBuf,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    ok: bool,
    error: String,
}

#[derive(Debug, Serialize)]
struct AssetResponse {
    ok: bool,
    asset_id: String,
    name: String,
    uri: String,
    mime_type: String,
    size_bytes: usize,
}

#[derive(Debug, Deserialize)]
struct RenderEnvelope {
    project: Project,
    format: Option<String>,
}

#[derive(Debug, Serialize)]
struct RenderResponse {
    ok: bool,
    job_id: String,
    uri: String,
    mime_type: String,
    size_bytes: u64,
}

#[tokio::main]
async fn main() {
    let port = std::env::var("CAPSUT_API_PORT").unwrap_or_else(|_| "8080".into());
    let ffmpeg_bin = std::env::var("CAPSUT_FFMPEG").unwrap_or_else(|_| "ffmpeg".into());
    let output_dir = std::env::var("CAPSUT_OUTPUT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("capsut-renders"));
    let asset_dir = std::env::var("CAPSUT_ASSET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("capsut-assets"));

    tokio::fs::create_dir_all(&output_dir).await.expect("create output dir");
    tokio::fs::create_dir_all(&asset_dir).await.expect("create asset dir");

    let state = Arc::new(AppState {
        ffmpeg_bin,
        output_dir,
        asset_dir,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/assets", post(upload_asset))
        .route("/v1/renders", post(create_render))
        .route("/v1/renders/{job_id}/download", get(download_render))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind API listener");

    println!("Cap sut API listening on {listener_addr}", listener_addr = listener.local_addr().unwrap());

    axum::serve(listener, app).await.expect("serve API");
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "capsut-api",
    })
}

async fn upload_asset(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<AssetResponse>, (StatusCode, Json<ErrorResponse>)> {
    let field = multipart
        .next_field()
        .await
        .map_err(|e| api_error(e.to_string()))?
        .ok_or_else(|| api_error("missing multipart file"))?;

    let original_name = field.file_name().unwrap_or("asset").to_string();
    let mut mime_type = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = field
        .bytes()
        .await
        .map_err(|e| api_error(e.to_string()))?;

    if mime_type == "application/octet-stream" {
        mime_type = mime_from_extension(&original_name).to_string();
    }

    let asset_id = format!("asset-{}", unique_suffix());
    let extension = FsPath::new(&original_name)
        .extension()
        .and_then(|v| v.to_str())
        .filter(|v| !v.is_empty())
        .unwrap_or("bin");
    let file_name = format!("{asset_id}.{extension}");
    let path = state.asset_dir.join(&file_name);

    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| api_error(e.to_string()))?;

    Ok(Json(AssetResponse {
        ok: true,
        asset_id,
        name: original_name,
        uri: format!("file://{}", path.display()),
        mime_type,
        size_bytes: bytes.len(),
    }))
}

async fn create_render(
    State(state): State<Arc<AppState>>,
    Json(envelope): Json<RenderEnvelope>,
) -> Result<(StatusCode, Json<RenderResponse>), (StatusCode, Json<ErrorResponse>)> {
    let job_id = format!("render-{}", unique_suffix());
    let format = envelope.format.unwrap_or_else(|| "mp4".to_string());
    let request = RenderRequest {
        job_id: job_id.clone(),
        project: envelope.project,
        format,
    };

    let plan = build_render_plan(&request, &state.ffmpeg_bin)
        .map_err(|e| api_error(e.to_string()))?;
    let output = state.output_dir.join(format!("{job_id}.mp4"));
    let plan = plan.with_output(output.clone());

    let artifact = tokio::task::spawn_blocking(move || execute_render(&plan))
        .await
        .map_err(|e| api_error(e.to_string()))?
        .map_err(|e| api_error(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(RenderResponse {
            ok: true,
            job_id,
            uri: artifact.uri,
            mime_type: artifact.mime_type,
            size_bytes: artifact.size_bytes,
        }),
    ))
}

async fn download_render(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Response, StatusCode> {
    if !job_id.starts_with("render-")
        || !job_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let path = state.output_dir.join(format!("{job_id}.mp4"));
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| if e.kind() == std::io::ErrorKind::NotFound {
            StatusCode::NOT_FOUND
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "video/mp4")
        .header(CONTENT_LENGTH, bytes.len())
        .header(
            CONTENT_DISPOSITION,
            format!("attachment; filename=\\\"{job_id}.mp4\\\""),
        )
        .body(axum::body::Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn api_error(error: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            ok: false,
            error: error.into(),
        }),
    )
}

fn unique_suffix() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos()
        .to_string()
}

fn mime_from_extension(name: &str) -> &'static str {
    match FsPath::new(name)
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        Some("ogg") => "audio/ogg",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

trait RenderPlanOutput {
    fn with_output(self, output: PathBuf) -> Self;
}

impl RenderPlanOutput for capsut_render::RenderPlan {
    fn with_output(mut self, output: PathBuf) -> Self {
        self.output = output;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::mime_from_extension;

    #[test]
    fn infers_common_video_mime() {
        assert_eq!(mime_from_extension("clip.mp4"), "video/mp4");
    }
}
