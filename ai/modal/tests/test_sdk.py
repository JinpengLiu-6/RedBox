"""The request kwargs are valid for the real OpenAI SDK and its typed Response
parses through our extractor. Uses an in-process mock transport and a dummy key:
nothing leaves the process and no real credential is read."""

from __future__ import annotations

import json
import socket

import httpx2
import openai
import pytest

import goblin_king as gk

DUMMY_KEY = "dummy-key-for-offline-tests"


def response_json(model: str, content: list[dict], status: str = "completed") -> dict:
    """A Responses API body as the server sends it: a reasoning item, then the message."""
    return {
        "id": "resp_mock", "object": "response", "created_at": 1790000000, "status": status,
        "model": model, "error": None, "incomplete_details": None,
        "instructions": None, "metadata": {}, "parallel_tool_calls": True,
        "temperature": None, "top_p": None, "tool_choice": "auto", "tools": [],
        "output": [
            {"type": "reasoning", "id": "rs_mock", "summary": []},
            {"type": "message", "id": "msg_mock", "role": "assistant", "status": "completed", "content": content},
        ],
        "usage": {
            "input_tokens": 900, "output_tokens": 80, "total_tokens": 980,
            "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0},
        },
    }


def sdk_client(content: list[dict], seen: list) -> openai.OpenAI:
    def handler(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        seen.append((request.method, request.url.path, request.headers.get("authorization"), body))
        return httpx2.Response(200, json=response_json(body["model"], content))

    return openai.OpenAI(
        api_key=DUMMY_KEY,
        max_retries=0,
        http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )


def output_text(data: dict) -> list[dict]:
    return [{"type": "output_text", "text": json.dumps(data), "annotations": []}]


def test_the_suite_cannot_reach_the_network():
    with pytest.raises(RuntimeError, match="network access is disabled"):
        socket.create_connection(("api.openai.com", 443), timeout=1)


def test_director_through_the_real_sdk(snapshot_fixture):
    seen: list = []
    output = {
        "focus": "dwarf", "threatBias": {"mage": None, "troll": None, "brawler": None, "dwarf": 1.7, "warrior": None},
        "taunt": "Crate thief Dwarf, my club says hi!", "reasoning": "Carrier.",
    }
    status, decision = gk.handle_director(snapshot_fixture, sdk_client(output_text(output), seen))
    assert (status, decision) == (200, {**output, "threatBias": {"dwarf": 1.7}})
    ((method, path, auth, body),) = seen
    assert (method, path, auth) == ("POST", "/v1/responses", f"Bearer {DUMMY_KEY}")
    assert body["model"] == "gpt-6-luna"
    assert body["reasoning"] == {"effort": "none"}
    assert body["store"] is False
    assert body["text"] == {"format": gk.DIRECTOR_FORMAT}  # sent verbatim: strict json_schema
    assert body["text"]["format"]["strict"] is True
    assert body["instructions"] == gk.DIRECTOR_SYSTEM
    assert "Carrying a crate: Dwarf Demolitionist." in body["input"]


def test_debrief_through_the_real_sdk(debrief_fixture):
    seen: list = []
    output = {
        "summary": "Eight crates gone. I am furious. Tess, I will remember your beard.",
        "highlights": ["a", "b", "c"], "mvpPlayerId": "Xk3fQ9aLm",
    }
    status, payload = gk.handle_debrief(debrief_fixture, sdk_client(output_text(output), seen))
    assert (status, payload) == (200, output)
    ((_, path, _, body),) = seen
    assert path == "/v1/responses"
    assert body["model"] == "gpt-6-luna"
    assert body["reasoning"] == {"effort": "low"}
    assert body["text"] == {"format": gk.DEBRIEF_FORMAT}
    assert set(body) == {"model", "instructions", "input", "text", "reasoning", "max_output_tokens", "store"}


def test_env_model_reaches_the_wire(snapshot_fixture, monkeypatch):
    monkeypatch.setenv("DIRECTOR_MODEL", "gpt-custom-director")
    monkeypatch.setenv("DIRECTOR_REASONING_EFFORT", "omit")
    seen: list = []
    output = {"focus": None, "threatBias": dict.fromkeys(gk.CLASS_IDS), "taunt": "Dwarf, drop my crate!", "reasoning": "x"}
    status, _ = gk.handle_director(snapshot_fixture, sdk_client(output_text(output), seen))
    ((_, _, _, body),) = seen
    assert status == 200 and body["model"] == "gpt-custom-director" and "reasoning" not in body


def test_refusal_through_the_real_sdk_is_a_502(snapshot_fixture):
    seen: list = []
    client = sdk_client([{"type": "refusal", "refusal": "I can't help with that."}], seen)
    status, payload = gk.handle_director(snapshot_fixture, client)
    assert (status, payload) == (502, {"error": "invalid_model_output", "detail": "model refused"})


def test_http_errors_from_the_sdk_are_a_503(snapshot_fixture):
    """E.g. an unknown DIRECTOR_MODEL: OpenAI answers 400, the game falls back."""

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, json={"error": {"message": "model not found", "type": "invalid_request_error"}})

    client = openai.OpenAI(
        api_key=DUMMY_KEY, max_retries=0,
        http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    status, payload = gk.handle_director(snapshot_fixture, client)
    assert (status, payload) == (503, {"error": "upstream_error", "detail": "BadRequestError"})
