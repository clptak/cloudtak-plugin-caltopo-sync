#!/usr/bin/env python3
"""Apply post-import wire patches to a Node-RED flows.json.

Node-RED's Import dialog deliberately does NOT modify the `wires` array
of existing nodes when an imported flow tries to. The bridge subflow
needs three wire additions on existing legacy nodes that Import can't
apply on its own. This script applies them surgically and idempotently.

The three additions:

1. Bridge trigger fn output 0 -> legacy fan-out `a075cdac694b8631`
   Without this, /sync/run does no work but still runs the stale-delete,
   silently destroying caltopo_maps rows for the target map_id.

2. `sync04caltopoDebug.wires` += [<caltopo stamp id from bridge>]
3. `sync09takDebug.wires`    += [<tak stamp id from bridge>]
   These deliver per-feature completion signals from each direction's
   terminal node into the bridge's join. Without them the bridge always
   falls back to the 30s safety timeout and reports synthetic completion.

Usage:
    python3 nodered/scripts/post-import-patch.py /path/to/your/flows.json

Then restart Node-RED so the runtime picks up the new wires.

The script is idempotent: re-running it after the patches are already
applied is a no-op (no file write, exit 0).
"""

import json
import sys
from pathlib import Path

LEGACY_FANOUT       = "a075cdac694b8631"
LEGACY_TAB          = "8d455e872c814fd3"  # Caltopo <-> TAK
TRIGGER_NAME        = "Validate + concurrency-gate + trigger legacy fan-out"
CALTOPO_STAMP_NAME  = "stamp _completionDirection=caltopo"
TAK_STAMP_NAME      = "stamp _completionDirection=tak"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    flows_path = Path(sys.argv[1])
    if not flows_path.is_file():
        print(f"Not a file: {flows_path}", file=sys.stderr)
        return 1

    flows = json.loads(flows_path.read_text())

    def find(predicate):
        for n in flows:
            if predicate(n):
                return n
        return None

    trigger = find(lambda n: n.get("name") == TRIGGER_NAME and n.get("type") == "function")
    caltopo_stamp = find(lambda n: n.get("name") == CALTOPO_STAMP_NAME and n.get("z") == LEGACY_TAB)
    tak_stamp = find(lambda n: n.get("name") == TAK_STAMP_NAME and n.get("z") == LEGACY_TAB)
    sync04 = find(lambda n: n.get("id") == "sync04caltopoDebug")
    sync09 = find(lambda n: n.get("id") == "sync09takDebug")

    missing = [name for n, name in [
        (trigger, TRIGGER_NAME),
        (caltopo_stamp, CALTOPO_STAMP_NAME),
        (tak_stamp, TAK_STAMP_NAME),
        (sync04, "sync04caltopoDebug"),
        (sync09, "sync09takDebug"),
    ] if n is None]
    if missing:
        print("Cannot patch — required node(s) not found:", file=sys.stderr)
        for name in missing:
            print(f"  - {name}", file=sys.stderr)
        print("\nDid you import nodered/flow-export.json into this Node-RED first?",
              file=sys.stderr)
        return 1

    changes = []

    # Trigger output 0 -> legacy fan-out
    while len(trigger["wires"]) < 3:
        trigger["wires"].append([])
    if LEGACY_FANOUT not in trigger["wires"][0]:
        trigger["wires"][0].append(LEGACY_FANOUT)
        changes.append(f"trigger output 0 += [{LEGACY_FANOUT}]")

    # sync04caltopoDebug -> caltopo stamp
    if not sync04.get("wires"):
        sync04["wires"] = [[]]
    if caltopo_stamp["id"] not in sync04["wires"][0]:
        sync04["wires"][0].append(caltopo_stamp["id"])
        changes.append(f"sync04caltopoDebug.wires[0] += [{caltopo_stamp['id']}]")

    # sync09takDebug -> tak stamp
    if not sync09.get("wires"):
        sync09["wires"] = [[]]
    if tak_stamp["id"] not in sync09["wires"][0]:
        sync09["wires"][0].append(tak_stamp["id"])
        changes.append(f"sync09takDebug.wires[0] += [{tak_stamp['id']}]")

    if not changes:
        print("No changes — flows.json already patched.")
        return 0

    flows_path.write_text(json.dumps(flows, indent=4))
    print(f"Applied {len(changes)} wire patch(es) to {flows_path}:")
    for c in changes:
        print(f"  - {c}")
    print("\nRestart Node-RED so the runtime picks up the new wires:")
    print("  docker restart <your-nodered-container>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
