#!/usr/bin/env python3
"""Apply post-import wire patches to a Node-RED flows.json.

Node-RED's Import dialog deliberately does NOT modify the `wires` array
of existing nodes when an imported flow tries to. The bridge subflow
needs three wire additions on existing legacy nodes that Import can't
apply on its own. This script applies them surgically and idempotently.

The patched wires:

1. `sync03caltopoHttp.wires[0]` += [<caltopo stamp id from bridge>]
2. `sync08takHttp.wires[0]`    += [<tak stamp id from bridge>]
   These deliver per-feature completion signals from each direction's
   HTTP request response into the bridge's join. WITHOUT them, the
   bridge never observes completion and always falls back to the 30s
   safety timeout, reporting synthetic counts.

NOTE: The third historical patch — `trigger output 0 -> a075cdac694b8631` —
was a CROSS-TAB direct wire that Node-RED's editor silently stripped on
every Deploy touching the Bridge tab (confirmed twice on 2026-05-20).
That patch is now obsolete. The trigger -> fan-out connection is provided
by the `link out` / `link in` pair set up by `migrate-to-link-nodes.py`,
which is Deploy-safe. If `/sync/run` still returns 30s synthetic with
last_sync_at: null, run `migrate-to-link-nodes.py` first, not this script.

NOTE: prior versions of this script patched sync04caltopoDebug /
sync09takDebug instead. Those are TYPE=DEBUG nodes — they have no
outputs in Node-RED's runtime, so any wires we put on them were
silently ignored. The HTTP request nodes one hop upstream are the
correct targets: their wires[0] already includes the debug node;
we append the stamp id alongside.

Idempotent: re-running after the patches are already applied prints
"No changes" and exits 0.
"""

import json
import sys
from pathlib import Path

LEGACY_TAB          = "8d455e872c814fd3"  # Caltopo <-> TAK
CALTOPO_STAMP_NAME  = "stamp _completionDirection=caltopo"
TAK_STAMP_NAME      = "stamp _completionDirection=tak"
CALTOPO_HTTP_ID     = "sync03caltopoHttp"  # POST to Caltopo (upstream of sync04caltopoDebug)
TAK_HTTP_ID         = "sync08takHttp"      # PUT to TAK Mission (upstream of sync09takDebug)
# Debug node IDs we used to patch (incorrectly — debug nodes have no outputs).
# This script now resets their wires to [] to clean up the dead patches.
STALE_DEBUG_IDS     = {"sync04caltopoDebug", "sync09takDebug"}


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

    caltopo_stamp = find(lambda n: n.get("name") == CALTOPO_STAMP_NAME and n.get("z") == LEGACY_TAB)
    tak_stamp = find(lambda n: n.get("name") == TAK_STAMP_NAME and n.get("z") == LEGACY_TAB)
    caltopo_http = find(lambda n: n.get("id") == CALTOPO_HTTP_ID)
    tak_http = find(lambda n: n.get("id") == TAK_HTTP_ID)

    missing = [name for n, name in [
        (caltopo_stamp, CALTOPO_STAMP_NAME),
        (tak_stamp, TAK_STAMP_NAME),
        (caltopo_http, CALTOPO_HTTP_ID),
        (tak_http, TAK_HTTP_ID),
    ] if n is None]
    if missing:
        print("Cannot patch — required node(s) not found:", file=sys.stderr)
        for name in missing:
            print(f"  - {name}", file=sys.stderr)
        print("\nDid you import nodered/flow-export.json into this Node-RED first?",
              file=sys.stderr)
        return 1

    changes = []

    # sync03caltopoHttp output 0 -> caltopo stamp
    if not caltopo_http.get("wires"):
        caltopo_http["wires"] = [[]]
    if caltopo_stamp["id"] not in caltopo_http["wires"][0]:
        caltopo_http["wires"][0].append(caltopo_stamp["id"])
        changes.append(f"{CALTOPO_HTTP_ID}.wires[0] += [{caltopo_stamp['id']}]")

    # sync08takHttp output 0 -> tak stamp
    if not tak_http.get("wires"):
        tak_http["wires"] = [[]]
    if tak_stamp["id"] not in tak_http["wires"][0]:
        tak_http["wires"][0].append(tak_stamp["id"])
        changes.append(f"{TAK_HTTP_ID}.wires[0] += [{tak_stamp['id']}]")

    # Clean up the stale (no-op) wire entries on the debug-type terminal nodes.
    # Earlier versions of this script tried to patch them; debug nodes have no
    # outputs so the wires were silently ignored. Reset to [] to avoid the
    # confusion of seeing wires set on a node that doesn't honor them.
    for sid in STALE_DEBUG_IDS:
        n = find(lambda x, sid=sid: x.get("id") == sid)
        if n and n.get("wires") and any(n["wires"]):
            n["wires"] = [[]]
            changes.append(f"{sid}.wires reset to [] (debug nodes have no outputs)")

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
