//! Trusted bridge between the webview and the local backend.
//!
//! * The bridge token (random, rotated per launch, file mode 0600) and the
//!   session token live only in this process. Neither is ever returned to the
//!   webview: session tokens are stripped from setup/unlock responses.
//! * Only `/api/...` paths with fixed methods are forwarded to 127.0.0.1.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::docker::backend_url;
use crate::paths::{write_private, AppPaths};

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub code: String,
    pub message: String,
}

impl ApiError {
    fn new(status: u16, code: &str, message: &str) -> Self {
        Self { status, code: code.into(), message: message.into() }
    }
}

pub struct Bridge {
    bridge_token: Mutex<String>,
    session_token: Mutex<Option<String>>,
}

pub fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

impl Bridge {
    pub fn new() -> Self {
        Self { bridge_token: Mutex::new(String::new()), session_token: Mutex::new(None) }
    }

    /// Generates a fresh bridge token and writes it (0600) for the backend to read.
    pub fn rotate_token(&self, paths: &AppPaths) -> Result<(), String> {
        let token = random_hex(32)?;
        write_private(&paths.bridge_token(), token.as_bytes())?;
        *self.bridge_token.lock().unwrap() = token;
        Ok(())
    }

    pub fn has_session(&self) -> bool {
        self.session_token.lock().unwrap().is_some()
    }

    pub fn clear_session(&self) {
        *self.session_token.lock().unwrap() = None;
    }

    pub fn request(&self, method: &str, path: &str, body: Option<Value>) -> Result<Value, ApiError> {
        validate(method, path)?;
        let token = self.bridge_token.lock().unwrap().clone();
        if token.is_empty() {
            return Err(ApiError::new(0, "backend_unreachable", "Die lokale Datenbank ist nicht erreichbar."));
        }
        let session = self.session_token.lock().unwrap().clone();
        let route = path.split('?').next().unwrap_or(path);
        let slow = route.starts_with("/api/backups") || route.starts_with("/api/auth/");
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(3))
            .timeout(Duration::from_secs(if slow { 300 } else { 60 }))
            .redirects(0)
            .build();
        let mut request = agent.request(method, &format!("{}{}", backend_url(), path)).set("X-KA-Bridge", &token);
        if let Some(session) = &session {
            request = request.set("Authorization", &format!("Bearer {session}"));
        }
        let result = match method {
            "GET" | "DELETE" => request.call(),
            _ => request.send_json(body.unwrap_or_else(|| Value::Object(Default::default()))),
        };

        if route == "/api/auth/lock" {
            self.clear_session();
        }

        match result {
            Ok(response) => {
                let mut json: Value = response.into_json().unwrap_or(Value::Null);
                if route == "/api/auth/setup" || route == "/api/auth/unlock" {
                    if let Some(obj) = json.as_object_mut() {
                        if let Some(Value::String(token)) = obj.remove("session_token") {
                            *self.session_token.lock().unwrap() = Some(token);
                        }
                    }
                }
                Ok(json)
            }
            Err(ureq::Error::Status(status, response)) => {
                let json: Value = response.into_json().unwrap_or(Value::Null);
                let detail = json.get("detail");
                let code = detail.and_then(|d| d.get("code")).and_then(|c| c.as_str()).unwrap_or("error");
                let message = detail
                    .and_then(|d| d.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Ein unerwarteter Fehler ist aufgetreten.");
                if status == 423 || (status == 401 && code == "unauthorized") {
                    self.clear_session();
                }
                Err(ApiError::new(status, code, message))
            }
            Err(ureq::Error::Transport(_)) => {
                Err(ApiError::new(0, "backend_unreachable", "Die lokale Datenbank ist nicht erreichbar."))
            }
        }
    }
}

fn validate(method: &str, path: &str) -> Result<(), ApiError> {
    if !matches!(method, "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
        return Err(ApiError::new(400, "bridge", "Methode nicht erlaubt."));
    }
    let ok = path.starts_with("/api/")
        && path.len() <= 2048
        && !path.contains("..")
        && !path.contains("//")
        && !path.contains('#')
        && path.chars().all(|c| c.is_ascii_graphic());
    if !ok {
        return Err(ApiError::new(400, "bridge", "Pfad nicht erlaubt."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_api() {
        assert!(validate("GET", "/api/contacts/abc").is_ok());
        assert!(validate("GET", "/api/reminders?tz=Europe%2FBerlin").is_ok());
        for bad in ["/etc/passwd", "/api/../x", "http://evil/api/x", "/api//x", "/api/x y", "/api/x#frag", "api/x"] {
            assert!(validate("GET", bad).is_err(), "{bad}");
        }
        assert!(validate("TRACE", "/api/health").is_err());
    }

    #[test]
    fn random_tokens_are_unique_and_long() {
        let a = random_hex(32).unwrap();
        let b = random_hex(32).unwrap();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }

    #[test]
    fn unreachable_backend_maps_to_error_code() {
        let bridge = Bridge::new();
        *bridge.bridge_token.lock().unwrap() = "x".repeat(64);
        // Nothing should listen on the backend port during unit tests; if the
        // real backend is running it rejects the fake token instead.
        let err = bridge.request("GET", "/api/auth/status", None).unwrap_err();
        assert!(err.code == "backend_unreachable" || err.status == 401);
    }
}
