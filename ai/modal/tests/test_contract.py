"""The Python side must match shared/src field-for-field. These tests read the
TypeScript contract directly, so any drift on either side fails here."""

from __future__ import annotations

import copy
import json
import re

import pytest

import goblin_king as gk
import tscontract as ts


def _strip_descriptions(schema):
    if isinstance(schema, dict):
        return {k: _strip_descriptions(v) for k, v in schema.items() if k != "description"}
    if isinstance(schema, list):
        return [_strip_descriptions(v) for v in schema]
    return schema


def ts_type_to_schema(ts_type: str, class_ids: list[str]) -> dict:
    """The JSON Schema a strict response format must use for a TS field type.

    OpenAI strict mode makes every property required, so an optional record
    key (`Partial<...>`) becomes a required key whose value may be null."""
    t = " ".join(ts_type.split())
    if t == "string":
        return {"type": "string"}
    if t == "number":
        return {"type": "number"}
    if t == "boolean":
        return {"type": "boolean"}
    if t == "string[]":
        return {"type": "array", "items": {"type": "string"}}
    if t == "ClassId | null":
        return {"anyOf": [{"type": "string", "enum": class_ids}, {"type": "null"}]}
    if re.fullmatch(r"Partial<Record<ClassId,\s*number>>", t):
        return {
            "type": "object",
            "properties": {cid: {"type": ["number", "null"]} for cid in class_ids},
            "required": class_ids,
            "additionalProperties": False,
        }
    raise AssertionError(f"no JSON Schema mapping for TS type {t!r} - extend the response schema and this test")


def strict_violations(schema, path: str = "$") -> list[str]:
    """Where a schema breaks OpenAI's strict Structured Outputs rules: every
    object sets additionalProperties false and lists all its properties in
    `required`. Either mistake is an HTTP 400 on every single call."""
    problems = []
    if isinstance(schema, dict):
        if schema.get("type") == "object" or "properties" in schema:
            if schema.get("additionalProperties") is not False:
                problems.append(f"{path}: additionalProperties must be false")
            if sorted(schema.get("required", [])) != sorted(schema.get("properties", {})):
                problems.append(f"{path}: every property must be required")
        for name, sub in schema.get("properties", {}).items():
            problems += strict_violations(sub, f"{path}.{name}")
        if "items" in schema:
            problems += strict_violations(schema["items"], f"{path}[]")
        for i, sub in enumerate(schema.get("anyOf", [])):
            problems += strict_violations(sub, f"{path}|{i}")
    return problems


def assert_format_matches(text_format: dict, ts_fields: dict[str, ts.Field]) -> None:
    assert text_format["type"] == "json_schema"
    assert text_format["strict"] is True
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", text_format["name"])
    schema = text_format["schema"]
    assert schema["type"] == "object" and "anyOf" not in schema  # the root must be a plain object
    assert strict_violations(schema) == []
    class_ids = ts.class_ids()
    expected = {name: ts_type_to_schema(f.ts_type, class_ids) for name, f in ts_fields.items()}
    assert _strip_descriptions(schema["properties"]) == expected
    required = set(schema["required"])
    assert required == set(ts_fields), "strict mode requires exactly the contract's fields"


# ---- constants -----------------------------------------------------------------


def test_class_ids_and_names_match_classes_ts():
    assert list(gk.CLASS_IDS) == ts.class_ids() == ["mage", "troll", "brawler", "dwarf", "warrior"]
    assert gk.CLASS_NAMES == ts.class_names()


def test_director_bounds_match_constants_ts():
    director = ts.const_block("DIRECTOR")
    assert float(director["MIN_THREAT_BIAS"]) == gk.MIN_THREAT_BIAS == 0.5
    assert float(director["MAX_THREAT_BIAS"]) == gk.MAX_THREAT_BIAS == 2.0
    assert int(director["TAUNT_MAX_CHARS"]) == gk.TAUNT_MAX_CHARS == 90
    assert int(ts.const_block("TOWERS")["COUNT"]) == gk.TOWER_COUNT
    assert int(ts.const_block("CRATES")["TRAP_GOBLINS"]) == gk.TRAP_GOBLINS
    assert ts.wave_count() == gk.WAVE_COUNT
    assert ts.outcome_labels()[gk.OUTCOME_VICTORY] == "Victory"


def test_match_event_shape_matches_events_ts():
    assert list(gk.EVENT_TYPES) == ts.match_event_types()
    assert set(gk.EVENT_KEYS) == set(ts.match_event_fields())


