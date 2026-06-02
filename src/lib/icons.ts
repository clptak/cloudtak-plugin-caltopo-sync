// TAK -> Caltopo icon translation for the GeoJSON download.
//
// The lookup table (src/data/tak-to-caltopo-icons.json) is the same
// `takToCaltopo` map the Node-RED engine builds from /data/icon-configs.json:
// keys are lowercased `iconsetUid/folder/name.png` custom-iconset paths, plus
// bare cotTypes (e.g. "a-h-G") as a fallback. Each value's `iconLabel` is the
// Caltopo marker symbol.
//
// `takIconToCaltopoSymbol` is a byte-for-byte mirror of the flow's
// `takIconToCaltopoLabel` (node "Normalize CoT -> Caltopo-shape").

import iconMapJson from '../data/tak-to-caltopo-icons.json';

export interface TakIconEntry {
    iconLabel: string;
    cotType: string;
    iconName: string | null;
    iconsetUid: string | null;
    iconsetFolder: string | null;
}

const TAK_TO_CALTOPO = iconMapJson as Record<string, TakIconEntry>;

// rawIcon from node-cot is either a custom iconset path ("uid:folder/name" or
// "uid/folder/name.png") or a standard cotType ("a-h-G"). Returns the Caltopo
// marker symbol (iconLabel), or undefined when nothing maps.
export function takIconToCaltopoSymbol(
    rawIcon: string | undefined,
    cotType: string | undefined,
): string | undefined {
    if (rawIcon && rawIcon.includes(':')) {
        // Custom iconset path with colon separator -> normalize to slash, lowercase.
        const slashIcon = rawIcon.replace(':', '/').toLowerCase();
        const entry = TAK_TO_CALTOPO[slashIcon] ?? TAK_TO_CALTOPO[slashIcon + '.png'];
        if (entry) return entry.iconLabel;
    } else if (rawIcon && rawIcon.includes('/') && !/^[a-z]-/.test(rawIcon)) {
        // Already slash-separated custom path (not a standard "a-…" cotType).
        const slashIcon = rawIcon.toLowerCase();
        const entry = TAK_TO_CALTOPO[slashIcon] ?? TAK_TO_CALTOPO[slashIcon + '.png'];
        if (entry) return entry.iconLabel;
    }

    // Standard CoT type, or a custom path missing from the table -> cotType key.
    if (cotType) {
        const entry = TAK_TO_CALTOPO[cotType];
        if (entry) return entry.iconLabel;
    }

    return undefined;
}

// Walks a GeoJSON FeatureCollection (in place) and stamps each Point feature's
// `marker-symbol` with the translated Caltopo symbol derived from its TAK
// `icon` / `type` properties. Non-point geometries are left untouched.
export function applyCaltopoMarkerSymbols(collection: unknown): void {
    if (!collection || typeof collection !== 'object') return;
    const features = (collection as { features?: unknown }).features;
    if (!Array.isArray(features)) return;

    for (const feat of features) {
        if (!feat || typeof feat !== 'object') continue;
        const f = feat as {
            geometry?: { type?: string } | null;
            properties?: Record<string, unknown> | null;
        };
        if (!f.geometry || f.geometry.type !== 'Point') continue;
        const props = f.properties;
        if (!props || typeof props !== 'object') continue;

        const rawIcon = typeof props.icon === 'string' ? props.icon : undefined;
        const cotType = typeof props.type === 'string' ? props.type : undefined;
        const symbol = takIconToCaltopoSymbol(rawIcon, cotType);
        if (symbol) {
            props['marker-symbol'] = symbol;
        } else {
            // Unmatched icon -> fall back to a red Caltopo point.
            props['marker-symbol'] = 'point';
            props['marker-color'] = 'FF0000';
        }
    }
}
