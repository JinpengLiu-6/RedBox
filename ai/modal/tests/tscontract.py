"""Reads the frozen TypeScript contract in shared/src so the tests can diff the
Python side against it. Deliberately tiny: it understands exactly the shapes
used by events.ts / messages.ts / classes.ts / constants.ts and fails loudly on
anything else, so a contract change cannot slip past silently.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

SHARED_SRC = Path(__file__).resolve().parents[3] / "shared" / "src"


def source(name: str) -> str:
    text = (SHARED_SRC / name).read_text()
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"(^|\s)//[^\n]*", r"\1", text)


def _matching_brace(text: str, open_index: int) -> int:
    depth = 0
    for i in range(open_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise AssertionError("unbalanced braces in TS source")


def _block_after(text: str, pattern: str) -> str:
    match = re.search(pattern, text)
    assert match, f"TS contract: {pattern!r} not found"
    start = text.index("{", match.end() - 1)
    return text[start + 1 : _matching_brace(text, start)]


@dataclass(frozen=True)
class Field:
    name: str
    optional: bool
    ts_type: str


def parse_fields(body: str) -> dict[str, Field]:
    """Top-level `name?: type;` members of an object type body."""
    members, depth, current = [], 0, []
    for ch in body:
        if ch in "{<([":
            depth += 1
        elif ch in "}>)]":
            depth -= 1
        if ch in ";\n" and depth == 0:
            members.append("".join(current))
            current = []
        else:
            current.append(ch)
    members.append("".join(current))
    fields: dict[str, Field] = {}
    for member in members:
        member = " ".join(member.split())
        if not member:
            continue
        match = re.fullmatch(r"(\w+)(\?)?\s*:\s*(.+?)\s*;?", member)
        assert match, f"TS contract: cannot parse member {member!r}"
        fields[match.group(1)] = Field(match.group(1), bool(match.group(2)), match.group(3))
    return fields


def interface(file: str, name: str) -> dict[str, Field]:
    return parse_fields(_block_after(source(file), rf"export interface {name}\b[^{{]*\{{"))


def inner_object(ts_type: str) -> dict[str, Field]:
    """Fields of `Array<{ ... }>`."""
    start = ts_type.index("{")
    return parse_fields(ts_type[start + 1 : _matching_brace(ts_type, start)])


def match_event_fields() -> dict[str, Field]:
    """MatchEventBase & { ... } flattened."""
    text = source("events.ts")
    fields = parse_fields(_block_after(text, r"export interface MatchEventBase\b[^{]*\{"))
    fields.update(parse_fields(_block_after(text, r"export type MatchEvent\s*=\s*MatchEventBase\s*&\s*\{")))
    return fields


def match_event_types() -> list[str]:
    match = re.search(r"export type MatchEventType\s*=(.*?);", source("events.ts"), flags=re.DOTALL)
    assert match, "TS contract: MatchEventType not found"
    return re.findall(r"'([a-z_]+)'", match.group(1))


def class_ids() -> list[str]:
    match = re.search(r"CLASS_IDS\s*=\s*\[(.*?)\]\s*as const", source("classes.ts"), flags=re.DOTALL)
    assert match, "TS contract: CLASS_IDS not found"
    return re.findall(r"'(\w+)'", match.group(1))


def class_names() -> dict[str, str]:
    ids = set(class_ids())
    pairs = re.findall(r"\bid:\s*'(\w+)',\s*name:\s*'([^']+)'", source("classes.ts"))
    return {cid: name for cid, name in pairs if cid in ids}


def const_block(name: str) -> dict[str, str]:
    """Numeric members of `export const NAME = { KEY: value, ... }`."""
    body = _block_after(source("constants.ts"), rf"export const {name}\s*=\s*\{{")
    return dict(re.findall(r"\b([A-Z_]+):\s*([0-9][0-9_.]*)", body))


def wave_count() -> int:
    match = re.search(r"export const WAVE_PLAN\s*=\s*\[(.*?)\]\s*as const", source("constants.ts"), flags=re.DOTALL)
    assert match, "TS contract: WAVE_PLAN not found"
    return len(re.findall(r"realCrates:", match.group(1)))


def outcome_labels() -> list[str]:
    match = re.search(r"OUTCOME_LABEL\s*=\s*\[(.*?)\]", source("enums.ts"), flags=re.DOTALL)
    assert match, "TS contract: OUTCOME_LABEL not found"
    return re.findall(r"'([^']*)'", match.group(1))
