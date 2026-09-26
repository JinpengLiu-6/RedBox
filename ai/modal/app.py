"""Modal app `redbox-ai`: the optional Goblin King director, debrief and voice.

Three POST web endpoints, all optional for play - the game server only calls
them when DIRECTOR_URL / DEBRIEF_URL / VOICE_URL are set, and carries on
without them on any non-200 answer or timeout:

  director  DirectorSnapshot -> DirectorDecision   (DIRECTOR_MODEL, default gpt-6-luna, kept warm)
  debrief   DebriefRequest   -> DebriefPayload     (DEBRIEF_MODEL, default gpt-6-luna)
  voice     {text, kind}     -> Ogg Opus bytes     (Gradium TTS; needs the x-voice-token header)

director and debrief call the OpenAI Responses API with Structured Outputs
(strict JSON schema); all prompt building and validation lives in
goblin_king.py. voice calls Gradium; sanitising, auth and the deadline-bounded
upstream call live in voice.py. Both modules are plain and offline testable.
This file is only the Modal + HTTP wiring. Deploy: see README.md.
"""

from __future__ import annotations

import functools
import os
import time
from typing import Any, Callable, Mapping

import modal
from fastapi import Request

from goblin_king import (
    DEFAULT_DEBRIEF_MODEL,
    DEFAULT_DIRECTOR_MODEL,
    MODEL_ENV_KEYS,
    debrief_model,
    director_model,
    handle_debrief,
    handle_director,
)
from voice import (
    AUDIO_MEDIA_TYPE,
    CHARS_HEADER,
    MAX_BODY_BYTES,
    TOKEN_HEADER,
    VOICE_ENV_KEYS,
    handle_voice,
    new_http_client,
    voice_settings,
)

APP_NAME = "redbox-ai"
#: Modal secret holding the OpenAI API key. Created by the user, never by code;
#: the SDK reads the key from the container environment, this file never does.
SECRET_NAME = "openai"
#: The game server aborts the director call after 6 s (DIRECTOR.TIMEOUT_MS). The
#: call is asynchronous - the tick never waits on it - so the budget only bounds
#: staleness. Measured warm end-to-end: 2.2-2.9 s. Leave room for the network hop
#: and answer 503 instead of hanging.
DIRECTOR_UPSTREAM_TIMEOUT_S = 5.0
#: The game server gives the debrief 25 s (measured: ~11.6 s end-to-end).
DEBRIEF_UPSTREAM_TIMEOUT_S = 20.0
#: Modal secret holding VOICE_TOKEN, the shared secret the game server sends in
#: the x-voice-token header. GRADIUM_API_KEY lives in SECRET_NAME ("openai").
VOICE_SECRET_NAME = "redbox-voice"


def model_env(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    """Non-secret overrides (MODEL_ENV_KEYS, VOICE_ENV_KEYS) set in the deploying shell.

    Baked into the image env so `DIRECTOR_MODEL=... modal deploy ai/modal/app.py`
    (or GRADIUM_VOICE_ID=...) reaches the container. Only these keys are read;
    everything else, API keys and the voice token included, is ignored.
    """
    environ = os.environ if environ is None else environ
    keys = MODEL_ENV_KEYS + VOICE_ENV_KEYS
    return {key: environ[key].strip() for key in keys if environ.get(key, "").strip()}


image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("openai==3.19.2", "fastapi[standard]==0.141.1", "httpx==0.28.1")
    .env(model_env())
    .add_local_python_source("goblin_king", "voice")
)

app = modal.App(APP_NAME, image=image)
openai_secret = modal.Secret.from_name(SECRET_NAME, required_keys=["OPENAI_API_KEY"])
#: The voice endpoint needs both: the Gradium key (stored in the "openai"
#: secret) and the token that callers must present. Deploy fails if either is missing.
voice_secrets = [
    modal.Secret.from_name(SECRET_NAME, required_keys=["GRADIUM_API_KEY"]),
    modal.Secret.from_name(VOICE_SECRET_NAME, required_keys=["VOICE_TOKEN"]),
]


@functools.lru_cache(maxsize=None)
def _client(timeout_s: float) -> Any:
    """One OpenAI client per container and timeout.

    The SDK picks the API key up from the environment (injected by the Modal
    secret); this code never reads or logs it. No retries: a late answer is
    worthless to a 6 s director budget, and the game falls back anyway.
    """
    import openai

    return openai.OpenAI(timeout=timeout_s, max_retries=0)


