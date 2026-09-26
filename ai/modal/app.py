"""Modal app `redbox-ai`: the optional Goblin King voice (director) and debrief.

Two POST web endpoints, both optional for play - the game server only calls
them when DIRECTOR_URL / DEBRIEF_URL are set, and falls back locally on any
non-200 answer or timeout:

  director  DirectorSnapshot -> DirectorDecision   (Claude Haiku 4.5, kept warm)
  debrief   DebriefRequest   -> DebriefPayload     (Claude Sonnet 5)

All prompt building and validation lives in goblin_king.py (pure, offline
testable). This file is only the Modal + HTTP wiring. Deploy: see README.md.
"""

from __future__ import annotations

import functools
import time
from typing import Any, Callable

import modal

from goblin_king import DEBRIEF_MODEL, DIRECTOR_MODEL, handle_debrief, handle_director

APP_NAME = "redbox-ai"
#: Modal secret holding ANTHROPIC_API_KEY. Created by the user, never by code.
SECRET_NAME = "anthropic"
#: The game server aborts the director call after 2.5 s (DIRECTOR.TIMEOUT_MS);
#: leave room for the network hop and answer 503 instead of hanging.
DIRECTOR_UPSTREAM_TIMEOUT_S = 2.0
#: The game server gives the debrief 15 s.
DEBRIEF_UPSTREAM_TIMEOUT_S = 12.0

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("anthropic==1.8.0", "fastapi[standard]==0.141.1")
    .add_local_python_source("goblin_king")
)

app = modal.App(APP_NAME, image=image)
anthropic_secret = modal.Secret.from_name(SECRET_NAME, required_keys=["ANTHROPIC_API_KEY"])


@functools.lru_cache(maxsize=None)
def _client(timeout_s: float) -> Any:
    """One Anthropic client per container and timeout.

    The SDK picks ANTHROPIC_API_KEY up from the environment (injected by the
    Modal secret); this code never reads or logs it. No retries: a late answer
    is worthless to a 2.5 s director budget, and the game falls back anyway.
    """
    import anthropic

    return anthropic.Anthropic(timeout=timeout_s, max_retries=0)


def _serve(
    name: str,
    body: Any,
    handler: Callable[[Any, Any], tuple[int, dict[str, Any]]],
    timeout_s: float,
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
    print(f"{name} status={status} ms={elapsed_ms}{detail}", flush=True)
    if status == 200:
        return payload
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=status, content=payload)


def serve_director(body: Any, client_factory: Callable[[float], Any] | None = None) -> Any:
    return _serve("director", body, handle_director, DIRECTOR_UPSTREAM_TIMEOUT_S, client_factory)


def serve_debrief(body: Any, client_factory: Callable[[float], Any] | None = None) -> Any:
    return _serve("debrief", body, handle_debrief, DEBRIEF_UPSTREAM_TIMEOUT_S, client_factory)


@app.function(secrets=[anthropic_secret], min_containers=1, max_containers=3, timeout=30)
@modal.concurrent(max_inputs=16)
@modal.fastapi_endpoint(method="POST")
def director(snapshot: dict):
    """POST DirectorSnapshot -> DirectorDecision. Warm: the demo never waits on a cold start."""
    return serve_director(snapshot)


@app.function(secrets=[anthropic_secret], max_containers=2, scaledown_window=300, timeout=60)
@modal.concurrent(max_inputs=8)
@modal.fastapi_endpoint(method="POST")
def debrief(request: dict):
    """POST DebriefRequest -> DebriefPayload. Called once per match end."""
    return serve_debrief(request)


__all__ = [
    "APP_NAME", "DEBRIEF_MODEL", "DIRECTOR_MODEL", "SECRET_NAME",
    "app", "debrief", "director", "serve_debrief", "serve_director",
]
