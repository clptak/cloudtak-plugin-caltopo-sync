#!/usr/bin/env python3
"""Sync the bridge subflow from your running Node-RED back into this repo.

When you iterate on the bridge in the Node-RED editor and want those
changes to ship in the next plugin release, run this script to extract
the bridge tab (and the helper nodes we relocated onto the legacy tab)
from your live flows.json and overwrite nodered/flow-export.json.

What this DOES copy:
  - The "Caltopo Sync Plugin Bridge" tab itself
  - Every node whose `z` matches the bridge tab id
  - Six helper nodes on the legacy Caltopo<->TAK tab (the ones the
    post-import patch script restores). Identified by exact `name`:
      * stamp _completionDirection=caltopo
      * stamp _completionDirection=tak
      * completion signal: caltopo direction
      * completion signal: tak direction
      * TAK->Caltopo push result
      * Caltopo->TAK push result

What this DOES NOT copy:
  - The wire mutations on existing legacy nodes (`sync04caltopoDebug`,
    `sync09takDebug`). Those are owned by the legacy flow and applied
    via `post-import-patch.py` on every install.
  - Anything from other tabs (Start Up, TAK Server Connection, etc.).

Usage:
    python3 nodered/scripts/sync-from-runtime.py /path/to/your/flows.json

After running:
    git -C <repo> diff nodered/flow-export.json   # review carefully
    git -C <repo> add nodered/flow-export.json && git commit -m "..."

The script preserves Node-RED's 4-space JSON formatting and the live
file's node ordering.

ID CHURN WARNING: Node-RED regenerates node IDs whenever the bridge is
re-imported into a fresh runtime. The first run after an import will
therefore produce a large diff against the canonical IDs that were in
flow-export.json before. That diff is purely cosmetic — `post-import-
patch.py` and the bridge's internal wiring both look nodes up by NAME,
not ID. Run this script only when you have real functional changes to
capture; don't run it just to "check in sync" because it'll churn IDs
every time the runtime was reimported.
"""

import json
import sys
from pathlib import Path

REPO_EXPORT = Path(__file__).resolve().parents[1] / "flow-export.json"
BRIDGE_TAB_LABEL = "Caltopo Sync Plugin Bridge"
LEGACY_TAB_ID = "8d455e872c814fd3"

HELPER_NAMES_ON_LEGACY = {
    "stamp _completionDirection=caltopo",
    "stamp _completionDirection=tak",
    "completion signal: caltopo direction",
    "completion signal: tak direction",
    "TAK->Caltopo push result",
    "Caltopo->TAK push result",
}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    src = Path(sys.argv[1])
    if not src.is_file():
        print(f"Not a file: {src}", file=sys.stderr)
        return 1

    live = json.loads(src.read_text())

    bridge_tab = next(
        (n for n in live if n.get("type") == "tab" and n.get("label") == BRIDGE_TAB_LABEL),
        None,
    )
    if not bridge_tab:
        print(f"Could not find a tab labeled {BRIDGE_TAB_LABEL!r} in {src}", file=sys.stderr)
        print("Did you import nodered/flow-export.json into this Node-RED?", file=sys.stderr)
        return 1

    bridge_tab_id = bridge_tab["id"]

    # Preserve live-file ordering. Single pass.
    out = []
    found_helpers = set()
    bridge_node_count = 0
    for n in live:
        if n is bridge_tab:
            out.append(n)
        elif n.get("z") == bridge_tab_id:
            out.append(n)
            bridge_node_count += 1
        elif n.get("z") == LEGACY_TAB_ID and n.get("name") in HELPER_NAMES_ON_LEGACY:
            out.append(n)
            found_helpers.add(n.get("name"))

    missing_helpers = HELPER_NAMES_ON_LEGACY - found_helpers
    if missing_helpers:
        print("Warning: missing helper nodes on legacy tab:", file=sys.stderr)
        for name in sorted(missing_helpers):
            print(f"  - {name!r}", file=sys.stderr)
        print(
            "Run nodered/scripts/post-import-patch.py against your flows.json,\n"
            "OR manually restore the helper nodes, then re-run this script.",
            file=sys.stderr,
        )
        return 1

    REPO_EXPORT.write_text(json.dumps(out, indent=4) + "\n")

    print(f"Wrote {len(out)} entries to {REPO_EXPORT}")
    print(f"  - 1 bridge tab ({bridge_tab_id})")
    print(f"  - {bridge_node_count} nodes on bridge tab")
    print(f"  - {len(found_helpers)} helper nodes on legacy tab")
    print()
    print("Next: review the diff before committing —")
    print("  git -C <repo> diff nodered/flow-export.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
