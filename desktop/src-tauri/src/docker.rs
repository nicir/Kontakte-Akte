//! Docker Desktop / Docker Compose orchestration for the backend container.
//!
//! Only fixed, narrowly scoped commands are executed (no shell, no user input
//! in arguments). Only the `kontakte-akte` compose project is ever touched;
//! volumes are never removed.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::paths::{copy_tree, AppPaths};

pub const PROJECT: &str = "kontakte-akte";
pub const IMAGE: &str = "kontakte-akte-backend";
pub const PORT: u16 = 47811;
pub const SERVICE_NAME: &str = "kontakte-akte";
const BUNDLED_IMAGE: &str = "kontakte-akte-backend-image.tar.gz";

#[derive(Debug, Clone, Serialize)]
pub struct StartupError {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<String>,
}

impl StartupError {
    fn new(code: &'static str, message: &str, detail: Option<String>) -> Self {
        Self { code, message: message.to_string(), detail }
    }
}

pub struct CmdOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

/// Runs a command with a hard timeout; output is captured (never inherited).
pub fn run(cmd: &mut Command, timeout: Duration) -> Result<CmdOutput, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut out = child.stdout.take().ok_or("stdout")?;
    let mut err = child.stderr.take().ok_or("stderr")?;
    let out_reader = thread::spawn(move || {
        let mut s = String::new();
        let _ = out.read_to_string(&mut s);
        s
    });
    let err_reader = thread::spawn(move || {
        let mut s = String::new();
        let _ = err.read_to_string(&mut s);
        s
    });
    let deadline = Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break None;
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    Ok(CmdOutput {
        success: status.map(|s| s.success()).unwrap_or(false),
        stdout: out_reader.join().unwrap_or_default(),
        stderr: err_reader.join().unwrap_or_default(),
        timed_out,
    })
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

/// Apps started from Finder get a minimal PATH, so look in the usual places.
pub fn docker_candidates() -> Vec<PathBuf> {
    vec![
        home().join(".docker/bin/docker"),
        PathBuf::from("/usr/local/bin/docker"),
        PathBuf::from("/opt/homebrew/bin/docker"),
        PathBuf::from("/Applications/Docker.app/Contents/Resources/bin/docker"),
        home().join("Applications/Docker.app/Contents/Resources/bin/docker"),
    ]
}

pub fn find_docker() -> Option<PathBuf> {
    docker_candidates().into_iter().find(|p| p.is_file())
}

pub fn docker_desktop_installed() -> bool {
    Path::new("/Applications/Docker.app").exists() || home().join("Applications/Docker.app").exists()
}

fn search_path() -> String {
    let mut parts: Vec<String> = vec![
        home().join(".docker/bin").to_string_lossy().into_owned(),
        "/Applications/Docker.app/Contents/Resources/bin".into(),
        "/usr/local/bin".into(),
        "/opt/homebrew/bin".into(),
    ];
    if let Ok(existing) = std::env::var("PATH") {
        parts.push(existing);
    }
    parts.push("/usr/bin:/bin:/usr/sbin:/sbin".into());
    parts.join(":")
}

pub struct Docker {
    bin: PathBuf,
    compose_file: PathBuf,
    env: Vec<(String, String)>,
}

impl Docker {
    pub fn new(bin: PathBuf, paths: &AppPaths, version: &str) -> Self {
        // SAFETY: getuid/getgid have no preconditions and cannot fail.
        let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
        Self {
            bin,
            compose_file: paths.runtime().join("docker-compose.yml"),
            env: vec![
                ("KA_DATA_DIR".into(), paths.root.to_string_lossy().into_owned()),
                ("KA_VERSION".into(), version.into()),
                ("KA_PORT".into(), PORT.to_string()),
                ("KA_UID".into(), uid.to_string()),
                ("KA_GID".into(), gid.to_string()),
                ("PATH".into(), search_path()),
                ("COMPOSE_PROJECT_NAME".into(), PROJECT.into()),
            ],
        }
    }

