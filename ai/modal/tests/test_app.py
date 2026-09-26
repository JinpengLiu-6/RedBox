"""app.py imports offline, declares the endpoints the brief asks for, and maps
handler results to HTTP responses - all without building a real client."""

from __future__ import annotations

import ast
import json
from pathlib import Path

import modal
import pytest

import goblin_king as gk
from fakes import FakeClient, tool_message

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
    assert app_module.DIRECTOR_MODEL == "claude-haiku-4-5-20251001"
    assert app_module.DEBRIEF_MODEL == "claude-sonnet-5"
    assert app_module.SECRET_NAME == "anthropic"
    assert app_module._client.cache_info().currsize == 0  # no Anthropic client built at import


def test_endpoints_are_post_and_only_the_director_is_warm():
    director, debrief = _decorators("director"), _decorators("debrief")
    for decorators in (director, debrief):
        assert list(decorators) == ["app.function", "modal.concurrent", "modal.fastapi_endpoint"]
        assert decorators["modal.fastapi_endpoint"] == {"method": "POST"}
        assert decorators["app.function"]["secrets"] == "[anthropic_secret]"
    assert director["app.function"]["min_containers"] == 1
    assert "min_containers" not in debrief["app.function"]


def test_secret_is_referenced_by_name_only():
    source = APP_SOURCE.read_text()
    assert 'modal.Secret.from_name(SECRET_NAME, required_keys=["ANTHROPIC_API_KEY"])' in source
    assert "os.environ" not in source and "getenv" not in source


def test_upstream_timeouts_fit_the_game_server_budgets(app_module):
    assert app_module.DIRECTOR_UPSTREAM_TIMEOUT_S < 2.5  # DIRECTOR.TIMEOUT_MS
    assert app_module.DEBRIEF_UPSTREAM_TIMEOUT_S < 15    # debrief fetch timeout in brief 09


def test_serve_director_returns_the_contract_json(app_module, snapshot_fixture):
    fake = FakeClient(tool_message(gk.DIRECTOR_TOOL_NAME, {
        "focus": "dwarf", "threatBias": {"dwarf": 9}, "taunt": "Hand over my crate, Dwarf!", "reasoning": "Carrier.",
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

    junk = FakeClient(tool_message(gk.DEBRIEF_TOOL_NAME, {"summary": "", "highlights": [], "mvpPlayerId": ""}))
    response = app_module.serve_debrief(debrief_fixture, client_factory=lambda _t: junk)
    assert response.status_code == 502
