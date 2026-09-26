"""The request kwargs are valid for the real Anthropic SDK and its typed Message
parses through our extractor. Uses an in-process mock transport and a dummy key:
nothing leaves the process and no real credential is read."""

from __future__ import annotations

import json
import socket

import anthropic
import httpx2
import pytest

import goblin_king as gk


def sdk_client(tool_name: str, tool_input: dict, model: str, seen: list) -> anthropic.Anthropic:
    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append((request.method, request.url.path, json.loads(request.content)))
        return httpx2.Response(200, json={
            "id": "msg_mock", "type": "message", "role": "assistant", "model": model,
            "content": [{"type": "tool_use", "id": "toolu_mock", "name": tool_name, "input": tool_input}],
            "stop_reason": "tool_use", "stop_sequence": None,
            "usage": {"input_tokens": 900, "output_tokens": 80},
        })

    return anthropic.Anthropic(
        api_key="dummy-key-for-offline-tests",
        max_retries=0,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )


def test_the_suite_cannot_reach_the_network():
    with pytest.raises(RuntimeError, match="network access is disabled"):
        socket.create_connection(("api.anthropic.com", 443), timeout=1)


def test_director_through_the_real_sdk(snapshot_fixture):
    seen: list = []
    output = {"focus": "dwarf", "threatBias": {"dwarf": 1.7}, "taunt": "Crate thief Dwarf, my club says hi!", "reasoning": "Carrier."}
    client = sdk_client(gk.DIRECTOR_TOOL_NAME, output, gk.DIRECTOR_MODEL, seen)
    status, decision = gk.handle_director(snapshot_fixture, client)
    assert (status, decision) == (200, output)
    ((method, path, body),) = seen
    assert (method, path) == ("POST", "/v1/messages")
    assert body["model"] == "claude-haiku-4-5-20251001"
    assert body["tool_choice"] == {"type": "tool", "name": gk.DIRECTOR_TOOL_NAME}
    assert body["tools"][0]["strict"] is True and body["tools"][0]["input_schema"] == gk.DIRECTOR_TOOL["input_schema"]
    assert "Carrying a crate: Dwarf Demolitionist." in body["messages"][0]["content"]


def test_debrief_through_the_real_sdk(debrief_fixture):
    seen: list = []
    output = {"summary": "Eight crates gone. I am furious.", "highlights": ["a", "b", "c"], "mvpPlayerId": "Xk3fQ9aLm"}
    client = sdk_client(gk.DEBRIEF_TOOL_NAME, output, gk.DEBRIEF_MODEL, seen)
    status, payload = gk.handle_debrief(debrief_fixture, client)
    assert (status, payload) == (200, output)
    ((_, _, body),) = seen
    assert body["model"] == "claude-sonnet-5"
    assert body["thinking"] == {"type": "disabled"}
    assert body["tool_choice"] == {"type": "tool", "name": gk.DEBRIEF_TOOL_NAME}
    assert set(body) == {"model", "max_tokens", "system", "thinking", "tools", "tool_choice", "messages"}