    fn command(&self, args: &[&str]) -> Command {
        let mut cmd = Command::new(&self.bin);
        cmd.args(args);
        for (k, v) in &self.env {
            cmd.env(k, v);
        }
        cmd
    }

    fn compose_command(&self, args: &[&str]) -> Command {
        let file = self.compose_file.to_string_lossy().into_owned();
        let mut full: Vec<&str> = vec!["compose", "-p", PROJECT, "-f", &file];
        full.extend_from_slice(args);
        let mut cmd = self.command(&full);
        if let Some(dir) = self.compose_file.parent() {
            cmd.current_dir(dir);
        }
        cmd
    }

    pub fn engine_ready(&self) -> bool {
        run(&mut self.command(&["info", "--format", "{{.ServerVersion}}"]), Duration::from_secs(15))
            .map(|o| o.success && !o.stdout.trim().is_empty())
            .unwrap_or(false)
    }

    pub fn compose_available(&self) -> bool {
        run(&mut self.command(&["compose", "version"]), Duration::from_secs(15))
            .map(|o| o.success)
            .unwrap_or(false)
    }

    pub fn image_exists(&self, version: &str) -> bool {
        let tag = format!("{IMAGE}:{version}");
        run(&mut self.command(&["image", "inspect", &tag]), Duration::from_secs(20))
            .map(|o| o.success)
            .unwrap_or(false)
    }

    pub fn load_image(&self, archive: &Path) -> Result<(), String> {
        let path = archive.to_string_lossy().into_owned();
        let out = run(&mut self.command(&["load", "-i", &path]), Duration::from_secs(600))?;
        if out.success {
            Ok(())
        } else {
            Err(tail(&out.stderr))
        }
    }

    pub fn build_image(&self) -> Result<(), String> {
        let out = run(&mut self.compose_command(&["build", "backend"]), Duration::from_secs(1800))?;
        if out.success {
            Ok(())
        } else if out.timed_out {
            Err("Zeitüberschreitung beim Erstellen des Backends.".into())
        } else {
            Err(tail(&out.stderr))
        }
    }

    pub fn up(&self) -> Result<(), String> {
        // `up -d` is idempotent: an already running container is reused, never duplicated.
        let out = run(
            &mut self.compose_command(&["up", "-d", "--no-build", "--remove-orphans"]),
            Duration::from_secs(180),
        )?;
        if out.success {
            Ok(())
        } else {
            Err(tail(&out.stderr))
        }
    }

    /// Stops (not removes) the backend container. Never touches volumes or other projects.
    pub fn stop(&self) -> Result<(), String> {
        let out = run(&mut self.compose_command(&["stop", "-t", "10"]), Duration::from_secs(40))?;
        if out.success {
            Ok(())
        } else {
            Err(tail(&out.stderr))
        }
    }
}

fn tail(text: &str) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(6)..].join("\n")
}

#[derive(Debug, Clone, PartialEq)]
pub enum Health {
    Ours { version: String },
    Foreign,
    Down,
}

pub fn backend_url() -> String {
    format!("http://127.0.0.1:{PORT}")
}

pub fn check_health() -> Health {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(2)).build();
    match agent.get(&format!("{}/api/health", backend_url())).call() {
        Ok(resp) => match resp.into_json::<serde_json::Value>() {
            Ok(json) if json.get("service").and_then(|s| s.as_str()) == Some(SERVICE_NAME) => Health::Ours {
                version: json.get("version").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            },
            _ => Health::Foreign,
        },
        Err(ureq::Error::Status(_, _)) => Health::Foreign,
        Err(_) => Health::Down,
    }
}

fn read_version(dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir.join("VERSION")).ok().map(|s| s.trim().to_string())
}

