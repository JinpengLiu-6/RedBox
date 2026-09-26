"""Voice endpoint: auth, sanitising, the exact Gradium request, response checks,
the total deadline, and that no secret ever leaks.

Offline by construction: Gradium is replaced by httpx.MockTransport (running the
production client configuration from voice.new_http_client) or, for the one
test that needs real socket timing, by a server on 127.0.0.1 started here. No
real key or token is read; the dummies below are distinctive so a leak is easy
to spot.
"""

from __future__ import annotations

import _socket
import ast
import asyncio
import contextlib
import inspect
import json
import logging
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import fastapi
import httpx
import modal
import pytest
from fastapi.testclient import TestClient

import conftest
import voice

APP_SOURCE = Path(__file__).resolve().parents[1] / "app.py"
VOICE_SOURCE = Path(__file__).resolve().parents[1] / "voice.py"
README = Path(__file__).resolve().parents[1] / "README.md"

DUMMY_KEY = "gradium-DUMMY-key-9f3c1a77"
DUMMY_TOKEN = "voice-DUMMY-token-5be20d41"
#: Looks like the start of an Ogg page; enough for the magic check.
OGG = b"OggS\x00\x02" + bytes(range(64)) * 4
SECRETS = (DUMMY_KEY, DUMMY_TOKEN)


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------


def settings(**overrides) -> voice.VoiceSettings:
    values = {"token": DUMMY_TOKEN, "api_key": DUMMY_KEY, "voice_id": voice.DEFAULT_VOICE_ID}
    values.update(overrides)
    return voice.VoiceSettings(**values)


class Gradium:
    """A fake Gradium behind httpx.MockTransport: records requests, replays one answer."""

    def __init__(self, answer=None) -> None:
        self.answer = answer if answer is not None else (lambda _req: httpx.Response(200, content=OGG))
        self.requests: list[httpx.Request] = []
        self.clients_built = 0

    async def _handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        result = self.answer(request)
        return await result if inspect.isawaitable(result) else result

    def client(self) -> httpx.AsyncClient:
        self.clients_built += 1
        return voice.new_http_client(transport=httpx.MockTransport(self._handle))


class Body:
    """read_body for handle_voice that records whether it was read."""

    def __init__(self, payload) -> None:
        self.raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.reads = 0

    async def __call__(self) -> bytes:
        self.reads += 1
        return self.raw


def handle(payload, gradium: Gradium | None = None, header: str | None = DUMMY_TOKEN, **settings_overrides):
    """Run handle_voice with `header` as the x-voice-token value."""
    gradium = gradium or Gradium()
    body = Body(payload)
    result = asyncio.run(voice.handle_voice(header, body, settings(**settings_overrides), gradium.client))
    return result, gradium, body


def fetch(gradium: Gradium, text: str = "Drop my crate, Dwarf!", **kwargs) -> voice.VoiceResult:
    kwargs.setdefault("deadline_s", 5.0)

    async def run():
        async with gradium.client() as client:
            return await voice.fetch_speech(
                client, text, api_key=DUMMY_KEY, voice_id=voice.DEFAULT_VOICE_ID, **kwargs,
            )

    return asyncio.run(run())


class Trickle(httpx.AsyncByteStream):
    """A response body that arrives one small piece every `gap` seconds."""

    def __init__(self, first: bytes, pieces: int, gap: float, piece: bytes = b"\x00" * 16) -> None:
        self.first, self.pieces, self.gap, self.piece = first, pieces, gap, piece
        self.sent = 0

    async def __aiter__(self):
        self.sent += 1
        yield self.first
        for _ in range(self.pieces):
            await asyncio.sleep(self.gap)
            self.sent += 1
            yield self.piece


def assert_no_secret(*texts) -> None:
    for text in texts:
        for secret in SECRETS:
            assert secret not in str(text)


# ---------------------------------------------------------------------------
# Auth.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "token",
    [None, "", "wrong", DUMMY_TOKEN[:-1], DUMMY_TOKEN + "x", DUMMY_TOKEN.upper(), f" {DUMMY_TOKEN}"],
)
def test_missing_or_wrong_token_is_401_before_anything_else(token):
    result, gradium, body = handle({"text": "Hand it over!", "kind": "taunt"}, header=token)
    assert (result.status, result.error, result.detail) == (401, "unauthorized", "")
    assert result.audio == b"" and result.chars == 0
    assert body.reads == 0            # the body is not even read
    assert gradium.clients_built == 0  # no client, no upstream call, nothing billed
    assert gradium.requests == []


