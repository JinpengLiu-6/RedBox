"""A stand-in for anthropic.Anthropic: records requests, replays canned Messages."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any


class FakeClient:
    """`client.messages.create(**kwargs)` returns (or raises) the next queued item."""

    def __init__(self, *responses: Any) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self.messages = self

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("FakeClient: unexpected extra request")
        item = self._responses.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def tool_message(name: str, data: Any, stop_reason: str = "tool_use") -> SimpleNamespace:
    """A Message whose only content block is a tool_use call."""
    return SimpleNamespace(
        id="msg_test",
        role="assistant",
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="tool_use", id="toolu_test", name=name, input=data)],
    )


def text_message(text: str, stop_reason: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(
        id="msg_test",
        role="assistant",
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=text)],
    )
