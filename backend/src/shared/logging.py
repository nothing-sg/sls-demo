import json
import logging
import sys
from typing import Any

# HIPAA identifiers we never allow into CloudWatch. Modules should log
# `patient_id` (an opaque UUID) instead of any of these — see ADR-0003.
_PHI_FIELDS = {
    "name",
    "first_name",
    "last_name",
    "full_name",
    "dob",
    "date_of_birth",
    "ssn",
    "mrn",
    "address",
    "phone",
    "phone_number",
    "email",
}


class _PhiRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            record.extra_fields = _redact(extra)
        return True


def _redact(fields: dict[str, Any]) -> dict[str, Any]:
    return {
        key: ("[REDACTED]" if key.lower() in _PHI_FIELDS else value)
        for key, value in fields.items()
    }


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    handler.addFilter(_PhiRedactionFilter())
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_with_fields(logger: logging.Logger, level: int, message: str, **fields: Any) -> None:
    """Log with structured fields, redacted before they reach any handler.

    Use this instead of f-string interpolation whenever a field might be
    PHI-adjacent (e.g. patient records) — the redaction filter only inspects
    `extra_fields`, not the message string itself.
    """
    logger.log(level, message, extra={"extra_fields": fields})
