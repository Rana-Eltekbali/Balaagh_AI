import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("arguments", [["-m", "scripts.test_models"], ["scripts/test_models.py"]])
def test_model_script_imports_for_both_invocations(arguments):
    result = subprocess.run(
        [sys.executable, *arguments, "--help"],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "--location-only" in result.stdout
    assert "--text" in result.stdout
