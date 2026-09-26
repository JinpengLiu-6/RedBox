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
            "warrior": 0.1,        # below min
            "troll": "1.25",       # numeric string
            "boss": 2.0,           # not a class
            "mage": float("nan"),  # dropped...
            "brawler": True,       # bool is not a number
            "p7Rt2WqZc": 1.9,      # ...but the mage's player id maps to 'mage'
        },
        "taunt": f'  "Goblin King: {spoken}"\n',
        "reasoning": "Carrier\nnear   the base.",
    })
    assert status == 200
    assert decision["focus"] == "dwarf"
    assert decision["threatBias"] == {"mage": 1.9, "troll": 1.25, "dwarf": 2.0, "warrior": 0.5}
    assert list(decision["threatBias"]) == ["mage", "troll", "dwarf", "warrior"]  # ClassId order
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


def test_threat_bias_is_clamped_on_both_sides(snapshot_fixture):
    status, decision, _ = decide(snapshot_fixture, {
        "focus": None,
        "threatBias": {"mage": 0.1, "troll": -3, "brawler": 0, "dwarf": 9, "warrior": 10**400},
        "taunt": "Dwarf, drop my crate!", "reasoning": "x",
    })
    assert status == 200
    # 10**400 is valid JSON but no float: dropped, never a crash.
    assert decision["threatBias"] == {"mage": 0.5, "troll": 0.5, "brawler": 0.5, "dwarf": 2.0}


# Fixture facts: wave 2 of 3, 2 of 3 towers down (1 standing), 1 of 2 crates, 2:48
# left, only the Dwarf carries, Mage 22% HP, Brawler downed, King 64% HP.
GROUNDED_TAUNTS = [
    "Two towers down and I still stand!",
    "One tower left, and it is enough to crush you!",
    "Dwarf, drop my crate!",
    "Mage at 22% HP? Pathetic.",
    "Wave 2 and only 1 of 2 crates home? Pathetic.",
    "Elf Mage, your frost tickles my toes.",
    "2:48 left, heroes. Tick tock.",
    "I still have 64% HP, you worms!",
    "Brawler is down. Who is next?",
    "Troll, you have 3 lives and none of them will save you.",
    "Dwarf, that crate is MINE. Two towers down won't save your stubby legs!",
]
UNGROUNDED_TAUNTS = [
    # No concrete fact at all: generic words ground nothing.
    "You will all perish!",
    "Wave goodbye, puny heroes!",
    "Welcome to my base, fools!",
    "I will crush you all!",
    "No one escapes my club!",
    "Your life ends here, fools!",
    "Crawl back to your base, cowards!",
    "Not one of you leaves my hoard alive!",
    "You will never reach the base!",
    # A concrete claim that the snapshot contradicts.
    "Five crates delivered? Never, Brawler!",
    "Three towers down and I still crush you all!",
    "Three towers down and I still stand!",
    "Wave 3 already? You are doomed.",
    "One tower down and I barely noticed!",  # 1 is standing, 2 are down
    "Two towers left? Barely a scratch.",    # 2 are down, 1 is left
    "Mage at 80% HP? Pathetic.",
    "Two heroes down, the rest will follow!",
    "Troll, drop my crate!",  # the Troll carries nothing and touched no crate
]


@pytest.mark.parametrize("taunt", GROUNDED_TAUNTS)
def test_fact_bearing_taunt_is_kept(snapshot_fixture, taunt):
    status, decision, _ = decide(snapshot_fixture, {"focus": "dwarf", "threatBias": {}, "taunt": taunt, "reasoning": "x"})
    assert status == 200 and decision["taunt"] == taunt


@pytest.mark.parametrize("taunt", UNGROUNDED_TAUNTS)
def test_generic_or_false_taunt_falls_back(snapshot_fixture, taunt):
    status, decision, _ = decide(snapshot_fixture, {"focus": "dwarf", "threatBias": {}, "taunt": taunt, "reasoning": "x"})
    snap = gk.normalize_snapshot(snapshot_fixture)
    assert status == 200 and decision["taunt"] == gk.fallback_taunt(snap, "dwarf") != taunt


def test_taunt_naming_a_hero_who_is_not_in_the_match_falls_back(snapshot_fixture):
    snapshot_fixture["players"] = [p for p in snapshot_fixture["players"] if p["classId"] != "troll"]
    snap = gk.normalize_snapshot(snapshot_fixture)
    assert gk.taunt_is_grounded("Warrior, you are next!", snap)
    assert not gk.taunt_is_grounded("Troll, you are next!", snap)


