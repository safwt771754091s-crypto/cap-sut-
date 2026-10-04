use crate::{Clip, Project, Track};

#[derive(Debug, Clone, PartialEq)]
pub enum EditError { TrackNotFound, ClipNotFound, InvalidRange, InvalidOperation }

pub fn add_track(project: &mut Project, track: Track) -> Result<(), EditError> {
    if project.timeline.tracks.iter().any(|t| t.id == track.id) { return Err(EditError::InvalidOperation); }
    project.timeline.tracks.push(track);
    Ok(())
}

pub fn add_clip(project: &mut Project, track_id: &str, clip: Clip) -> Result<(), EditError> {
    if clip.source_out_seconds <= clip.source_in_seconds || clip.timeline_start_seconds < 0.0 { return Err(EditError::InvalidRange); }
    let track = project.timeline.tracks.iter_mut().find(|t| t.id == track_id).ok_or(EditError::TrackNotFound)?;
    if track.clips.iter().any(|c| c.id == clip.id) { return Err(EditError::InvalidOperation); }
    track.clips.push(clip);
    Ok(())
}

pub fn trim_clip(project: &mut Project, track_id: &str, clip_id: &str, source_in: f64, source_out: f64) -> Result<(), EditError> {
    if source_in < 0.0 || source_out <= source_in { return Err(EditError::InvalidRange); }
    let track = project.timeline.tracks.iter_mut().find(|t| t.id == track_id).ok_or(EditError::TrackNotFound)?;
    let clip = track.clips.iter_mut().find(|c| c.id == clip_id).ok_or(EditError::ClipNotFound)?;
    clip.source_in_seconds = source_in;
    clip.source_out_seconds = source_out;
    Ok(())
}

pub fn split_clip(project: &mut Project, track_id: &str, clip_id: &str, split_at_source_seconds: f64) -> Result<(), EditError> {
    let track = project.timeline.tracks.iter_mut().find(|t| t.id == track_id).ok_or(EditError::TrackNotFound)?;
    let index = track.clips.iter().position(|c| c.id == clip_id).ok_or(EditError::ClipNotFound)?;
    let original = track.clips[index].clone();
    if split_at_source_seconds <= original.source_in_seconds || split_at_source_seconds >= original.source_out_seconds { return Err(EditError::InvalidRange); }
    let first = Clip { source_out_seconds: split_at_source_seconds, ..original.clone() };
    let first_duration = split_at_source_seconds - original.source_in_seconds;
    let second = Clip { id: format!("{}-split", original.id), timeline_start_seconds: original.timeline_start_seconds + first_duration, source_in_seconds: split_at_source_seconds, ..original };
    track.clips[index] = first;
    track.clips.insert(index + 1, second);
    Ok(())
}
