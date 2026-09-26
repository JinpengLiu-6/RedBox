"""Shared test setup: offline by construction.

- Modal is pointed at a config file that does not exist, so importing app.py
  never loads the developer's Modal profile or token.
- OpenAI and Gradium credentials, the voice token, endpoints and model/voice
  overrides are removed from the test process env (never read), so no real key
  can be used and a developer's DIRECTOR_MODEL cannot change what the tests expect.
- Every test runs with socket connects disabled, so a real OpenAI, Gradium or
  Modal call fails loudly instead of spending money. (test_voice opens one
  loopback-only exception to a local server it starts itself.)
"""

from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
MODAL_DIR = TESTS_DIR.parent
REPO_ROOT = MODAL_DIR.parent.parent
FIXTURES = MODAL_DIR / "fixtures"

os.environ["MODAL_CONFIG_PATH"] = str(Path(tempfile.gettempdir()) / "redbox-ai-tests-no-modal-config.toml")
for path in (str(MODAL_DIR), str(TESTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

#: Dropped unread. The model keys mirror goblin_king.MODEL_ENV_KEYS (test_app checks it),
#: the voice keys voice.VOICE_ENV_KEYS plus the two voice secrets (test_voice checks it).
SCRUBBED_ENV = (
    "OPENAI_API_KEY", "OPENAI_ADMIN_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID",
    "DIRECTOR_MODEL", "DEBRIEF_MODEL", "DIRECTOR_REASONING_EFFORT", "DEBRIEF_REASONING_EFFORT",
    "GRADIUM_API_KEY", "GRADIUM_VOICE_ID", "VOICE_TOKEN",
)
for key in SCRUBBED_ENV:
    os.environ.pop(key, None)


@pytest.fixture(autouse=True, scope="session")
def _no_network():
    """Session-wide, so it also covers module-scoped fixtures such as `import app`."""

    def blocked(*_args, **_kwargs):
        raise RuntimeError("network access is disabled in ai/modal tests")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(socket.socket, "connect", blocked)
        mp.setattr(socket.socket, "connect_ex", blocked)
        mp.setattr(socket, "create_connection", blocked)
        yield


@pytest.fixture
def snapshot_fixture() -> dict:
    return json.loads((FIXTURES / "snapshot.json").read_text())


@pytest.fixture
def debrief_fixture() -> dict:
    return json.loads((FIXTURES / "debrief.json").read_text())
