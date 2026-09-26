"""Director: DirectorSnapshot -> DirectorDecision through a fake Anthropic client."""

from __future__ import annotations

import json

import pytest

import goblin_king as gk
from fakes import FakeClient, text_message, tool_message

DECISION_KEYS = {"focus", "threatBias", "taunt", "reasoning"}


def decide(snapshot: dict, model_output) -> tuple[int, dict, FakeClient]:
    client = FakeClient(tool_message(gk.DIRECTOR_TOOL_NAME, model_output))
    status, payload = gk.handle_director(snapshot, client)
    return status, payload, client


def test_golden_path_fixture_round_trips(snapshot_fixture):
    model_output = {
        "focus": "dwarf",
        "threatBias": {"dwarf": 1.8, "troll": 0.7},
        "taunt": "Dwarf, that crate is MINE. Two towers down won't save your stubby legs!",
        "reasoning": "Dwarf carries a crate 212 px away at 38% HP; hunt the carrier.",
    }
    status, decision, client = decide(snapshot_fixture, model_output)

    assert status == 200
    assert decision == model_output  # valid output passes through untouched
    assert json.loads(json.dumps(decision)) == decision
    assert set(decision) == DECISION_KEYS

    # One forced, strict tool call to Haiku 4.5 - the only way to get JSON back.
    (request,) = client.calls
    assert request["model"] == "claude-haiku-4-5-20251001"
    assert request["tools"] == [gk.DIRECTOR_TOOL] and request["tools"][0]["strict"] is True
    assert request["tool_choice"] == {"type": "tool", "name": gk.DIRECTOR_TOOL_NAME}
    assert "thinking" not in request and "temperature" not in request
    assert request["max_tokens"] <= 1024
    assert "Goblin King" in request["system"] and "90 characters" in request["system"]


def test_prompt_carries_the_concrete_facts_a_taunt_needs(snapshot_fixture):
    prompt = gk.director_prompt(gk.normalize_snapshot(snapshot_fixture))
    assert "Wave 2 of 3" in prompt
    assert "Crates delivered this wave: 1 of 2" in prompt
    assert "Towers destroyed: 2 of 3 (you take 1.50x damage)" in prompt
    assert "Carrying a crate: Dwarf Demolitionist." in prompt
    assert "- dwarf (Dwarf Demolitionist): 38% HP" in prompt and "CARRYING A CRATE" in prompt
    assert "- mage (Elf Mage): 22% HP" in prompt and "LOW HP" in prompt
    assert "- brawler (Human Brawler): 0% HP" in prompt and "DOWNED" in prompt
    assert "time left 2:48" in prompt
    assert "Dwarf Demolitionist picked up a crate" in prompt
    assert "the Goblin King used slam on Human Brawler" in prompt
    # The previous taunt comes back so the King does not repeat himself.
    assert "4:02 the Goblin King said: Two towers down? Cute. Elf Mage, your frost tickles my toes." in prompt
    # Heroes are named, player ids never reach the event lines.
    events_section = prompt.split("Recent events")[1]
    assert "Xk3fQ9aLm" not in events_section


def test_out_of_range_output_is_clamped(snapshot_fixture):
    spoken = (
        "Your precious DWARF waddles like a drunk goat, and that crate "
        "will make a lovely footstool for my throne!"
    )
    status, decision, _ = decide(snapshot_fixture, {
        "focus": "Dwarf Demolitionist",  # a hero name instead of a class id
        "threatBias": {
            "dwarf": 5,            # above max
            "mage": 0.1,           # below min
            "troll": "1.25",       # numeric string
            "boss": 2.0,           # not a class
            "warrior": float("nan"),
            "brawler": True,       # bool is not a number
            "p7Rt2WqZc": 1.9,      # player id -> its class, clamps on top of 'mage'
        },
        "taunt": f'  "Goblin King: {spoken}"\n',
        "reasoning": "Carrier\nnear   the base.",
    })
    assert status == 200
    assert decision["focus"] == "dwarf"
    assert decision["threatBias"] == {"mage": 1.9, "troll": 1.25, "dwarf": 2.0}
    assert list(decision["threatBias"]) == ["mage", "troll", "dwarf"]  # ClassId order
    assert all(gk.MIN_THREAT_BIAS <= v <= gk.MAX_THREAT_BIAS for v in decision["threatBias"].values())
    taunt = decision["taunt"]
    assert len(spoken) > gk.TAUNT_MAX_CHARS >= len(taunt) > 60
    # Speaker prefix and quotes removed, cut on a word boundary.
    assert spoken.startswith(taunt) and spoken[len(taunt)] == " "
    assert taunt == "Your precious DWARF waddles like a drunk goat, and that crate will make a lovely footstool"
    assert decision["reasoning"] == "Carrier near the base."


