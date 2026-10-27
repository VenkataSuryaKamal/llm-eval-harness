"""Tiny, safe prompt templating.

Only `{{name}}` placeholders are replaced, by plain string substitution. We do NOT
use Jinja/format()/eval, so a dataset cell can never execute code or read
attributes (no server-side template injection).
"""
import re

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*\}\}")


def placeholders(template: str) -> set[str]:
    return set(PLACEHOLDER.findall(template))


def render(template: str, variables: dict[str, str]) -> str:
    """Fill placeholders. If the template has no {{input}}, the input is appended."""
    def sub(m: re.Match) -> str:
        return str(variables.get(m.group(1), m.group(0)))

    rendered = PLACEHOLDER.sub(sub, template)
    if "input" not in placeholders(template) and variables.get("input"):
        rendered = f"{rendered.rstrip()}\n\n{variables['input']}"
    return rendered
