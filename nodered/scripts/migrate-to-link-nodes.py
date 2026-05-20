#!/usr/bin/env python3
"""Migrate the bridge -> legacy fan-out cross-tab wire to a link out/in pair.

Why this exists
---------------
The bridge subflow's trigger function ("Validate + concurrency-gate + trigger
legacy fan-out") lives on the Bridge tab; the legacy fan-out change node
(`a075cdac694b8631`) lives on the Caltopo <-> TAK tab. A direct wire from
the trigger to the fan-out is a CROSS-TAB wire — Node-RED's UI doesn't
render or track those, and the editor silently strips them on every Deploy
that touches the Bridge tab. Confirmed twice in one session (2026-05-20).

Idiomatic Node-RED solution: use a `link out` (bridge side) and `link in`
(engine side) pair. Link nodes use named cross-tab references and survive
Deploys.

This script
-----------
Applied to a live flows.json. Idempotent.

1. Adds the bridge-side link out node `f1eda100b1d6e001` if missing, placed
   on the same tab as the trigger function. Its `links` array references
   the engine-side link in.
2. Adds the engine-side link in node `f1eda100b1d6e002` if missing, placed
   on the Caltopo <-> TAK tab (`8d455e872c814fd3`). Its `links` array
   references the bridge-side link out. Its `wires[0]` delivers into the
   legacy fan-out `a075cdac694b8631`.
3. Rewrites the trigger's `wires[0]` so it contains the link out id instead
   of the legacy fan-out id. Any direct fan-out reference on the trigger
   is removed (that's the Deploy-fragile thing).

After applying, restart Node-RED:
    docker restart my-nodered

Once this migration has been run successfully and verified, the older
post-import-patch.py is no longer needed for the trigger wire; it remains
relevant only for the sync03caltopoHttp / sync08takHttp stamp wires.
"""

import json
import sys
from pathlib import Path

LEGACY_FANOUT_ID    = "a075cdac694b8631"
LEGACY_TAB_ID       = "8d455e872c814fd3"  # Caltopo <-> TAK
TRIGGER_NAME        = "Validate + concurrency-gate + trigger legacy fan-out"
LINK_OUT_ID         = "f1eda100b1d6e001"
LINK_IN_ID          = "f1eda100b1d6e002"
LINK_OUT_NAME       = "to legacy fan-out"
LINK_IN_NAME        = "from bridge trigger"


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
    fanout  = find(lambda n: n.get("id") == LEGACY_FANOUT_ID)

    if not trigger:
        print(f"Cannot migrate — trigger function '{TRIGGER_NAME}' not found.", file=sys.stderr)
        print("Did you import nodered/flow-export.json into this Node-RED first?", file=sys.stderr)
        return 1
    if not fanout:
        print(f"Cannot migrate — legacy fan-out node {LEGACY_FANOUT_ID} not found.", file=sys.stderr)
        return 1

    bridge_tab = trigger.get("z")

    changes = []

    link_out = find(lambda n: n.get("id") == LINK_OUT_ID)
    if not link_out:
        link_out = {
            "id":    LINK_OUT_ID,
            "type":  "link out",
            "z":     bridge_tab,
            "name":  LINK_OUT_NAME,
            "mode":  "link",
            "links": [LINK_IN_ID],
            "x":     780,
            "y":     200,
            "wires": []
        }
        flows.append(link_out)
        changes.append(f"added link out '{LINK_OUT_NAME}' ({LINK_OUT_ID}) on bridge tab {bridge_tab}")
    else:
        if LINK_IN_ID not in link_out.get("links", []):
            link_out.setdefault("links", []).append(LINK_IN_ID)
            changes.append(f"link out {LINK_OUT_ID}.links += [{LINK_IN_ID}]")

    link_in = find(lambda n: n.get("id") == LINK_IN_ID)
    if not link_in:
        link_in = {
            "id":    LINK_IN_ID,
            "type":  "link in",
            "z":     LEGACY_TAB_ID,
            "name":  LINK_IN_NAME,
            "mode":  "link",
            "links": [LINK_OUT_ID],
            "x":     120,
            "y":     200,
            "wires": [[LEGACY_FANOUT_ID]]
        }
        flows.append(link_in)
        changes.append(f"added link in '{LINK_IN_NAME}' ({LINK_IN_ID}) on engine tab {LEGACY_TAB_ID}")
    else:
        if LINK_OUT_ID not in link_in.get("links", []):
            link_in.setdefault("links", []).append(LINK_OUT_ID)
            changes.append(f"link in {LINK_IN_ID}.links += [{LINK_OUT_ID}]")
        if not link_in.get("wires"):
            link_in["wires"] = [[LEGACY_FANOUT_ID]]
            changes.append(f"link in {LINK_IN_ID}.wires[0] = [{LEGACY_FANOUT_ID}]")
        elif LEGACY_FANOUT_ID not in link_in["wires"][0]:
            link_in["wires"][0].append(LEGACY_FANOUT_ID)
            changes.append(f"link in {LINK_IN_ID}.wires[0] += [{LEGACY_FANOUT_ID}]")

    # Rewire the trigger: wires[0] should point to LINK_OUT_ID, NOT LEGACY_FANOUT_ID.
    while len(trigger.setdefault("wires", [])) < 1:
        trigger["wires"].append([])
    out0 = trigger["wires"][0]
    if LEGACY_FANOUT_ID in out0:
        out0.remove(LEGACY_FANOUT_ID)
        changes.append(f"trigger.wires[0] -= [{LEGACY_FANOUT_ID}]  (fragile cross-tab wire)")
    if LINK_OUT_ID not in out0:
        out0.append(LINK_OUT_ID)
        changes.append(f"trigger.wires[0] += [{LINK_OUT_ID}]")

    if not changes:
        print("No changes — flows.json already migrated to link out/in.")
        return 0

    flows_path.write_text(json.dumps(flows, indent=4))
    print(f"Applied {len(changes)} change(s) to {flows_path}:")
    for c in changes:
        print(f"  - {c}")
    print("\nRestart Node-RED so the runtime picks up the new structure:")
    print("  docker restart my-nodered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
