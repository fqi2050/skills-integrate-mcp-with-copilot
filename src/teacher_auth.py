"""Teacher credential and signed-session helpers."""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

TEACHERS_FILE = Path(os.getenv("TEACHERS_FILE", Path(__file__).parent / "teachers.json"))
SESSION_COOKIE_NAME = "teacher_session"
SESSION_TTL_SECONDS = 8 * 60 * 60
PASSWORD_HASH_ITERATIONS = 600_000
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    """Create a salted PBKDF2 password hash suitable for teachers.json."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )
    salt_text = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    digest_text = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}${salt_text}${digest_text}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password hash, rejecting malformed or unexpectedly weak hashes."""
    try:
        algorithm, iterations_text, salt_text, digest_text = password_hash.split("$")
        iterations = int(iterations_text)
        if (
            algorithm != PASSWORD_HASH_PREFIX
            or not 100_000 <= iterations <= 2_000_000
        ):
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, iterations
        )
    except (AttributeError, ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def _read_teachers() -> dict[str, str]:
    try:
        configuration = json.loads(TEACHERS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        logger.error("Teacher credential file is missing: %s", TEACHERS_FILE)
        raise HTTPException(
            status_code=503,
            detail="Teacher sign-in is not configured. See src/README.md.",
        ) from error
    except (OSError, json.JSONDecodeError) as error:
        logger.exception("Could not read teacher credential file %s", TEACHERS_FILE)
        raise HTTPException(
            status_code=503,
            detail="Teacher credentials could not be loaded.",
        ) from error

    teachers = configuration.get("teachers") if isinstance(configuration, dict) else None
    if not isinstance(teachers, list):
        logger.error("Teacher credential file must contain a teachers list")
        raise HTTPException(
            status_code=503,
            detail="Teacher credentials are misconfigured.",
        )

    credentials: dict[str, str] = {}
    for teacher in teachers:
        if (
            not isinstance(teacher, dict)
            or not isinstance(teacher.get("username"), str)
            or not teacher["username"].strip()
            or not isinstance(teacher.get("password_hash"), str)
        ):
            logger.error("Teacher credential file contains an invalid entry")
            raise HTTPException(
                status_code=503,
                detail="Teacher credentials are misconfigured.",
            )
        credentials[teacher["username"]] = teacher["password_hash"]
    return credentials


def authenticate_teacher(username: str, password: str) -> bool:
    password_hash = _read_teachers().get(username)
    return password_hash is not None and verify_password(password, password_hash)


def _session_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET")
    if not secret or len(secret.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=503,
            detail="Teacher sessions are not configured. Set SESSION_SECRET.",
        )
    return secret.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def create_session(username: str) -> tuple[str, str]:
    csrf_token = secrets.token_urlsafe(32)
    payload = json.dumps(
        {
            "username": username,
            "expires": int(time.time()) + SESSION_TTL_SECONDS,
            "csrf": csrf_token,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = _encode(payload)
    signature = hmac.new(
        _session_secret(), encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded_payload}.{_encode(signature)}", csrf_token


def read_session(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None

    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        supplied_signature = base64.urlsafe_b64decode(
            encoded_signature + "=" * (-len(encoded_signature) % 4)
        )
        expected_signature = hmac.new(
            _session_secret(), encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return None

        payload_bytes = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        session = json.loads(payload_bytes)
        if (
            not isinstance(session, dict)
            or not isinstance(session.get("username"), str)
            or not isinstance(session.get("csrf"), str)
            or not isinstance(session.get("expires"), int)
            or session["expires"] < int(time.time())
        ):
            return None
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return session


def current_teacher(request: Request) -> dict[str, Any] | None:
    return read_session(request.cookies.get(SESSION_COOKIE_NAME))


def require_teacher(
    request: Request, csrf_token: str | None
) -> dict[str, Any]:
    session = current_teacher(request)
    if session is None:
        raise HTTPException(status_code=401, detail="Teacher sign-in required")
    if not csrf_token or not hmac.compare_digest(session["csrf"], csrf_token):
        raise HTTPException(status_code=403, detail="Invalid CSRF token")
    return session


def session_cookie_secure() -> bool:
    value = os.getenv("SESSION_COOKIE_SECURE", "false").lower()
    if value not in {"true", "false"}:
        raise HTTPException(
            status_code=503,
            detail="SESSION_COOKIE_SECURE must be either true or false.",
        )
    return value == "true"