def _no_carriers(snapshot_fixture) -> dict:
    snap = gk.normalize_snapshot(snapshot_fixture)
    snap["carriers"] = []
    for p in snap["players"]:
        p["carrying"] = False
    return snap


def test_fallback_taunt_without_carriers_names_the_weakest_hero(snapshot_fixture):
    snap = _no_carriers(snapshot_fixture)
    assert gk.fallback_taunt(snap, None) == "Mage at 22% HP? One more swing and you are goblin chow."


def test_fallback_taunt_prefers_the_focused_carrier(snapshot_fixture):
    snap = gk.normalize_snapshot(snapshot_fixture)
    warrior = next(p for p in snap["players"] if p["classId"] == "warrior")
    warrior["carrying"] = True
    snap["carriers"].append(warrior["id"])
    assert gk.fallback_taunt(snap, "warrior").startswith("Drop my crate, Warrior!")
    assert gk.fallback_taunt(snap, None).startswith("Drop my crate, Dwarf!")  # first carrier


def test_fallback_taunt_without_carriers_or_wounded_counts_towers_then_crates(snapshot_fixture):
    snap = _no_carriers(snapshot_fixture)
    for p in snap["players"]:
        p["hpPct"] = 0.9
    assert gk.fallback_taunt(snap, None) == "2 towers down and I am still standing. Hit harder, heroes!"
    snap["towersDestroyed"] = 0
    assert gk.fallback_taunt(snap, None) == "1 of 2 crates? Not one more leaves my hoard!"


def test_every_fallback_taunt_passes_its_own_fact_check(snapshot_fixture):
    carrier = gk.normalize_snapshot(snapshot_fixture)
    wounded = _no_carriers(snapshot_fixture)
    towers = _no_carriers(snapshot_fixture)
    for p in towers["players"]:
        p["hpPct"] = 0.9
    crates = {**towers, "towersDestroyed": 0}
    empty = gk.normalize_snapshot({})
    for snap in (carrier, wounded, towers, crates, empty):
        taunt = gk.fallback_taunt(snap, None)
        assert len(taunt) <= gk.TAUNT_MAX_CHARS and gk.taunt_is_grounded(taunt, snap), taunt


def test_reasoning_and_taunt_are_single_capped_lines_without_pictographs(snapshot_fixture):
    long_reasoning = "The Dwarf carries a crate toward the base " * 8  # ~330 chars
    status, decision, _ = decide(snapshot_fixture, {
        "focus": "dwarf", "threatBias": {},
        "taunt": "Dwarf \N{SKULL AND CROSSBONES} drop my crate! \N{SMILING FACE WITH HORNS}\N{FIRE}",
        "reasoning": long_reasoning,
    })
    assert status == 200
    assert decision["taunt"] == "Dwarf drop my crate!"
    reasoning = decision["reasoning"]
    assert len(reasoning) <= gk.REASONING_MAX_CHARS < len(long_reasoning.strip())
    assert long_reasoning.startswith(reasoning) and long_reasoning[len(reasoning)] == " "


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


def test_unreadable_values_are_dropped_instead_of_crashing():
    snap = gk.normalize_snapshot({
        "elapsedMs": 10**400,  # valid JSON, too large for a float
        "wave": 10**400,
        "recent": [{"type": ["x"], "atMs": 1}, {"type": {"a": 1}}, {"type": "wave_start", "atMs": 10**400, "value": 10**400}],
    })
    assert snap["elapsedMs"] == 0 and snap["wave"] == 1
    assert snap["recent"] == [{"type": "wave_start", "atMs": 0}]

    client = FakeClient(tool_message(gk.DIRECTOR_TOOL_NAME, {"focus": None, "threatBias": {}, "taunt": "", "reasoning": ""}))
    status, _ = gk.handle_director({"recent": [{"type": ["x"]}], "elapsedMs": 10**400}, client)
    assert status == 200


def test_unexpected_errors_map_to_http_errors_not_500s(snapshot_fixture):
    def broken(_body):
        raise KeyError("boom")

    status, payload = gk._handle({}, FakeClient(), broken, gk.director_request, gk.DIRECTOR_TOOL_NAME, gk.validate_decision)
    assert (status, payload["error"]) == (400, "bad_request")

    def bad_validate(_raw, _request):
        raise TypeError("boom")

    client = FakeClient(tool_message(gk.DIRECTOR_TOOL_NAME, {}))
    status, payload = gk._handle(
        snapshot_fixture, client, gk.normalize_snapshot, gk.director_request, gk.DIRECTOR_TOOL_NAME, bad_validate,
    )
    assert (status, payload["error"]) == (502, "invalid_model_output")


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