def test_an_empty_voice_token_locks_the_endpoint_for_everyone():
    for header in (None, "", "anything"):
        result, gradium, _ = handle({"text": "Hand it over!", "kind": "taunt"}, header=header, token="")
        assert result.status == 401 and gradium.requests == []
    assert voice.token_ok("", "") is False
    assert voice.token_ok(None, "") is False


def test_token_check_is_constant_time(monkeypatch):
    seen = []
    real = voice.hmac.compare_digest

    def spy(a, b):
        seen.append((type(a), type(b)))
        return real(a, b)

    monkeypatch.setattr(voice.hmac, "compare_digest", spy)
    assert voice.token_ok(DUMMY_TOKEN, DUMMY_TOKEN) is True
    assert voice.token_ok("wrong", DUMMY_TOKEN) is False
    assert voice.token_ok(None, DUMMY_TOKEN) is False
    assert voice.token_ok("caf\u00e9-\ud800", DUMMY_TOKEN) is False  # odd header bytes do not raise
    # compare_digest ran for every check, on bytes (str would reject non-ASCII).
    assert seen == [(bytes, bytes)] * 4
    # ...and no shortcut comparison sits next to it.
    tree = ast.parse(inspect.getsource(voice.token_ok))
    assert not [n for n in ast.walk(tree) if isinstance(n, ast.Compare)]


def test_right_token_reaches_gradium():
    result, gradium, body = handle({"text": "Hand it over!", "kind": "taunt"})
    assert result.status == 200 and body.reads == 1 and len(gradium.requests) == 1


# ---------------------------------------------------------------------------
# Sanitising and caps.
# ---------------------------------------------------------------------------


def test_sanitize_strips_tags_and_collapses_whitespace():
    raw = 'Hand it  over,\n\tDwarf!<break time="5s"/>  Now<speak>\u200b!\x07'
    clean = voice.sanitize_text(raw, 120)
    assert "<" not in clean and ">" not in clean
    assert clean == 'Hand it over, Dwarf! break time="5s"/ Now speak !'


def test_sanitize_catches_full_width_brackets():
    clean = voice.sanitize_text("\uff1cbreak time=\"9s\"/\uff1e Mine!", 120)
    assert clean == 'break time="9s"/ Mine!'


@pytest.mark.parametrize("kind, cap", [("taunt", 120), ("recap", 600)])
def test_caps_per_kind(kind, cap):
    assert voice.KINDS[kind].max_chars == cap
    exact = "x" * cap
    assert voice.parse_voice_request(json.dumps({"text": exact, "kind": kind}).encode()) == (kind, exact)
    _, clean = voice.parse_voice_request(json.dumps({"text": "word " * 400, "kind": kind}).encode())
    assert len(clean) <= cap
    assert clean.endswith("word")  # cut on a word boundary, never mid-word
    _, clean = voice.parse_voice_request(json.dumps({"text": "y" * 5000, "kind": kind}).encode())
    assert clean == "y" * cap  # no space at all: a hard cut


def test_cap_prefers_a_sentence_end_then_a_word():
    text = "Three towers fell. " * 10  # 190 chars
    assert voice.sanitize_text(text, 120) == ("Three towers fell. " * 6).strip()
    assert voice.sanitize_text("Mine, all mine, every crate, " * 8, 60) == "Mine, all mine, every crate, Mine, all mine, every crate"


