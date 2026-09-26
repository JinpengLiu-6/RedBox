"""app.py imports offline, declares the endpoints the brief asks for, and maps
handler results to HTTP responses - all without building a real client."""

from __future__ import annotations

import ast
import json
from pathlib import Path

import modal
import pytest

import conftest
import goblin_king as gk
from fakes import FakeClient, json_response

APP_SOURCE = Path(__file__).resolve().parents[1] / "app.py"


@pytest.fixture(scope="module")
def app_module():
    import app

    return app


def _decorators(function_name: str) -> dict[str, dict]:
    """{decorator call: {keyword: literal-or-source}} for a top-level function in app.py."""
    tree = ast.parse(APP_SOURCE.read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == function_name)
    out = {}
    for deco in fn.decorator_list:
        assert isinstance(deco, ast.Call), ast.unparse(deco)
        out[ast.unparse(deco.func)] = {
            kw.arg: kw.value.value if isinstance(kw.value, ast.Constant) else ast.unparse(kw.value)
            for kw in deco.keywords
        }
    return out


def test_app_module_imports_offline(app_module):
    assert app_module.app.name == "redbox-ai"
    assert isinstance(app_module.director, modal.Function)
    assert isinstance(app_module.debrief, modal.Function)
    assert app_module.DEFAULT_DIRECTOR_MODEL == "gpt-6-luna"
    assert app_module.DEFAULT_DEBRIEF_MODEL == "gpt-6-sol"
    assert app_module.SECRET_NAME == "openai"
    assert app_module._client.cache_info().currsize == 0  # no OpenAI client built at import


def test_endpoints_are_post_and_only_the_director_is_warm():
    director, debrief = _decorators("director"), _decorators("debrief")
    for decorators in (director, debrief):
        assert list(decorators) == ["app.function", "modal.concurrent", "modal.fastapi_endpoint"]
        assert decorators["modal.fastapi_endpoint"] == {"method": "POST"}
        assert decorators["app.function"]["secrets"] == "[openai_secret]"
    assert director["app.function"]["min_containers"] == 1
    assert "min_containers" not in debrief["app.function"]


def test_secret_is_referenced_by_name_only():
    source = APP_SOURCE.read_text()
    assert 'modal.Secret.from_name(SECRET_NAME, required_keys=["OPENAI_API_KEY"])' in source
    assert source.count("OPENAI_API_KEY") == 1  # only the required-keys check names it
    assert "getenv" not in source
    # The one environment read is model_env(), which only copies MODEL_ENV_KEYS.
    assert source.count("os.environ") == 1 and "environ = os.environ if environ is None" in source


def test_model_env_copies_only_the_model_overrides(app_module):
    environ = {
        "OPENAI_API_KEY": "sk-dummy-never-copied",
        "DIRECTOR_MODEL": "  gpt-custom-director ",
        "DEBRIEF_MODEL": "   ",
        "DEBRIEF_REASONING_EFFORT": "medium",
        "HOME": "/home/someone",
    }
    assert app_module.model_env(environ) == {"DIRECTOR_MODEL": "gpt-custom-director", "DEBRIEF_REASONING_EFFORT": "medium"}
    assert app_module.model_env({}) == {}
    assert set(gk.MODEL_ENV_KEYS) < set(conftest.SCRUBBED_ENV)  # tests never inherit a developer override


def test_upstream_timeouts_fit_the_game_server_budgets(app_module):
    assert app_module.DIRECTOR_UPSTREAM_TIMEOUT_S < 6.0  # DIRECTOR.TIMEOUT_MS
    assert app_module.DEBRIEF_UPSTREAM_TIMEOUT_S < 25    # DEBRIEF_TIMEOUT_MS in backend/src/ai/debrief.ts


@pytest.mark.parametrize("budget", ["DIRECTOR_UPSTREAM_TIMEOUT_S", "DEBRIEF_UPSTREAM_TIMEOUT_S"])
def test_real_client_has_the_budget_timeout_and_no_retries(app_module, monkeypatch, budget):
    """SDK defaults are a 600 s read timeout and 2 retries: far past the game server's abort."""
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key-for-offline-tests")
    timeout_s = getattr(app_module, budget)
    client = app_module._client.__wrapped__(timeout_s)  # bypass the per-container cache
    assert client.timeout == timeout_s
    assert client.max_retries == 0


def test_without_a_key_the_real_client_answers_503(app_module, snapshot_fixture):
    """conftest removed OPENAI_API_KEY: the SDK refuses to build, the game falls back."""
    response = app_module.serve_director(snapshot_fixture)
    assert response.status_code == 503
    assert json.loads(response.body) == {"error": "client_unavailable", "detail": "OpenAIError"}


def test_serve_director_returns_the_contract_json(app_module, snapshot_fixture, capsys):
    fake = FakeClient(json_response({
        "focus": "dwarf", "threatBias": {"mage": None, "troll": None, "brawler": None, "dwarf": 9, "warrior": None},
        "taunt": "Hand over my crate, Dwarf!", "reasoning": "Carrier.",
    }))
    timeouts = []

    def factory(timeout_s):
        timeouts.append(timeout_s)
        return fake

    result = app_module.serve_director(snapshot_fixture, client_factory=factory)
    assert result == {
        "focus": "dwarf", "threatBias": {"dwarf": 2.0}, "taunt": "Hand over my crate, Dwarf!", "reasoning": "Carrier.",
    }
    assert timeouts == [app_module.DIRECTOR_UPSTREAM_TIMEOUT_S]
    assert fake.calls[0]["model"] == "gpt-6-luna"
    log = capsys.readouterr().out
    assert log.startswith("director model=gpt-6-luna status=200 ms=")
    assert "Dwarf" not in log  # one status line, never prompts or answers


def test_serve_debrief_uses_the_env_model(app_module, debrief_fixture, monkeypatch, capsys):
    monkeypatch.setenv("DEBRIEF_MODEL", "gpt-custom-debrief")
    fake = FakeClient(json_response({"summary": "One. Two. Three.", "highlights": [], "mvpPlayerId": ""}))
    result = app_module.serve_debrief(debrief_fixture, client_factory=lambda _t: fake)
    assert set(result) == {"summary", "highlights", "mvpPlayerId"}
    assert fake.calls[0]["model"] == "gpt-custom-debrief"
    assert "debrief model=gpt-custom-debrief status=200" in capsys.readouterr().out


def test_serve_maps_failures_to_http_errors(app_module, snapshot_fixture, debrief_fixture):
    def no_credentials(_timeout_s):
        raise RuntimeError("no credentials")

    response = app_module.serve_debrief(debrief_fixture, client_factory=no_credentials)
    assert response.status_code == 503
    assert json.loads(response.body) == {"error": "client_unavailable", "detail": "RuntimeError"}

    response = app_module.serve_director(snapshot_fixture, client_factory=lambda _t: FakeClient(TimeoutError()))
    assert response.status_code == 503 and json.loads(response.body)["error"] == "upstream_error"

    response = app_module.serve_director(["not", "a", "snapshot"], client_factory=lambda _t: FakeClient())
    assert response.status_code == 400

    junk = FakeClient(json_response({"summary": "", "highlights": [], "mvpPlayerId": ""}))
    response = app_module.serve_debrief(debrief_fixture, client_factory=lambda _t: junk)
    assert response.status_code == 502
