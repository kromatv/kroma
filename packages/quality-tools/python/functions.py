"""Every function of the given files as one JSON line each: where it is and what it scores.

crapper's own snapshot names a function by namespace and name, with no file
and no line, so a gate could not tell which functions a change touched.

    python -m functions <root> <lcov|none> <file> ...
"""

import json
import sys
from pathlib import Path

from crapper.coverage import load_bundle
from crapper.crap import make_entry
from crapper.discover import language_of
from crapper.languages import functions_in_file
from crapper.languages.treesitter import descendants, parse, start_line

NESTING = {
    "if_expression",
    "match_expression",
    "for_expression",
    "while_expression",
    "loop_expression",
}


def _depth(function) -> int:
    deepest = 0
    stack = [(function, 0)]
    while stack:
        node, depth = stack.pop()
        if node is not function and node.type == "function_item":
            continue
        if node.type in NESTING:
            depth += 1
            deepest = max(deepest, depth)
        stack.extend((child, depth) for child in node.children)
    return deepest


def _parameters(function) -> int:
    declared = function.child_by_field_name("parameters")
    if declared is None:
        return 0
    return sum(1 for child in declared.named_children if child.type == "parameter")


def _tries(function) -> int:
    return sum(1 for node in descendants(function) if node.type == "try_expression")


def rust_shapes(source: str) -> dict[int, dict[str, int]]:
    """Parameters, nesting depth and `?` count of each Rust function, by its first line."""

    _, tree = parse(source, "rust")
    return {
        start_line(node): {
            "parameters": _parameters(node),
            "nesting": _depth(node),
            "tries": _tries(node),
        }
        for node in descendants(tree.root_node)
        if node.type == "function_item"
    }


def _code_lines(lines: list[str], function) -> int:
    body = lines[function.start_line - 1 : function.end_line]
    return sum(1 for line in body if line.strip() and not line.lstrip().startswith("//"))


def _coverage(bundle, function):
    if bundle is None:
        return None
    return bundle.percent_for(function) or 0.0


def _rows(root: Path, relative: str, bundle):
    file = root / relative
    language = language_of(file)
    if language is None:
        return
    source = file.read_text(encoding="utf-8", errors="replace")
    shapes = rust_shapes(source) if language == "rust" else {}
    lines = source.splitlines()
    for function in functions_in_file(language, source, relative, str(root)):
        entry = make_entry(function, _coverage(bundle, function))
        yield {
            "file": relative,
            "name": function.name,
            "namespace": function.namespace,
            "start": function.start_line,
            "end": function.end_line,
            "lines": _code_lines(lines, function),
            "complexity": function.complexity,
            "coverage": entry.coverage,
            "crap": entry.crap,
            **shapes.get(function.start_line, {}),
        }


def main(argv: list[str]) -> int:
    root = Path(argv[0]).resolve()
    files = argv[2:]
    bundle = load_bundle(root) if argv[1] == "lcov" else None
    if bundle is not None:
        bundle.bind_sources(files)
    for relative in files:
        for row in _rows(root, relative, bundle):
            print(json.dumps(row))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
