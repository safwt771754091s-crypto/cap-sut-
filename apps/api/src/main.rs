use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::CorsLayer;
use capsut_core::Project;
use capsut_render::{build_render_plan, execute_render, RenderRequest};
use serde::{Deserialize, Serialize};
use std::{
    env,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
struct AppState {
    ffmpeg_bin: PathBuf,
    output_dir: PathBuf,
    asset_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct CreateRenderRequest {
    project: Project,
    format: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

#[derive(Debug, Serialize)]
struct RenderResponse {
    ok: bool,
    job_id: String,
    artifact: capsut_render::RenderArtifact,
}

#[derive(Debug, Serialize)]
struct AssetResponse {
    ok: bool,
    asset_id: String,
    name: String,
    uri: String,
    mime_type: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    ok: bool,
    error: String,
}

#[tokio::main]
async fn main() {
    let port = env::var("CAPSUT_API_PORT").unwrap_or_else(|_| "8080".into());
    let ffmpeg_bin = env::var("CAPSUT_FFMPEG").unwrap_or_else(|_| "ffmpeg".into());
    let output_dir = env::var("CAPSUT_OUTPUT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::temp_dir().join("capsut-renders"));
    let asset_dir = env::var("CAPSUT_ASSET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::temp_dir().join("capsut-assets"));

    std::fs::create_dir_all(&output_dir).expect("failed to create render output directory");
    std::fs::create_dir_all(&asset_dir).expect("failed to create asset directory");

    let state = Arc::new(AppState {
        ffmpeg_bin: PathBuf::from(ffmpeg_bin),
        output_dir,
        asset_dir,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/assets", post(upload_asset))
        .route("/v1/renders", post(create_render))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind API");
    println!("Cap sut API listening on {listener:?}");
    axum::serve(listener, app).await.expect("API server failed");
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
) -> Result<(StatusCode, Json<AssetResponse>), (StatusCode, Json<ErrorResponse>)> {
    let mut field = multipart
        .next_field()
        .await
        .map_err(|e| api_error(format!("multipart read failed: {e}")))?
        .ok_or_else(|| api_error("missing media field"))?;

    let original_name = field
        .file_name()
        .map(str::to_owned)
        .unwrap_or_else(|| "upload.bin".into());
    let mime_type = field
        .content_type()
        .map(str::to_owned)
        .unwrap_or_else(|| "application/octet-stream".into());

    let extension = PathBuf::from(&original_name)
        .extension()
        .and_then(|x| x.to_str())
        .filter(|x| x.len() <= 12)
        .unwrap_or("bin");

    let asset_id = format!("asset-{}", unique_suffix());
    let file_name = format!("{asset_id}.{extension}");
    let path = state.asset_dir.join(&file_name);

    let mut bytes = Vec::new();
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|e| api_error(format!("multipart chunk failed: {e}")))?
    {
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err(api_error("uploaded media is empty"));
    }

    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| api_error(format!("asset write failed: {e}")))?;

    Ok((
        StatusCode::CREATED,
        Json(AssetResponse {
            ok: true,
            asset_id,
            name: original_name,
            uri: path.to_string_lossy().into_owned(),
            mime_type,
            size_bytes: bytes.len() as u64,
        }),
    ))
}

async fn create_render(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateRenderRequest>,
) -> Result<(StatusCode, Json<RenderResponse>), (StatusCode, Json<ErrorResponse>)> {
    let job_id = unique_job_id();
    let format = body.format.unwrap_or_else(|| "mp4".into());

    let request = RenderRequest {
        job_id: job_id.clone(),
        project: body.project,
        format,
    };

    let output = state.output_dir.join(format!("{job_id}.mp4"));
    let plan = build_render_plan(&request, state.ffmpeg_bin.clone(), &output)
        .map_err(api_error)?;

    let artifact = tokio::task::spawn_blocking(move || execute_render(&plan))
        .await
        .map_err(|e| api_error(format!("render worker failed: {e}")))?
        .map_err(|e| api_error(format!("render failed: {e:?}")))?;

    Ok((
        StatusCode::CREATED,
        Json(RenderResponse {
            ok: true,
            job_id,
            artifact,
        }),
    ))
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

fn unique_job_id() -> String {
    format!("render-{}", unique_suffix())
}
