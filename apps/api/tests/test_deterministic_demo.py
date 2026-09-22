import pytest

from app.agents.harness import _run_deterministic_demo


@pytest.mark.parametrize(
    ("narrative", "expected_substring"),
    [
        ("My charges were dismissed in 2010 and nothing else happened.", "Texas"),
        ("I was convicted of a felony in 2025.", "Does Not Qualify"),
        ("This was a juvenile matter in 2012.", ""),
    ],
)
def test_deterministic_demo_varies_outcomes(narrative: str, expected_substring: str) -> None:
    report, path = _run_deterministic_demo("texas", narrative)
    assert report.result_label
    assert len(path) > 0
    # Ensure traversal path is attached for UI transparency.
    assert report.traversed_path == path
    if expected_substring:
        assert expected_substring in report.result_label


def test_deterministic_demo_not_always_expungement() -> None:
    r1, _ = _run_deterministic_demo("texas", "My charges were dismissed in 2010.")
    r2, _ = _run_deterministic_demo("texas", "I was convicted of a felony in 2025.")
    assert r1.result_label != r2.result_label

