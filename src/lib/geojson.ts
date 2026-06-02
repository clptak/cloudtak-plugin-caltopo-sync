// Deep-renames object keys (recursively through arrays and nested objects)
// according to `keyMap`. Used to make TAK mission GeoJSON Caltopo-friendly:
// `callsign` -> `title`, `remarks` -> `description`. Returns a new value; the
// input is never mutated.
//
// Collision handling: if an object already carries a rename target (e.g. a
// pre-existing `title`) AND the source key (`callsign`), the renamed value
// wins and the original target key is dropped.
export function renameKeysDeep<T>(value: T, keyMap: Record<string, string>): T {
    if (Array.isArray(value)) {
        return value.map((item) => renameKeysDeep(item, keyMap)) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        const renamedTargets = new Set(
            entries.filter(([k]) => k in keyMap).map(([k]) => keyMap[k]),
        );

        const out: Record<string, unknown> = {};
        for (const [k, v] of entries) {
            const newKey = keyMap[k] ?? k;
            // Skip an original target-named key when a renamed key also maps to it.
            if (newKey === k && renamedTargets.has(k)) continue;
            out[newKey] = renameKeysDeep(v, keyMap);
        }
        return out as unknown as T;
    }

    return value;
}
