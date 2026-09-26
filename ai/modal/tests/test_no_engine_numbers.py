"""The Goblin King must never talk like a debugger ("you're 470 pixels away")."""
from __future__ import annotations

import json
import re
from pathlib import Path

import goblin_king as gk

FIXTURE = json.loads((Path(__file__).parent.parent / "fixtures" / "snapshot.json").read_text())


def test_prompt_describes_distance_and_threat_in_words():
    prompt = gk.director_prompt(FIXTURE)
    hero_lines = [l for l in prompt.splitlines() if l.startswith("- ") and "HP" in l]
    assert hero_lines, prompt
    for line in hero_lines:
        assert not re.search(r"\d+\s*px\b", line), line
        assert "of your threat" not in line, line
        assert any(band in line for _, band in gk.DISTANCE_BANDS) or "far away from you" in line, line


def test_prompt_forbids_engine_measurements():
    assert "Never mention pixels, coordinates" in Path(gk.__file__).read_text()


def test_distance_bands_cover_the_arena():
    assert gk._distance_label(0) == "right next to you"
    assert gk._distance_label(300) == "close to you"
    assert gk._distance_label(700) == "across the arena from you"
    assert gk._distance_label(5000) == "far away from you"


def test_a_quoted_pixel_distance_is_not_a_grounded_fact():
    snap = json.loads(json.dumps(FIXTURE))
    snap["players"][0]["distanceToBoss"] = 470
    name = gk.CLASS_NAMES[snap["players"][0]["classId"]]
    assert not gk.taunt_is_grounded(f"{name}, you're 470 pixels away and my club is coming!", snap)