# ---- tool schemas vs output contract ---------------------------------------------


def test_director_format_matches_director_decision():
    fields = ts.interface("events.ts", "DirectorDecision")
    assert set(fields) == {"focus", "threatBias", "taunt", "reasoning"}
    assert_format_matches(gk.DIRECTOR_FORMAT, fields)


def test_debrief_format_matches_debrief_payload():
    fields = ts.interface("messages.ts", "DebriefPayload")
    assert set(fields) == {"summary", "mvpPlayerId", "highlights"}
    assert_format_matches(gk.DEBRIEF_FORMAT, fields)


def test_schema_check_catches_drift():
    """The comparison above is not vacuous: a renamed or retyped field fails it."""
    fields = ts.interface("events.ts", "DirectorDecision")
    renamed = copy.deepcopy(gk.DIRECTOR_FORMAT)
    renamed["schema"]["properties"]["taunts"] = renamed["schema"]["properties"].pop("taunt")
    with pytest.raises(AssertionError):
        assert_format_matches(renamed, fields)
    retyped = copy.deepcopy(gk.DIRECTOR_FORMAT)
    retyped["schema"]["properties"]["focus"] = {"type": "string"}
    with pytest.raises(AssertionError):
        assert_format_matches(retyped, fields)


def test_strict_check_catches_optional_properties():
    """An optional key (the pre-OpenAI threatBias shape) is rejected by strict mode, and by this test."""
    loose = copy.deepcopy(gk.DIRECTOR_FORMAT)
    del loose["schema"]["properties"]["threatBias"]["required"]
    assert strict_violations(loose["schema"]) == ["$.threatBias: every property must be required"]
    open_object = copy.deepcopy(gk.DEBRIEF_FORMAT)
    open_object["schema"]["additionalProperties"] = True
    assert strict_violations(open_object["schema"]) == ["$: additionalProperties must be false"]


def test_response_formats_stay_in_the_portable_strict_subset():
    """Bounds live in validate_*(), not in the schema, so any env-selected model accepts it."""
    banned = {"minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern", "format"}

    def keys(node):
        if isinstance(node, dict):
            for key, value in node.items():
                yield key
                if key != "properties":
                    yield from keys(value)
                else:
                    for sub in value.values():
                        yield from keys(sub)
        elif isinstance(node, list):
            for value in node:
                yield from keys(value)

    for text_format in (gk.DIRECTOR_FORMAT, gk.DEBRIEF_FORMAT):
        assert not banned & set(keys(text_format["schema"])), text_format["name"]
        json.dumps(text_format)  # plain JSON, sent as-is


# ---- request contracts vs fixtures -------------------------------------------------


def test_snapshot_fixture_has_exactly_the_contract_fields(snapshot_fixture):
    fields = ts.interface("events.ts", "DirectorSnapshot")
    assert set(snapshot_fixture) == set(fields)
    player_fields = set(ts.inner_object(fields["players"].ts_type))
    event_fields = set(ts.match_event_fields())
    assert {p["classId"] for p in snapshot_fixture["players"]} == set(ts.class_ids())
    for player in snapshot_fixture["players"]:
        assert set(player) == player_fields
    assert 0 < len(snapshot_fixture["recent"]) <= gk.DIRECTOR_RECENT_EVENTS
    for event in snapshot_fixture["recent"]:
        assert set(event) <= event_fields and event["type"] in ts.match_event_types()
    # Normalisation is the identity on a well-formed snapshot and keeps the contract keys.
    normalized = gk.normalize_snapshot(json.loads(json.dumps(snapshot_fixture)))
    assert normalized == snapshot_fixture
    assert set(normalized) == set(fields)


def test_debrief_fixture_has_exactly_the_contract_fields(debrief_fixture):
    fields = ts.interface("events.ts", "DebriefRequest")
    assert set(debrief_fixture) == set(fields)
    player_fields = set(ts.inner_object(fields["players"].ts_type))
    assert {p["classId"] for p in debrief_fixture["players"]} == set(ts.class_ids())
    for player in debrief_fixture["players"]:
        assert set(player) == player_fields
    event_fields = set(ts.match_event_fields())
    types = set(ts.match_event_types())
    for event in debrief_fixture["events"]:
        assert set(event) <= event_fields and event["type"] in types
    assert debrief_fixture["outcomeLabel"] == ts.outcome_labels()[debrief_fixture["outcome"]]
    normalized = gk.normalize_debrief_request(json.loads(json.dumps(debrief_fixture)))
    assert normalized == debrief_fixture