/// Copies compose file + backend sources from the app bundle to Application Support,
/// so the app does not depend on the repository or on its own install location.
pub fn install_runtime(bundle_runtime: &Path, paths: &AppPaths) -> Result<(), String> {
    let target = paths.runtime();
    let bundled = read_version(bundle_runtime).ok_or("Die Backend-Ressourcen fehlen im App-Paket.")?;
    let installed = read_version(&target);
    if installed.as_deref() == Some(bundled.as_str()) && target.join("docker-compose.yml").is_file() {
        return Ok(());
    }
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    }
    copy_tree(bundle_runtime, &target)?;
    Ok(())
}

pub fn bundled_image(bundle_runtime: &Path) -> Option<PathBuf> {
    let path = bundle_runtime.join(BUNDLED_IMAGE);
    path.is_file().then_some(path)
}

/// Full startup sequence. `progress(stage, message)` is called for UI updates.
pub fn start_backend(
    paths: &AppPaths,
    bundle_runtime: &Path,
    version: &str,
    external_backend: bool,
    progress: &dyn Fn(&str, &str),
) -> Result<(), StartupError> {
    progress("docker-check", "Kontakte-Akte wird vorbereitet …");
    install_runtime(bundle_runtime, paths)
        .map_err(|e| StartupError::new("internal", "Kontakte-Akte konnte nicht vorbereitet werden.", Some(e)))?;

    if let Health::Ours { version: running } = check_health() {
        if running == version || external_backend {
            progress("ready", "Bereit");
            return Ok(());
        }
    }
    if external_backend {
        return wait_for_health(version, true, progress);
    }

    progress("docker-check", "Docker wird geprüft …");
    let mut docker_bin = find_docker();
    if docker_bin.is_none() && !docker_desktop_installed() {
        return Err(StartupError::new(
            "docker_missing",
            "Docker Desktop wurde nicht gefunden.",
            Some("Bitte installiere Docker Desktop für Mac und starte Kontakte-Akte erneut.".into()),
        ));
    }

    let engine_ready = docker_bin
        .as_ref()
        .map(|bin| Docker::new(bin.clone(), paths, version).engine_ready())
        .unwrap_or(false);

    if !engine_ready {
        progress("docker-start", "Docker wird gestartet …");
        let _ = run(
            Command::new("/usr/bin/open").args(["-g", "-b", "com.docker.docker"]),
            Duration::from_secs(15),
        );
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            if docker_bin.is_none() {
                docker_bin = find_docker();
            }
            if let Some(bin) = &docker_bin {
                if Docker::new(bin.clone(), paths, version).engine_ready() {
                    break;
                }
            }
            if Instant::now() >= deadline {
                return Err(StartupError::new(
                    "docker_not_running",
                    "Docker konnte nicht gestartet werden.",
                    Some("Bitte starte Docker Desktop manuell und versuche es erneut.".into()),
                ));
            }
            thread::sleep(Duration::from_secs(2));
        }
    }
    let docker = Docker::new(docker_bin.expect("docker binary"), paths, version);

    if !docker.compose_available() {
        return Err(StartupError::new(
            "backend_failed",
            "Docker Compose ist nicht verfügbar.",
            Some("Bitte aktualisiere Docker Desktop.".into()),
        ));
    }

    if !docker.image_exists(version) {
        if let Some(archive) = bundled_image(bundle_runtime) {
            progress("image", "Backend wird einmalig installiert …");
            docker
                .load_image(&archive)
                .map_err(|e| StartupError::new("image_failed", "Backend konnte nicht installiert werden.", Some(e)))?;
        } else {
            progress("image", "Backend wird einmalig eingerichtet (Internetverbindung erforderlich, einige Minuten) …");
            docker
                .build_image()
                .map_err(|e| StartupError::new("image_failed", "Backend konnte nicht eingerichtet werden.", Some(e)))?;
        }
    }

    progress("backend-start", "Backend wird gestartet …");
    if let Err(e) = docker.up() {
        let code = if e.contains("port is already allocated") || e.contains("address already in use") {
            "port_in_use"
        } else {
            "backend_failed"
        };
        let message = if code == "port_in_use" {
            "Der lokale Port 47811 ist bereits belegt."
        } else {
            "Backend konnte nicht gestartet werden."
        };
        return Err(StartupError::new(code, message, Some(e)));
    }
    wait_for_health(version, false, progress)
}