@pytest.mark.parametrize(
    "raw, detail",
    [
        (b"not json", "invalid_json"),
        (b"\xff\xfe\x00", "invalid_json"),
        (b"[" * 5000, "invalid_json"),
        (b'["text", "kind"]', "body_not_object"),
        (b'"Hand it over"', "body_not_object"),
        (json.dumps({"text": "Hand it over"}).encode(), "invalid_kind"),
        (json.dumps({"text": "Hand it over", "kind": "song"}).encode(), "invalid_kind"),
        (json.dumps({"text": "Hand it over", "kind": ["taunt"]}).encode(), "invalid_kind"),
        (json.dumps({"kind": "taunt"}).encode(), "text_not_string"),
        (json.dumps({"text": 42, "kind": "taunt"}).encode(), "text_not_string"),
        (json.dumps({"text": "", "kind": "taunt"}).encode(), "empty_text"),
        (json.dumps({"text": " <> \n\t<  >\u200b ", "kind": "recap"}).encode(), "empty_text"),
        (json.dumps({"text": "a" * (voice.MAX_BODY_BYTES + 1), "kind": "taunt"}).encode(), "body_too_large"),
    ],
)
def test_bad_bodies_are_422_and_never_reach_gradium(raw, detail):
    result, gradium, _ = handle(raw)
    assert (result.status, result.error, result.detail) == (422, "invalid_request", detail)
    assert gradium.requests == [] and gradium.clients_built == 0


# ---------------------------------------------------------------------------
# The upstream request.
# ---------------------------------------------------------------------------


def test_exact_upstream_request():
    result, gradium, _ = handle({"text": "Drop my <b>crate</b>,\n Dwarf!", "kind": "taunt"})
    assert result.status == 200
    (request,) = gradium.requests
    assert request.method == "POST"
    assert str(request.url) == "https://api.gradium.ai/api/post/speech/tts" == voice.GRADIUM_TTS_URL
    assert request.headers["x-api-key"] == DUMMY_KEY
    assert request.headers["content-type"] == "application/json"
    assert "authorization" not in request.headers
    body = json.loads(request.content)
    assert body == {
        "text": "Drop my b crate /b , Dwarf!",
        "voice_id": "POBHtemksfWQbng0",
        "output_format": "opus",
        "only_audio": True,
        "model_name": "default",
        "json_config": '{"padding_bonus": 0.5}',
    }
    assert body["only_audio"] is True
    assert isinstance(body["json_config"], str)  # a JSON document inside a string, not an object
    assert json.loads(body["json_config"]) == {"padding_bonus": 0.5}


def test_voice_id_override_and_fallback():
    assert voice.voice_settings({}).voice_id == "POBHtemksfWQbng0"
    assert voice.voice_settings({"GRADIUM_VOICE_ID": " Abc_12-XY "}).voice_id == "Abc_12-XY"
    for junk in ("", "   ", "../../admin", "two words", "x" * 65, "id;rm", "<break/>"):
        assert voice.voice_settings({"GRADIUM_VOICE_ID": junk}).voice_id == voice.DEFAULT_VOICE_ID

    result, gradium, _ = handle({"text": "Hand it over!", "kind": "taunt"}, voice_id="Abc_12-XY")
    assert result.status == 200
    assert json.loads(gradium.requests[0].content)["voice_id"] == "Abc_12-XY"


def test_settings_come_from_the_env_trimmed_and_hidden_from_repr():
    s = voice.voice_settings({"VOICE_TOKEN": f" {DUMMY_TOKEN}\n", "GRADIUM_API_KEY": f"{DUMMY_KEY} "})
    assert (s.token, s.api_key) == (DUMMY_TOKEN, DUMMY_KEY)
    assert_no_secret(repr(s))


# ---------------------------------------------------------------------------
# Responses.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", ["taunt", "recap"])
def test_success_returns_the_ogg_bytes_and_the_billed_chars(kind):
    result, _, _ = handle({"text": "  Three  towers\nfell. ", "kind": kind})
    assert result.status == 200
    assert result.audio == OGG
    assert (result.kind, result.chars) == (kind, len("Three towers fell."))
    assert (result.error, result.detail) == ("", "")


