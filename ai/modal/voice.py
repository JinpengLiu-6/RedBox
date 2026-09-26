"""The Goblin King's voice: Gradium text-to-speech for taunts and the recap.

Plain module: no Modal import and the HTTP client is injected, so every rule is
testable offline with httpx.MockTransport. `app.py` wires `handle_voice` into
the `voice` web endpoint.

  POST voice  {"text": str, "kind": "taunt" | "recap"}   header x-voice-token
    200  raw Ogg Opus bytes (audio/ogg); header x-voice-chars = characters sent
    401  missing or wrong x-voice-token. The endpoint turns text into BILLED
         audio, so it is never open: an unset VOICE_TOKEN rejects everyone.
    422  the body is not {"text": str, "kind": "taunt" | "recap"}, or the text
         is empty once sanitised
    502  Gradium failed: unreachable, a non-200 answer, or a body that is not Ogg
    503  GRADIUM_API_KEY is empty in the container
    504  the WHOLE upstream call (connect, headers and body download) missed its
         deadline: taunt 6 s, recap 18 s

Secrets, both mounted by app.py from Modal: GRADIUM_API_KEY inside the existing
secret "openai", VOICE_TOKEN inside "redbox-voice". Neither value is ever
logged, returned, or put in an error detail; failures carry exception type names
and status codes only.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Mapping

import httpx

GRADIUM_TTS_URL = "https://api.gradium.ai/api/post/speech/tts"
#: Voice "Garrett": smooth, low US male. Override with GRADIUM_VOICE_ID.
DEFAULT_VOICE_ID = "POBHtemksfWQbng0"
GRADIUM_MODEL_NAME = "default"
OUTPUT_FORMAT = "opus"
#: Gradium's json_config is a JSON document sent as a STRING field.
JSON_CONFIG = json.dumps({"padding_bonus": 0.5})

API_KEY_ENV = "GRADIUM_API_KEY"
TOKEN_ENV = "VOICE_TOKEN"
VOICE_ID_ENV = "GRADIUM_VOICE_ID"
#: Non-secret overrides app.py bakes into the image env (like the model overrides).
VOICE_ENV_KEYS: tuple[str, ...] = (VOICE_ID_ENV,)

TOKEN_HEADER = "x-voice-token"
CHARS_HEADER = "x-voice-chars"
AUDIO_MEDIA_TYPE = "audio/ogg"
OGG_MAGIC = b"OggS"


@dataclass(frozen=True)
class KindLimits:
    #: Gradium bills 1 credit per character, so the cap is also a cost cap.
    max_chars: int
    #: Total wall-clock budget for the upstream call. The game server aborts
    #: after 8 s (taunt) / 22 s (recap), so an answer here always lands first.
    deadline_s: float


KINDS: dict[str, KindLimits] = {
    "taunt": KindLimits(max_chars=120, deadline_s=6.0),
    "recap": KindLimits(max_chars=600, deadline_s=18.0),
}

#: The request is ~700 bytes at most; anything far bigger is not ours.
MAX_BODY_BYTES = 16_384
#: 600 characters of speech is ~40 s, ~150-250 KB of Opus. Cap the download so a
#: misbehaving upstream cannot fill the container's memory.
MAX_AUDIO_BYTES = 4_000_000
#: Per-operation httpx timeouts are only a backstop: a body that trickles one
#: byte per second never trips a read timeout. fetch_speech() enforces the total.
BACKSTOP_TIMEOUT_S = max(limits.deadline_s for limits in KINDS.values())
#: One client per container serves up to this many concurrent inputs (app.py).
MAX_CONNECTIONS = 16

_VOICE_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
#: Characters that could open a Gradium markup tag (e.g. <break time="3s"/>).
_TAG_CHARS = frozenset("<>")
_SENTENCE_END = frozenset(".!?")
_TRAILING_JUNK = " ,;:-"


class VoiceInputError(ValueError):
    """The request body is not a usable voice request (HTTP 422)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        #: One of our own fixed reason codes, safe to return to the caller.
        self.code = code


@dataclass(frozen=True)
class VoiceSettings:
    """What the endpoint reads from the container env. Secrets stay out of repr()."""

    token: str = field(repr=False)
    api_key: str = field(repr=False)
    voice_id: str = DEFAULT_VOICE_ID


@dataclass(frozen=True)
class VoiceResult:
    status: int
    audio: bytes = field(default=b"", repr=False)
    #: Short, non-sensitive error code and reason; empty on success.
    error: str = ""
    detail: str = ""
    kind: str = ""
    #: Characters sent to Gradium (the billed amount); 0 if no call was made.
    chars: int = 0