fn wait_for_health(version: &str, external: bool, progress: &dyn Fn(&str, &str)) -> Result<(), StartupError> {
    progress("health", "Verbindung zur lokalen Datenbank wird hergestellt …");
    let deadline = Instant::now() + Duration::from_secs(90);
    loop {
        match check_health() {
            Health::Ours { version: running } if running == version || external => {
                progress("ready", "Bereit");
                return Ok(());
            }
            Health::Foreign => {
                return Err(StartupError::new(
                    "port_in_use",
                    "Der lokale Port 47811 wird von einem anderen Programm verwendet.",
                    None,
                ))
            }
            _ => {}
        }
        if Instant::now() >= deadline {
            return Err(StartupError::new(
                "health_timeout",
                "Die lokale Datenbank ist nicht erreichbar.",
                Some("Das Backend hat nicht rechtzeitig geantwortet.".into()),
            ));
        }
        thread::sleep(Duration::from_millis(500));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_captures_output_and_times_out() {
        let out = run(Command::new("/bin/echo").arg("hallo"), Duration::from_secs(5)).unwrap();
        assert!(out.success);
        assert_eq!(out.stdout.trim(), "hallo");
        let slow = run(Command::new("/bin/sleep").arg("5"), Duration::from_millis(300)).unwrap();
        assert!(slow.timed_out && !slow.success);
    }

    #[test]
    fn docker_candidates_include_docker_desktop_bundle() {
        let candidates = docker_candidates();
        assert!(candidates
            .iter()
            .any(|p| p.ends_with("Docker.app/Contents/Resources/bin/docker")));
        assert!(candidates.iter().all(|p| p.is_absolute()));
    }

    #[test]
    fn tail_keeps_last_lines() {
        let text = (1..=10).map(|i| format!("l{i}")).collect::<Vec<_>>().join("\n");
        assert_eq!(tail(&text), "l5\nl6\nl7\nl8\nl9\nl10");
    }

    #[test]
    fn health_reports_down_when_nothing_listens() {
        // Port 47811 is assumed free in CI; if the real backend runs, it must identify itself.
        let health = check_health();
        assert!(matches!(health, Health::Down | Health::Ours { .. }));
    }

    #[test]
    fn install_runtime_copies_and_is_idempotent() {
        let base = std::env::temp_dir().join(format!("ka-rt-{}", std::process::id()));
        let bundle = base.join("bundle");
        std::fs::create_dir_all(bundle.join("backend/app/__pycache__")).unwrap();
        std::fs::write(bundle.join("VERSION"), "1.2.3").unwrap();
        std::fs::write(bundle.join("docker-compose.yml"), "name: x").unwrap();
        std::fs::write(bundle.join("backend/app/main.py"), "x").unwrap();
        std::fs::write(bundle.join("backend/app/__pycache__/m.pyc"), "x").unwrap();
        std::fs::write(bundle.join("kontakte-akte-backend-image.tar.gz"), "x").unwrap();
        let paths = AppPaths { root: base.join("support") };
        install_runtime(&bundle, &paths).unwrap();
        assert!(paths.runtime().join("backend/app/main.py").is_file());
        assert!(!paths.runtime().join("backend/app/__pycache__").exists());
        assert!(!paths.runtime().join("kontakte-akte-backend-image.tar.gz").exists());
        install_runtime(&bundle, &paths).unwrap();
        std::fs::remove_dir_all(&base).unwrap();
    }
}
