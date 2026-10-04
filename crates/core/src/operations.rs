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
    let second_id = format!("{}-split", original.id);
    if track.clips.iter().any(|c| c.id == second_id) { return Err(EditError::InvalidOperation); }
    let first = Clip { source_out_seconds: split_at_source_seconds, ..original.clone() };
    let first_duration = split_at_source_seconds - original.source_in_seconds;
    let second = Clip { id: second_id, timeline_start_seconds: original.timeline_start_seconds + first_duration, source_in_seconds: split_at_source_seconds, ..original };
    track.clips[index] = first;
    track.clips.insert(index + 1, second);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{schema::CURRENT_SCHEMA_VERSION, AssetRef, ProjectInfo, RationalFrameRate, Timeline};

    fn project() -> Project {
        Project {
            schema_version: CURRENT_SCHEMA_VERSION.into(),
            project: ProjectInfo { id: "p1".into(), name: "Test".into(), width: 1280, height: 720, frame_rate: RationalFrameRate { numerator: 30, denominator: 1 } },
            assets: vec![AssetRef { id: "a1".into(), uri: "file:///a.mp4".into(), mime_type: "video/mp4".into(), duration_seconds: Some(10.0) }],
            timeline: Timeline { duration_seconds: 8.0, tracks: vec![Track { id: "v1".into(), kind: "video".into(), clips: vec![Clip { id: "c1".into(), asset_id: "a1".into(), timeline_start_seconds: 0.0, source_in_seconds: 0.0, source_out_seconds: 8.0 }] }] },
        }
    }

    #[test]
    fn split_creates_contiguous_clips() {
        let mut p = project();
        split_clip(&mut p, "v1", "c1", 3.0).unwrap();
        let clips = &p.timeline.tracks[0].clips;
        assert_eq!(clips.len(), 2);
        assert_eq!(clips[0].source_out_seconds, 3.0);
        assert_eq!(clips[1].source_in_seconds, 3.0);
        assert_eq!(clips[1].timeline_start_seconds, 3.0);
    }

    #[test]
    fn duplicate_split_id_is_rejected() {
        let mut p = project();
        split_clip(&mut p, "v1", "c1", 3.0).unwrap();
        assert_eq!(split_clip(&mut p, "v1", "c1", 2.0), Err(EditError::InvalidOperation));
    }
}