def test_magic_split_across_chunks_is_fine():
    class Split(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"Og"
            yield b"gS" + OGG[4:]

    result = fetch(Gradium(lambda _r: httpx.Response(200, stream=Split())))
    assert result.status == 200 and result.audio == OGG


@pytest.mark.parametrize("status", [301, 302, 400, 401, 402, 403, 404, 422, 429, 500, 502, 503])
def test_non_200_is_502_with_a_short_reason(status):
    echo = json.dumps({"detail": f"bad key {DUMMY_KEY}"}).encode()  # an upstream that echoes the key
    gradium = Gradium(lambda _r: httpx.Response(status, content=echo, headers={"location": "https://evil.example/"}))
    result, gradium, _ = handle({"text": "Hand it over!", "kind": "taunt"}, gradium)
    assert (result.status, result.error, result.detail) == (502, "upstream_error", f"status_{status}")
    assert result.audio == b""
    assert len(gradium.requests) == 1  # redirects are never followed (they would carry x-api-key)
    assert_no_secret(result)


@pytest.mark.parametrize(
    "body",
    [b"", b"Ogg", b"ID3\x04\x00" + OGG, b"RIFF\x00\x00\x00\x00WAVEfmt ", b'{"error": "quota"}', b"oggs" + OGG[4:]],
)
def test_a_body_that_is_not_ogg_is_502(body):
    result = fetch(Gradium(lambda _r: httpx.Response(200, content=body, headers={"content-type": "audio/ogg"})))
    assert (result.status, result.detail) == (502, "not_ogg")
    assert result.audio == b""


def test_junk_is_not_downloaded_past_the_first_chunk():
    trickle = Trickle(first=b"<html>", pieces=50, gap=0.0)
    result = fetch(Gradium(lambda _r: httpx.Response(200, stream=trickle)))
    assert (result.status, result.detail) == (502, "not_ogg")
    assert trickle.sent == 1


def test_oversized_audio_is_502():
    result = fetch(Gradium(lambda _r: httpx.Response(200, content=OGG * 10)), max_bytes=len(OGG) * 2)
    assert (result.status, result.detail) == (502, "audio_too_large")


def test_transport_errors_are_502_with_the_type_name_only():
    def boom(request):
        raise httpx.ConnectError(f"cannot reach, key={DUMMY_KEY}", request=request)

    result, _, _ = handle({"text": "Hand it over!", "kind": "taunt"}, Gradium(boom))
    assert (result.status, result.error, result.detail) == (502, "upstream_error", "ConnectError")

    def bad_header(_request):
        raise ValueError(f"Illegal header value {DUMMY_KEY!r}")

    result, _, _ = handle({"text": "Hand it over!", "kind": "taunt"}, Gradium(bad_header))
    assert (result.status, result.detail) == (502, "ValueError")
    assert_no_secret(result)


def test_missing_api_key_is_503_and_calls_nothing():
    result, gradium, _ = handle({"text": "Hand it over!", "kind": "taunt"}, api_key="")
    assert (result.status, result.error, result.detail) == (503, "voice_unavailable", "missing_api_key")
    assert gradium.clients_built == 0


# ---------------------------------------------------------------------------
# The total deadline.
# ---------------------------------------------------------------------------


#: The game server's own aborts: AbortSignal.timeout(8000) for a taunt and 22 s
#: for a recap (backend/src/ai/voice.ts, backend/src/ai/voiceClient.ts).
GAME_SERVER_ABORT_S = {"taunt": 8.0, "recap": 22.0}


def test_deadlines_per_kind_fit_the_game_server_aborts(monkeypatch):
    assert voice.KINDS["taunt"].deadline_s == 6.0
    assert voice.KINDS["recap"].deadline_s == 18.0
    # The headroom the docs promise for Modal routing on a warm container.
    headroom = {kind: GAME_SERVER_ABORT_S[kind] - voice.KINDS[kind].deadline_s for kind in voice.KINDS}
    assert headroom == {"taunt": 2.0, "recap": 4.0}
    seen = []

    async def recording_fetch(client, text, *, api_key, voice_id, deadline_s, **_kw):
        seen.append(deadline_s)
        return voice.VoiceResult(200, audio=OGG)

    monkeypatch.setattr(voice, "fetch_speech", recording_fetch)
    handle({"text": "Hand it over!", "kind": "taunt"})
    handle({"text": "A recap.", "kind": "recap"})
    assert seen == [6.0, 18.0]


def test_docs_do_not_promise_the_answer_beats_the_game_server_abort():
    # The deadline starts inside the function, after Modal routing and any cold
    # start, so nothing guarantees the answer lands before the game server gives
    # up. The docs must say so instead of claiming it "always" arrives in time.
    readme = README.read_text()
    source = VOICE_SOURCE.read_text()
    for text in (readme, source):
        flat = " ".join(word for word in text.split() if word not in ("#", "#:"))  # join wrapped comments
        assert "always lands first" not in flat
        assert "our answer always reaches it" not in flat
        assert "2 s / 4 s" in flat
        assert "cold start" in flat
    assert "Gradium still bills its characters" in " ".join(readme.split())


def test_slow_headers_hit_the_deadline():
    async def slow(_request):
        await asyncio.sleep(5)
        return httpx.Response(200, content=OGG)

    started = time.monotonic()
    result = fetch(Gradium(slow), deadline_s=0.2)
    assert (result.status, result.error, result.detail) == (504, "upstream_timeout", "deadline")
    assert time.monotonic() - started < 2


def test_trickling_body_hits_the_total_deadline():
    """Every piece arrives 20 ms after the last, so no per-read timer would fire."""
    trickle = Trickle(first=OGG[:8], pieces=200, gap=0.02)  # ~4 s in total
    started = time.monotonic()
    result = fetch(Gradium(lambda _r: httpx.Response(200, stream=trickle)), deadline_s=0.3)
    elapsed = time.monotonic() - started
    assert (result.status, result.detail) == (504, "deadline")
    assert 0.25 < elapsed < 2
    assert 1 < trickle.sent < 200  # it was mid-download when the deadline cut it


def test_the_per_operation_timeout_is_only_a_backstop():
    async def raise_read_timeout(request):
        raise httpx.ReadTimeout("read timed out", request=request)

    result = fetch(Gradium(raise_read_timeout))
    assert (result.status, result.detail) == (504, "ReadTimeout")


@contextlib.contextmanager
def trickle_server(first: bytes, pieces: int, gap: float, piece: bytes = b"\x00" * 16):
    """A real HTTP server on 127.0.0.1 that sends headers, then trickles the body."""

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):  # noqa: N802 - http.server naming
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            self.send_response(200)
            self.send_header("Content-Type", "audio/ogg")
            self.send_header("Content-Length", str(len(first) + pieces * len(piece)))
            self.end_headers()
            try:
                self.wfile.write(first)
                for _ in range(pieces):
                    time.sleep(gap)
                    self.wfile.write(piece)
            except OSError:
                pass  # the client hung up (the deadline test)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/api/post/speech/tts"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def loopback_only(monkeypatch):
    """Lift conftest's network block for 127.0.0.1 only."""

    def connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and address[0] in ("127.0.0.1", "::1"):
            return _socket.socket.connect(sock, address)
        raise RuntimeError("network access is disabled in ai/modal tests")

    monkeypatch.setattr(socket.socket, "connect", connect)


