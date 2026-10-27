"""Parse uploaded datasets (CSV, JSON, JSONL) defensively.

Security notes:
- Only text formats are accepted. Nothing is ever unpickled, executed or eval'd.
- Size, row count and cell length are capped (see config) to stop memory abuse.
- Content must decode as UTF-8; NUL bytes are rejected.
"""
import csv
import io
import json

from .config import get_settings

ALLOWED_EXTENSIONS = {".csv", ".json", ".jsonl"}
INPUT_KEYS = ("input", "text", "prompt", "question")
EXPECTED_KEYS = ("expected", "expected_output", "reference", "answer", "ideal")


class DatasetError(ValueError):
    pass


def _pick(row: dict, keys: tuple[str, ...]) -> tuple[str | None, str | None]:
    lowered = {str(k).strip().lower(): k for k in row}
    for key in keys:
        if key in lowered:
            return lowered[key], row[lowered[key]]
    return None, None


def _normalise(rows: list) -> list[dict]:
    s = get_settings()
    if not rows:
        raise DatasetError("The file contains no rows.")
    if len(rows) > s.max_cases_per_dataset:
        raise DatasetError(f"Too many rows: {len(rows)} (limit {s.max_cases_per_dataset}).")

    cases = []
    for i, row in enumerate(rows, start=1):
        if isinstance(row, str):
            row = {"input": row}
        if not isinstance(row, dict):
            raise DatasetError(f"Row {i} must be an object or a string.")
        in_key, value = _pick(row, INPUT_KEYS)
        if value is None or not str(value).strip():
            raise DatasetError(f"Row {i} has no 'input' value.")
        ex_key, expected = _pick(row, EXPECTED_KEYS)
        variables = {}
        for k, v in row.items():
            if k in (in_key, ex_key):
                continue
            name = str(k).strip()
            if name.isidentifier() and len(name) <= 64:
                variables[name] = "" if v is None else str(v)
        for field in [str(value), str(expected or ""), *variables.values()]:
            if len(field) > s.max_field_chars:
                raise DatasetError(f"Row {i} has a value longer than {s.max_field_chars} characters.")
        cases.append({
            "input": str(value).strip(),
            "expected": str(expected).strip() if expected not in (None, "") else None,
            "variables": variables,
        })
    return cases


def parse_dataset(filename: str, content: bytes) -> list[dict]:
    s = get_settings()
    if len(content) > s.max_upload_bytes:
        raise DatasetError(f"File is larger than {s.max_upload_bytes // 1000} KB.")
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise DatasetError("Only .csv, .json and .jsonl files are accepted.")
    if b"\x00" in content:
        raise DatasetError("File looks binary; only UTF-8 text is accepted.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise DatasetError("File must be UTF-8 encoded text.") from e

    try:
        if ext == ".csv":
            rows = list(csv.DictReader(io.StringIO(text)))
        elif ext == ".jsonl":
            rows = [json.loads(line) for line in text.splitlines() if line.strip()]
        else:
            data = json.loads(text)
            rows = data.get("cases", data) if isinstance(data, dict) else data
            if not isinstance(rows, list):
                raise DatasetError("JSON must be a list of cases, or {\"cases\": [...]}.")
    except (json.JSONDecodeError, csv.Error) as e:
        raise DatasetError(f"Could not parse the file: {e}") from e
    return _normalise(rows)


def parse_pasted(lines: str) -> list[dict]:
    """One test input per non-empty line (quick start without a file)."""
    return _normalise([ln for ln in lines.splitlines() if ln.strip()])