# ---------------------------------------------------------------------------
# Settings and auth.
# ---------------------------------------------------------------------------


def resolve_voice_id(environ: Mapping[str, str]) -> str:
    candidate = environ.get(VOICE_ID_ENV, "").strip()
    return candidate if _VOICE_ID_RE.fullmatch(candidate) else DEFAULT_VOICE_ID


def voice_settings(environ: Mapping[str, str] | None = None) -> VoiceSettings:
    environ = os.environ if environ is None else environ
    return VoiceSettings(
        token=environ.get(TOKEN_ENV, "").strip(),
        api_key=environ.get(API_KEY_ENV, "").strip(),
        voice_id=resolve_voice_id(environ),
    )


def _secret_bytes(value: str | None) -> bytes:
    return (value or "").encode("utf-8", "surrogatepass")


def token_ok(provided: str | None, expected: str) -> bool:
    """Constant-time check of the x-voice-token header.

    hmac.compare_digest always runs, so timing does not reveal how much of a
    guess matched. An empty VOICE_TOKEN rejects every caller (fail closed).
    """
    matches = hmac.compare_digest(_secret_bytes(provided), _secret_bytes(expected))
    return matches and bool(expected)


# ---------------------------------------------------------------------------
# Request parsing and sanitising.
# ---------------------------------------------------------------------------


def _cap(text: str, max_chars: int) -> str:
    """Shorten to max_chars, preferring a sentence end, then a word boundary.

    Only a break in the second half of the budget counts, so a long first word
    cannot shrink the line to nothing.
    """
    if len(text) <= max_chars:
        return text
    floor = max_chars // 2
    for end in range(max_chars, floor, -1):
        if text[end - 1] in _SENTENCE_END and text[end] == " ":
            return text[:end]
    space = text.rfind(" ", floor, max_chars + 1)
    cut = text[:space] if space > 0 else text[:max_chars]
    return cut.rstrip(_TRAILING_JUNK)


def sanitize_text(text: str, max_chars: int) -> str:
    """What Gradium may speak: no markup, one line, at most max_chars characters.

    NFKC first, so full-width look-alikes of < and > are caught too. Tag
    brackets and whitespace become spaces, other control or format characters
    are dropped, and runs of spaces collapse to one.
    """
    kept = []
    for ch in unicodedata.normalize("NFKC", text):
        if ch.isspace() or ch in _TAG_CHARS:
            kept.append(" ")
        elif not unicodedata.category(ch).startswith("C"):
            kept.append(ch)
    return _cap(" ".join("".join(kept).split()), max_chars)


def parse_voice_request(raw: bytes) -> tuple[str, str]:
    """(kind, sanitised text) from the raw JSON body, or VoiceInputError."""
    if len(raw) > MAX_BODY_BYTES:
        raise VoiceInputError("body_too_large")
    try:
        body = json.loads(raw)
    except (ValueError, RecursionError):  # UnicodeDecodeError is a ValueError
        raise VoiceInputError("invalid_json") from None
    if not isinstance(body, dict):
        raise VoiceInputError("body_not_object")
    kind = body.get("kind")
    if not isinstance(kind, str) or kind not in KINDS:
        raise VoiceInputError("invalid_kind")
    text = body.get("text")
    if not isinstance(text, str):
        raise VoiceInputError("text_not_string")
    clean = sanitize_text(text, KINDS[kind].max_chars)
    if not clean:
        raise VoiceInputError("empty_text")
    return kind, clean


# ---------------------------------------------------------------------------
# Upstream: Gradium TTS.
# ---------------------------------------------------------------------------


def tts_request_body(text: str, voice_id: str) -> dict[str, Any]:
    return {
        "text": text,
        "voice_id": voice_id,
        "output_format": OUTPUT_FORMAT,
        "only_audio": True,
        "model_name": GRADIUM_MODEL_NAME,
        "json_config": JSON_CONFIG,
    }


def tts_headers(api_key: str) -> dict[str, str]:
    return {"x-api-key": api_key, "Content-Type": "application/json"}


def audio_problem(audio: bytes) -> str:
    """Why these bytes are not playable Ogg audio, or "" if they look right."""
    if not audio.startswith(OGG_MAGIC):
        return "not_ogg"
    return ""