def test_real_socket_trickle_outlives_the_read_timeout_but_not_the_deadline(loopback_only, caplog):
    """The proof, over a real TCP connection where httpx's timeouts are live.

    With a 0.5 s per-read timeout: (1) a single 1 s stall IS caught, so the
    timer works; (2) a 1 s body trickling in every 0.1 s is NOT caught - each
    read finishes well inside 0.5 s - so plain httpx waits for all of it;
    (3) fetch_speech with a 0.5 s total deadline cuts that same body at 0.5 s.
    """
    caplog.set_level(logging.DEBUG)
    read_timeout = httpx.Timeout(0.5)

    async def plain_read(url: str) -> tuple[int, int]:
        async with voice.new_http_client(timeout=read_timeout, trust_env=False) as client:
            response = await client.post(url, content=b"{}", headers=voice.tts_headers(DUMMY_KEY))
            return response.status_code, len(response.content)

    async def bounded(url: str) -> voice.VoiceResult:
        async with voice.new_http_client(timeout=read_timeout, trust_env=False) as client:
            return await voice.fetch_speech(
                client, "Hand it over!", api_key=DUMMY_KEY, voice_id=voice.DEFAULT_VOICE_ID, deadline_s=0.5, url=url,
            )

    # (1) The per-read timeout is really armed: one long stall trips it.
    with trickle_server(OGG[:8], pieces=1, gap=1.0) as url:
        with pytest.raises(httpx.ReadTimeout):
            asyncio.run(plain_read(url))

    # (2) A trickle whose gaps are shorter than the read timeout sails through it.
    with trickle_server(OGG[:8], pieces=10, gap=0.1) as url:
        started = time.monotonic()
        status, size = asyncio.run(plain_read(url))
        elapsed = time.monotonic() - started
    assert (status, size) == (200, 8 + 10 * 16)
    assert elapsed >= 0.95  # twice the 0.5 s read timeout, and nothing fired

    # (3) The total deadline stops the same trickle at 0.5 s.
    with trickle_server(OGG[:8], pieces=10, gap=0.1) as url:
        started = time.monotonic()
        result = asyncio.run(bounded(url))
        elapsed = time.monotonic() - started
    assert (result.status, result.detail) == (504, "deadline")
    assert 0.45 <= elapsed < 0.95  # cut before the trickle's 1 s total

    assert_no_secret(caplog.text)  # httpx/httpcore debug logs never carry the key