def _serve(
    name: str,
    body: Any,
    handler: Callable[[Any, Any], tuple[int, dict[str, Any]]],
    timeout_s: float,
    model: str,
    client_factory: Callable[[float], Any] | None = None,
) -> Any:
    """Run a handler and turn (status, payload) into an HTTP response.

    200 returns the contract JSON; anything else is a JSONResponse with an
    `error` code so the game server's fallback kicks in.
    """
    started = time.perf_counter()
    try:
        client = (client_factory or _client)(timeout_s)
    except Exception as exc:  # noqa: BLE001 - e.g. missing credentials
        status, payload = 503, {"error": "client_unavailable", "detail": type(exc).__name__}
    else:
        status, payload = handler(body, client)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    detail = "" if status == 200 else f" error={payload.get('error')} detail={payload.get('detail')}"
    print(f"{name} model={model} status={status} ms={elapsed_ms}{detail}", flush=True)
    if status == 200:
        return payload
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=status, content=payload)


@functools.lru_cache(maxsize=None)
def _voice_client() -> Any:
    """One httpx.AsyncClient per container, built on the first authorised request.

    Modal runs every input of an async function on the container's one event
    loop, so the client's connection pool is shared by all of them.
    """
    return new_http_client()


async def _read_capped_body(request: Any) -> bytes:
    """The request body, but never more than MAX_BODY_BYTES + 1 bytes of it."""
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            break
    return bytes(body)


async def serve_voice(
    request: Any,
    client_factory: Callable[[], Any] | None = None,
    environ: Mapping[str, str] | None = None,
) -> Any:
    """Run the voice handler and turn its result into an HTTP response.

    200 is the raw Ogg Opus audio with x-voice-chars (characters billed); every
    other status is a JSONResponse {error, detail} with no secret in it. One log
    line per request: kind, status, characters, bytes, latency. Never the text,
    the token or the key.
    """
    from fastapi.responses import JSONResponse, Response

    started = time.perf_counter()
    result = await handle_voice(
        request.headers.get(TOKEN_HEADER),
        lambda: _read_capped_body(request),
        voice_settings(environ),
        client_factory or _voice_client,
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    detail = "" if result.status == 200 else f" error={result.error} detail={result.detail}"
    print(
        f"voice kind={result.kind or '-'} status={result.status} chars={result.chars} "
        f"bytes={len(result.audio)} ms={elapsed_ms}{detail}",
        flush=True,
    )
    if result.status == 200:
        return Response(
            content=result.audio,
            media_type=AUDIO_MEDIA_TYPE,
            headers={CHARS_HEADER: str(result.chars), "cache-control": "no-store"},
        )
    return JSONResponse(status_code=result.status, content={"error": result.error, "detail": result.detail})


def serve_director(body: Any, client_factory: Callable[[float], Any] | None = None) -> Any:
    return _serve("director", body, handle_director, DIRECTOR_UPSTREAM_TIMEOUT_S, director_model(), client_factory)


def serve_debrief(body: Any, client_factory: Callable[[float], Any] | None = None) -> Any:
    return _serve("debrief", body, handle_debrief, DEBRIEF_UPSTREAM_TIMEOUT_S, debrief_model(), client_factory)


@app.function(secrets=[openai_secret], min_containers=1, max_containers=3, timeout=30)
@modal.concurrent(max_inputs=16)
@modal.fastapi_endpoint(method="POST")
def director(snapshot: dict):
    """POST DirectorSnapshot -> DirectorDecision. Warm: the demo never waits on a cold start."""
    return serve_director(snapshot)


@app.function(secrets=[openai_secret], max_containers=2, scaledown_window=300, timeout=60)
@modal.concurrent(max_inputs=8)
@modal.fastapi_endpoint(method="POST")
def debrief(request: dict):
    """POST DebriefRequest -> DebriefPayload. Called once per match end."""
    return serve_debrief(request)


@app.function(secrets=voice_secrets, max_containers=2, scaledown_window=300, timeout=30)
@modal.concurrent(max_inputs=16)
@modal.fastapi_endpoint(method="POST")
async def voice(request: Request):
    """POST {text, kind} with header x-voice-token -> audio/ogg. 401 without the token."""
    return await serve_voice(request)


__all__ = [
    "APP_NAME", "DEFAULT_DEBRIEF_MODEL", "DEFAULT_DIRECTOR_MODEL", "SECRET_NAME", "VOICE_SECRET_NAME",
    "app", "debrief", "director", "model_env", "serve_debrief", "serve_director", "serve_voice", "voice",
]
