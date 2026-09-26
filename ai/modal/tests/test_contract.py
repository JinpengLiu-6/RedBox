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
    """The JSON Schema a strict tool must use for a TS field type."""
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
            "properties": {cid: {"type": "number"} for cid in class_ids},
            "additionalProperties": False,
        }
    raise AssertionError(f"no JSON Schema mapping for TS type {t!r} - extend the tool schema and this test")


def assert_tool_matches(tool: dict, ts_fields: dict[str, ts.Field]) -> None:
    schema = tool["input_schema"]
    assert tool["strict"] is True
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    class_ids = ts.class_ids()
    expected = {name: ts_type_to_schema(f.ts_type, class_ids) for name, f in ts_fields.items()}
    assert _strip_descriptions(schema["properties"]) == expected
    required = set(schema["required"])
    assert required <= set(ts_fields), "tool requires a field the contract does not have"
    assert {n for n, f in ts_fields.items() if not f.optional} <= required, "contract-required field is optional in the tool"


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
    assert ts.wave_count() == gk.WAVE_COUNT
    assert ts.outcome_labels()[gk.OUTCOME_VICTORY] == "Victory"


def test_match_event_shape_matches_events_ts():
    assert list(gk.EVENT_TYPES) == ts.match_event_types()
    assert set(gk.EVENT_KEYS) == set(ts.match_event_fields())


# ---- tool schemas vs output contract ---------------------------------------------


def test_director_tool_schema_matches_director_decision():
    fields = ts.interface("events.ts", "DirectorDecision")
    assert set(fields) == {"focus", "threatBias", "taunt", "reasoning"}
    assert_tool_matches(gk.DIRECTOR_TOOL, fields)


def test_debrief_tool_schema_matches_debrief_payload():
    fields = ts.interface("messages.ts", "DebriefPayload")
    assert set(fields) == {"summary", "mvpPlayerId", "highlights"}
    assert_tool_matches(gk.DEBRIEF_TOOL, fields)


def test_schema_check_catches_drift():
    """The comparison above is not vacuous: a renamed or retyped field fails it."""
    fields = ts.interface("events.ts", "DirectorDecision")
    renamed = copy.deepcopy(gk.DIRECTOR_TOOL)
    renamed["input_schema"]["properties"]["taunts"] = renamed["input_schema"]["properties"].pop("taunt")
    with pytest.raises(AssertionError):
        assert_tool_matches(renamed, fields)
    retyped = copy.deepcopy(gk.DIRECTOR_TOOL)
    retyped["input_schema"]["properties"]["focus"] = {"type": "string"}
    with pytest.raises(AssertionError):
        assert_tool_matches(retyped, fields)


def test_tool_schemas_avoid_constraints_strict_mode_rejects():
    banned = {"minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"}
    for tool in (gk.DIRECTOR_TOOL, gk.DEBRIEF_TOOL):
        text = json.dumps(tool)
        assert not any(f'"{key}"' in text for key in banned), tool["name"]


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
