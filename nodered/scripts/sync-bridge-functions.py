#!/usr/bin/env python3
"""Sync function-node bodies from this repo's `flow-export.json` into a
running Node-RED's `flows.json` — without going through the Node-RED UI
re-import workflow.

When a new bridge release ships (v1.0.1, v1.0.2, …) the change is
almost always inside one or more `function` nodes on the "Caltopo Sync
Plugin Bridge" tab. Re-importing the whole subflow via the Node-RED UI
works, but it forces you to re-pick "replace" on every node-conflict
dialog and re-run post-import-patch.py afterward. This script just
finds matching function nodes by NAME and copies `func` + `libs` over
in place. No re-import, no UI clicks, no wire reset.

The script matches by `name`, not `id`. Node-RED regenerates ids when
flows are imported, so matching by name survives across re-imports and
across operator instances. Only function nodes on the bridge tab are
touched. Engine-tab functions (CoT parser, Ensure-Subscription, etc.)
live in the separate node-red-caltopo-tak-sync repo and aren't in this
flow-export — they're not affected by this script.

Idempotent: if a function body in live already matches source, no
write happens.

Usage:
    python3 nodered/scripts/sync-bridge-functions.py /path/to/your/flows.json

After running, restart Node-RED so the runtime picks up the new code:
    docker restart <your-nodered-container>
"""

import json
import sys
from collections import Counter
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "flow-export.json"
BRIDGE_TAB_LABEL = "Caltopo Sync Plugin Bridge"
ENGINE_TAB_LABEL = "Caltopo <-> TAK"
# Engine-tab function names that one-way sync patches (matched by unique name).
ENGINE_FUNC_NAMES = frozenset({"Extract Sync Params", "Set Delete Query"})


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    target_path = Path(sys.argv[1])
    if not target_path.is_file():
        print(f"Not a file: {target_path}", file=sys.stderr)
        return 1
    if not SOURCE.is_file():
        print(f"Source missing: {SOURCE}", file=sys.stderr)
        return 1

    source = json.loads(SOURCE.read_text())
    target = json.loads(target_path.read_text())

    src_tab = next(
        (n for n in source if n.get("type") == "tab" and n.get("label") == BRIDGE_TAB_LABEL),
        None,
    )
    tgt_tab = next(
        (n for n in target if n.get("type") == "tab" and n.get("label") == BRIDGE_TAB_LABEL),
        None,
    )
    engine_tab = next(
        (n for n in source if n.get("type") == "tab" and n.get("label") == ENGINE_TAB_LABEL),
        None,
    )
    tgt_engine_tab = next(
        (n for n in target if n.get("type") == "tab" and n.get("label") == ENGINE_TAB_LABEL),
        None,
    )
    if not src_tab:
        print(f"Source flow-export.json missing tab labeled {BRIDGE_TAB_LABEL!r}", file=sys.stderr)
        return 1
    if not tgt_tab:
        print(f"Live flows.json missing tab labeled {BRIDGE_TAB_LABEL!r}", file=sys.stderr)
        print("Import nodered/flow-export.json into Node-RED first, then re-run.", file=sys.stderr)
        return 1

    src_tab_id = src_tab["id"]
    tgt_tab_id = tgt_tab["id"]

    src_fns = [
        n for n in source
        if n.get("type") == "function" and n.get("z") == src_tab_id
    ]
    if engine_tab:
        src_fns.extend(
            n for n in source
            if n.get("type") == "function"
            and n.get("z") == engine_tab["id"]
            and n.get("name") in ENGINE_FUNC_NAMES
        )
    tgt_fns = [
        n for n in target
        if n.get("type") == "function" and n.get("z") == tgt_tab_id
    ]
    if tgt_engine_tab:
        tgt_fns.extend(
            n for n in target
            if n.get("type") == "function"
            and n.get("z") == tgt_engine_tab["id"]
            and n.get("name") in ENGINE_FUNC_NAMES
        )
    # Name-based matching is safe ONLY when a name uniquely identifies one
    # function node in both source AND target. If the same name appears more
    # than once on either side, blindly matching by name + first-wins would
    # quietly write the wrong source body into the wrong target node (e.g.
    # the bridge ships three sibling "Format JSON" nodes — one per endpoint
    # — with subtly different bodies that must stay paired to specific
    # endpoint chains). Skip ambiguous names entirely and tell the operator.
    src_name_counts = Counter(n.get("name", "") for n in src_fns)
    tgt_name_counts = Counter(n.get("name", "") for n in tgt_fns)
    ambiguous = sorted(
        n for n in set(src_name_counts) | set(tgt_name_counts)
        if n and (src_name_counts[n] > 1 or tgt_name_counts[n] > 1)
    )

    tgt_by_name = {n.get("name", ""): n for n in tgt_fns
                   if tgt_name_counts[n.get("name", "")] == 1}

    updates = []
    missing = []
    unchanged = []
    skipped_ambiguous = list(ambiguous)
    for sn in src_fns:
        name = sn.get("name", "")
        if not name:
            continue  # unnamed source function, no way to match
        if name in ambiguous:
            continue  # already reported in skipped_ambiguous
        tn = tgt_by_name.get(name)
        if not tn:
            missing.append(name)
            continue
        new_func = sn.get("func", "")
        new_libs = sn.get("libs", []) or []
        old_func = tn.get("func", "")
        old_libs = tn.get("libs", []) or []
        if new_func == old_func and new_libs == old_libs:
            unchanged.append(name)
            continue
        tn["func"] = new_func
        tn["libs"] = new_libs
        updates.append(name)

    if not updates:
        print(f"No changes — all uniquely-named bridge function bodies already match source.")
        if skipped_ambiguous:
            print(f"\n{len(skipped_ambiguous)} ambiguous name(s) skipped (multiple nodes share the name in source and/or target):")
            for name in skipped_ambiguous:
                print(f"  - {name!r} (source: {src_name_counts[name]}, target: {tgt_name_counts[name]})")
            print("  These need a one-shot UI re-import to update safely.")
        if missing:
            print(f"\n{len(missing)} source function(s) not found in target:")
            for name in missing:
                print(f"    - {name!r}")
        return 0

    target_path.write_text(json.dumps(target, indent=4))

    print(f"Updated {len(updates)} function body/bodies in {target_path}:")
    for name in updates:
        print(f"  - {name!r}")
    if skipped_ambiguous:
        print(f"\n{len(skipped_ambiguous)} ambiguous name(s) skipped (multiple nodes share the name in source and/or target):")
        for name in skipped_ambiguous:
            print(f"  - {name!r} (source: {src_name_counts[name]}, target: {tgt_name_counts[name]})")
        print("  These need a one-shot UI re-import to update safely.")
    if missing:
        print(f"\n{len(missing)} source function(s) had no matching name in target (not applied):")
        for name in missing:
            print(f"  - {name!r}")
        print("  (If these were renamed in source, the script can't auto-match. Re-import the")
        print("   subflow once via Node-RED UI to pick them up.)")
    if unchanged:
        print(f"\n({len(unchanged)} function(s) already matched and were left alone.)")
    print("\nRestart Node-RED so the runtime picks up the new code:")
    print("  docker restart <your-nodered-container>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
