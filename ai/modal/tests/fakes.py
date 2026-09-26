"""A stand-in for openai.OpenAI: records requests, replays canned Responses."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any


class FakeClient:
    """`client.responses.create(**kwargs)` returns (or raises) the next queued item."""

    def __init__(self, *responses: Any) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self.responses = self

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("FakeClient: unexpected extra request")
        item = self._responses.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def _response(*content: SimpleNamespace, status: str = "completed", reason: str | None = None) -> SimpleNamespace:
    """A Response: a reasoning item (no answer in it) then one assistant message."""
    return SimpleNamespace(
        id="resp_test",
        object="response",
        status=status,
        incomplete_details=SimpleNamespace(reason=reason) if reason else None,
        output=[
            SimpleNamespace(type="reasoning", id="rs_test", summary=[]),
            SimpleNamespace(type="message", id="msg_test", role="assistant", status=status, content=list(content)),
        ],
    )


def text_response(text: str, status: str = "completed", reason: str | None = None) -> SimpleNamespace:
    """A Response whose message holds raw output_text (valid JSON or not)."""
    return _response(SimpleNamespace(type="output_text", text=text, annotations=[]), status=status, reason=reason)


def json_response(data: Any) -> SimpleNamespace:
    """A completed Structured Outputs Response carrying `data` as JSON text."""
    return text_response(json.dumps(data))


def refusal_response(refusal: str = "I'm sorry, I can't help with that.") -> SimpleNamespace:
    return _response(SimpleNamespace(type="refusal", refusal=refusal))


def reasoning_only_response() -> SimpleNamespace:
    """Reasoning used up the budget before any message was written."""
    return SimpleNamespace(
        id="resp_test", object="response", status="incomplete",
        incomplete_details=SimpleNamespace(reason="max_output_tokens"),
        output=[SimpleNamespace(type="reasoning", id="rs_test", summary=[])],
    )