# ---------------------------------------------------------------------------
# app.py wiring: the Modal endpoint, over HTTP.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def app_module():
    import app

    return app


@pytest.fixture
def http(app_module, monkeypatch):
    """A FastAPI app routing POST / to serve_voice, as modal.fastapi_endpoint does,
    with the container env and the per-container client replaced."""
    monkeypatch.setenv("VOICE_TOKEN", DUMMY_TOKEN)
    monkeypatch.setenv("GRADIUM_API_KEY", DUMMY_KEY)
    gradium = Gradium()
    client = gradium.client()
    monkeypatch.setattr(app_module, "_voice_client", lambda: client)

    api = fastapi.FastAPI()

    async def endpoint(request: fastapi.Request):
        return await app_module.serve_voice(request)

    api.add_api_route("/", endpoint, methods=["POST"])
    with TestClient(api) as test_client:
        yield test_client, gradium


def _decorators(function_name: str) -> dict[str, dict]:
    tree = ast.parse(APP_SOURCE.read_text())
    fn = next(n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == function_name)
    return {
        ast.unparse(deco.func): {
            kw.arg: kw.value.value if isinstance(kw.value, ast.Constant) else ast.unparse(kw.value)
            for kw in deco.keywords
        }
        for deco in fn.decorator_list
    }


def test_voice_endpoint_is_declared(app_module):
    assert isinstance(app_module.voice, modal.Function)
    assert app_module.SECRET_NAME == "openai"
    assert app_module.VOICE_SECRET_NAME == "redbox-voice"
    decorators = _decorators("voice")
    assert list(decorators) == ["app.function", "modal.concurrent", "modal.fastapi_endpoint"]
    assert decorators["modal.fastapi_endpoint"] == {"method": "POST"}
    assert decorators["app.function"]["secrets"] == "voice_secrets"
    assert "min_containers" not in decorators["app.function"]
    assert decorators["app.function"]["timeout"] > voice.KINDS["recap"].deadline_s

    tree = ast.parse(APP_SOURCE.read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "voice")
    assert [ast.unparse(a.annotation) for a in fn.args.args] == ["Request"]  # FastAPI injects the request
    assert app_module.Request is fastapi.Request
    assert app_module._voice_client.cache_info().currsize == 0  # no client built at import


def test_voice_secrets_and_image(app_module):
    source = APP_SOURCE.read_text()
    assert 'modal.Secret.from_name(SECRET_NAME, required_keys=["GRADIUM_API_KEY"])' in source
    assert 'modal.Secret.from_name(VOICE_SECRET_NAME, required_keys=["VOICE_TOKEN"])' in source
    assert '"httpx==0.28.1"' in source
    assert '.add_local_python_source("goblin_king", "voice")' in source
    # The key and token are only read by voice.voice_settings, from the env, per request.
    voice_source = VOICE_SOURCE.read_text()
    assert "print(" not in voice_source and "logging" not in voice_source
    assert "str(exc)" not in voice_source and "{exc}" not in voice_source


def test_model_env_bakes_the_voice_id_but_never_a_secret(app_module):
    environ = {"GRADIUM_VOICE_ID": " Abc_12-XY ", "GRADIUM_API_KEY": DUMMY_KEY, "VOICE_TOKEN": DUMMY_TOKEN}
    assert app_module.model_env(environ) == {"GRADIUM_VOICE_ID": "Abc_12-XY"}
    assert set(voice.VOICE_ENV_KEYS) < set(conftest.SCRUBBED_ENV)
    assert {"GRADIUM_API_KEY", "VOICE_TOKEN"} < set(conftest.SCRUBBED_ENV)


