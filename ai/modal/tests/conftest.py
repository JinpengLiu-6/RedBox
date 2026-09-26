"""Shared test setup: offline by construction.

- Modal is pointed at a config file that does not exist, so importing app.py
  never loads the developer's Modal profile or token.
- Every test runs with socket connects disabled, so a real Anthropic or Modal
  call fails loudly instead of spending money.
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
