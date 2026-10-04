pub const CURRENT_SCHEMA_VERSION: &str = "0.1.0";
pub const SUPPORTED_SCHEMA_VERSIONS: &[&str] = &[CURRENT_SCHEMA_VERSION];

pub fn is_supported_schema_version(version: &str) -> bool {
    SUPPORTED_SCHEMA_VERSIONS.contains(&version)
}

pub fn clip_duration(source_in_seconds: f64, source_out_seconds: f64) -> Option<f64> {
    if source_in_seconds < 0.0 || source_out_seconds <= source_in_seconds {
        return None;
    }
    Some(source_out_seconds - source_in_seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_schema_is_supported() {
        assert!(is_supported_schema_version(CURRENT_SCHEMA_VERSION));
    }

    #[test]
    fn invalid_clip_range_has_no_duration() {
        assert_eq!(clip_duration(3.0, 3.0), None);
    }
}
