//! Application directories under ~/Library/Application Support/Kontakte-Akte.

use std::fs;
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

pub const APP_DIR_NAME: &str = "Kontakte-Akte";

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub root: PathBuf,
}

impl AppPaths {
    /// Resolved for the current macOS user via $HOME – never a hard-coded user name.
    pub fn resolve() -> Result<Self, String> {
        let home = std::env::var_os("HOME").ok_or("HOME ist nicht gesetzt")?;
        let root = PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(APP_DIR_NAME);
        Ok(Self { root })
    }

    pub fn data(&self) -> PathBuf {
        self.root.join("data")
    }
    pub fn database_file(&self) -> PathBuf {
        self.data().join("kontakte-akte.db")
    }
    pub fn backups(&self) -> PathBuf {
        self.root.join("backups")
    }
    pub fn import(&self) -> PathBuf {
        self.backups().join("import")
    }
    pub fn config(&self) -> PathBuf {
        self.root.join("config")
    }
    pub fn logs(&self) -> PathBuf {
        self.root.join("logs")
    }
    pub fn runtime(&self) -> PathBuf {
        self.root.join("runtime")
    }
    pub fn bridge_token(&self) -> PathBuf {
        self.config().join("bridge.token")
    }

    pub fn ensure(&self) -> Result<(), String> {
        for dir in [
            self.root.clone(),
            self.data(),
            self.backups(),
            self.import(),
            self.config(),
            self.logs(),
            self.runtime(),
        ] {
            fs::create_dir_all(&dir).map_err(|e| format!("Verzeichnis {} konnte nicht angelegt werden: {e}", dir.display()))?;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }
        Ok(())
    }
}

/// Writes a file atomically with mode 0600 (temp file + rename).
pub fn write_private(path: &Path, contents: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        file.write_all(contents).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Append-only operational log. Never receives personal data or secrets.
pub fn log_line(paths: &AppPaths, message: &str) {
    let path = paths.logs().join("desktop.log");
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 1_000_000 {
            let _ = fs::rename(&path, paths.logs().join("desktop.log.1"));
        }
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).mode(0o600).open(&path) {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "{secs} {message}");
    }
}

/// Recursively copies `src` into `dst`, skipping caches and image archives.
pub fn copy_tree(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == "__pycache__" || name_str.ends_with(".pyc") || name_str.ends_with(".tar") || name_str.ends_with(".tar.gz") {
            continue;
        }
        let target = dst.join(&name);
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_under_application_support() {
        let paths = AppPaths::resolve().unwrap();
        assert!(paths.root.ends_with("Library/Application Support/Kontakte-Akte"));
        assert!(paths.database_file().ends_with("data/kontakte-akte.db"));
        let home = std::env::var("HOME").unwrap();
        assert!(paths.root.starts_with(&home), "resolved from $HOME, not hard-coded");
    }

    #[test]
    fn write_private_sets_mode_0600() {
        let dir = std::env::temp_dir().join(format!("ka-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("secret");
        write_private(&file, b"abc").unwrap();
        let mode = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        fs::remove_dir_all(&dir).unwrap();
    }
}