@pytest.mark.parametrize("focus", ["boss", "nobody", None, 3, "brawler"])
def test_focus_outside_live_class_ids_becomes_null(snapshot_fixture, focus):
    # 'brawler' is a real class but that hero is downed in the snapshot.
    status, decision, _ = decide(snapshot_fixture, {
        "focus": focus, "threatBias": {}, "taunt": "Two towers? Cute.", "reasoning": "x",
    })
    assert status == 200 and decision["focus"] is None


def test_generic_or_missing_taunt_is_replaced_with_a_fact(snapshot_fixture):
    for bad in ("You will all perish!", "", None, "   "):
        status, decision, _ = decide(snapshot_fixture, {
            "focus": "dwarf", "threatBias": {"dwarf": 1.5}, "taunt": bad, "reasoning": "",
        })
        assert status == 200
        assert "Dwarf" in decision["taunt"] and "crate" in decision["taunt"]
        assert len(decision["taunt"]) <= gk.TAUNT_MAX_CHARS
        assert decision["reasoning"] == "Dwarf Demolitionist is carrying a crate; hunt the carrier."


def test_fallback_taunt_without_carriers_names_the_weakest_hero(snapshot_fixture):
    snap = gk.normalize_snapshot(snapshot_fixture)
    snap["carriers"] = []
    for p in snap["players"]:
        p["carrying"] = False
    assert gk.fallback_taunt(snap, None) == "Mage at 22% HP? One more swing and you are goblin chow."


def test_malformed_model_output_is_rejected(snapshot_fixture):
    for response in (
        tool_message(gk.DIRECTOR_TOOL_NAME, ["not", "an", "object"]),
        tool_message("some_other_tool", {"focus": "dwarf"}),
        text_message("I refuse to be structured."),
        tool_message(gk.DIRECTOR_TOOL_NAME, {"focus": "dwarf"}, stop_reason="refusal"),
    ):
        status, payload = gk.handle_director(snapshot_fixture, FakeClient(response))
        assert status == 502 and payload["error"] == "invalid_model_output"
        assert not DECISION_KEYS & set(payload)


def test_upstream_failure_and_bad_input_never_reach_the_model(snapshot_fixture):
    status, payload = gk.handle_director(snapshot_fixture, FakeClient(TimeoutError("slow")))
    assert (status, payload) == (503, {"error": "upstream_error", "detail": "TimeoutError"})

    client = FakeClient()
    for body in (None, [], "snapshot", 42):
        status, payload = gk.handle_director(body, client)
        assert status == 400 and payload["error"] == "bad_request"
    assert client.calls == []


def test_junk_snapshot_fields_are_coerced_before_prompting():
    snap = gk.normalize_snapshot({
        "wave": 9,
        "towersDestroyed": -4,
        "bossHpPct": 64,  # percent instead of a share
        "players": [
            {"id": "a", "classId": "dwarf", "hpPct": "38", "alive": True, "carrying": True},
            {"id": "a", "classId": "mage"},            # duplicate id
            {"id": "b", "classId": "necromancer"},     # not a ClassId
            "garbage",
        ],
        "recent": [{"type": "hacked", "atMs": 1}] + [{"type": "wave_start", "atMs": i, "evil": 1} for i in range(40)],
    })
    assert snap["wave"] == gk.WAVE_COUNT and snap["towersDestroyed"] == 0
    assert snap["bossHpPct"] == 0.64
    assert [p["id"] for p in snap["players"]] == ["a"] and snap["players"][0]["hpPct"] == 0.38
    assert len(snap["recent"]) == gk.DIRECTOR_RECENT_EVENTS
    assert all(set(e) == {"type", "atMs"} for e in snap["recent"])
    assert snap["recent"][-1]["atMs"] == 39