def test_real_client_config(app_module):
    client = app_module._voice_client.__wrapped__()  # bypass the per-container cache
    try:
        assert isinstance(client, httpx.AsyncClient)
        assert client.follow_redirects is False
        assert client.timeout == httpx.Timeout(voice.BACKSTOP_TIMEOUT_S)
        assert voice.BACKSTOP_TIMEOUT_S == 18.0
    finally:
        asyncio.run(client.aclose())


def test_http_200_is_raw_ogg_with_the_char_count(http, capsys):
    test_client, gradium = http
    response = test_client.post(
        "/", json={"text": "Drop my crate, Dwarf!", "kind": "taunt"}, headers={"x-voice-token": DUMMY_TOKEN},
    )
    assert response.status_code == 200
    assert response.content == OGG
    assert response.headers["content-type"] == "audio/ogg"
    assert response.headers["x-voice-chars"] == str(len("Drop my crate, Dwarf!"))
    assert response.headers["cache-control"] == "no-store"
    assert len(gradium.requests) == 1
    log = capsys.readouterr().out
    assert log.startswith(f"voice kind=taunt status=200 chars=21 bytes={len(OGG)} ms=")
    assert "Dwarf" not in log  # one status line, never the text


def test_http_errors_are_json(http):
    test_client, gradium = http
    payload = {"text": "Hand it over!", "kind": "taunt"}

    response = test_client.post("/", json=payload)
    assert response.status_code == 401 and response.json() == {"error": "unauthorized", "detail": ""}
    response = test_client.post("/", json=payload, headers={"x-voice-token": "nope"})
    assert response.status_code == 401

    response = test_client.post("/", json={"text": "<>", "kind": "taunt"}, headers={"x-voice-token": DUMMY_TOKEN})
    assert response.status_code == 422
    assert response.json() == {"error": "invalid_request", "detail": "empty_text"}

    huge = b'{"kind": "taunt", "text": "' + b"a" * 200_000 + b'"}'
    response = test_client.post("/", content=huge, headers={"x-voice-token": DUMMY_TOKEN})
    assert response.status_code == 422 and response.json()["detail"] == "body_too_large"
    assert gradium.requests == []


def test_http_without_the_env_token_is_401(http, monkeypatch):
    test_client, gradium = http
    monkeypatch.delenv("VOICE_TOKEN")
    response = test_client.post("/", json={"text": "Hi", "kind": "taunt"}, headers={"x-voice-token": ""})
    assert response.status_code == 401 and gradium.requests == []


def test_the_key_and_token_never_appear_in_any_response_or_log(app_module, monkeypatch, capsys, caplog):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setenv("VOICE_TOKEN", DUMMY_TOKEN)
    monkeypatch.setenv("GRADIUM_API_KEY", DUMMY_KEY)

    async def slow(_request):
        await asyncio.sleep(5)

    def raising(request):
        raise httpx.ConnectError(f"refused with key {DUMMY_KEY} token {DUMMY_TOKEN}", request=request)

    echo = json.dumps({"error": f"invalid key {DUMMY_KEY}"}).encode()
    upstreams = [
        lambda _r: httpx.Response(200, content=OGG),
        lambda _r: httpx.Response(401, content=echo),
        lambda _r: httpx.Response(200, content=echo),
        raising,
        slow,
    ]
    monkeypatch.setitem(voice.KINDS, "taunt", voice.KindLimits(max_chars=120, deadline_s=0.2))
    seen_statuses = []
    for upstream in upstreams:
        gradium = Gradium(upstream)
        client = gradium.client()
        monkeypatch.setattr(app_module, "_voice_client", lambda client=client: client)
        api = fastapi.FastAPI()

        async def endpoint(request: fastapi.Request):
            return await app_module.serve_voice(request)

        api.add_api_route("/", endpoint, methods=["POST"])
        with TestClient(api) as test_client:
            for token in (DUMMY_TOKEN, "wrong", None):
                headers = {"x-voice-token": token} if token is not None else {}
                response = test_client.post("/", json={"text": "Hand it over!", "kind": "taunt"}, headers=headers)
                seen_statuses.append(response.status_code)
                if response.status_code != 200:
                    assert_no_secret(response.text)
                assert_no_secret(json.dumps(dict(response.headers)))
    assert sorted(set(seen_statuses)) == [200, 401, 502, 504]
    captured = capsys.readouterr()
    assert_no_secret(captured.out, captured.err, caplog.text)
