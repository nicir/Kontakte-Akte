from __future__ import annotations


class ServiceError(Exception):
    """Domain error with a German, user-presentable message."""

    status_code = 400
    code = "invalid"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFound(ServiceError):
    status_code = 404
    code = "not_found"


class Conflict(ServiceError):
    status_code = 409
    code = "conflict"


class Invalid(ServiceError):
    status_code = 422
    code = "invalid"