def new_http_client(**overrides: Any) -> httpx.AsyncClient:
    """The per-container client (app.py caches one).

    No redirects: a redirect would carry x-api-key to wherever it points.
    Tests pass `transport=` to run this exact configuration offline.
    """
    options: dict[str, Any] = {
        "timeout": httpx.Timeout(BACKSTOP_TIMEOUT_S),
        "follow_redirects": False,
        "limits": httpx.Limits(max_connections=MAX_CONNECTIONS, max_keepalive_connections=MAX_CONNECTIONS // 2),
    }
    options.update(overrides)
    return httpx.AsyncClient(**options)


async def _download(client: Any, url: str, headers: dict[str, str], content: bytes, max_bytes: int) -> VoiceResult:
    async with client.stream("POST", url, headers=headers, content=content) as response:
        if response.status_code != 200:
            return VoiceResult(502, error="upstream_error", detail=f"status_{response.status_code}")
        audio = bytearray()
        async for chunk in response.aiter_bytes():
            audio += chunk
            if len(audio) >= len(OGG_MAGIC) and audio_problem(bytes(audio[: len(OGG_MAGIC)])):
                return VoiceResult(502, error="upstream_error", detail="not_ogg")  # stop downloading junk
            if len(audio) > max_bytes:
                return VoiceResult(502, error="upstream_error", detail="audio_too_large")
    problem = audio_problem(bytes(audio))
    if problem:
        return VoiceResult(502, error="upstream_error", detail=problem)
    return VoiceResult(200, audio=bytes(audio))


async def fetch_speech(
    client: Any,
    text: str,
    *,
    api_key: str,
    voice_id: str,
    deadline_s: float,
    url: str = GRADIUM_TTS_URL,
    max_bytes: int = MAX_AUDIO_BYTES,
) -> VoiceResult:
    """POST the text to Gradium and return the Ogg bytes, all within deadline_s.

    asyncio.timeout bounds the whole call: connecting, sending, the response
    headers AND every body chunk. httpx's own timeouts apply per operation, so a
    body that trickles in slower than the deadline but faster than the read
    timeout would otherwise run on for as long as the upstream likes.
    """
    content = json.dumps(tts_request_body(text, voice_id)).encode("utf-8")
    try:
        async with asyncio.timeout(deadline_s):
            return await _download(client, url, tts_headers(api_key), content, max_bytes)
    except TimeoutError:
        return VoiceResult(504, error="upstream_timeout", detail="deadline")
    except httpx.TimeoutException as exc:  # the per-operation backstop fired first
        return VoiceResult(504, error="upstream_timeout", detail=type(exc).__name__)
    except Exception as exc:  # noqa: BLE001 - the type name only: a message may quote headers
        return VoiceResult(502, error="upstream_error", detail=type(exc).__name__)


async def handle_voice(
    token: str | None,
    read_body: Callable[[], Awaitable[bytes]],
    settings: VoiceSettings,
    client_factory: Callable[[], Any],
) -> VoiceResult:
    """The whole endpoint: auth, then the body, then Gradium.

    The body is only read once the token matched, and nothing reaches Gradium
    (or builds a client) before the request is authorised and valid.
    """
    if not token_ok(token, settings.token):
        return VoiceResult(401, error="unauthorized")
    try:
        kind, text = parse_voice_request(await read_body())
    except VoiceInputError as exc:
        return VoiceResult(422, error="invalid_request", detail=exc.code)
    if not settings.api_key:
        return VoiceResult(503, error="voice_unavailable", detail="missing_api_key", kind=kind)
    try:
        client = client_factory()
    except Exception as exc:  # noqa: BLE001
        return VoiceResult(503, error="voice_unavailable", detail=type(exc).__name__, kind=kind)
    result = await fetch_speech(
        client, text, api_key=settings.api_key, voice_id=settings.voice_id, deadline_s=KINDS[kind].deadline_s,
    )
    return VoiceResult(result.status, result.audio, result.error, result.detail, kind=kind, chars=len(text))


__all__ = [
    "AUDIO_MEDIA_TYPE", "CHARS_HEADER", "DEFAULT_VOICE_ID", "GRADIUM_TTS_URL", "JSON_CONFIG", "KINDS",
    "MAX_AUDIO_BYTES", "MAX_BODY_BYTES", "OGG_MAGIC", "TOKEN_HEADER", "VOICE_ENV_KEYS",
    "KindLimits", "VoiceInputError", "VoiceResult", "VoiceSettings",
    "audio_problem", "fetch_speech", "handle_voice", "new_http_client", "parse_voice_request",
    "sanitize_text", "token_ok", "tts_headers", "tts_request_body", "voice_settings",
]
