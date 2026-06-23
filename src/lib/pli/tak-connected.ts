import { db } from '../../../../../src/database.ts';

export async function isCallsignConnectedOnMap(callsign: string): Promise<boolean> {
    const normalized = callsign.trim();
    if (!normalized) return false;

    const features = await db.feature.toArray();
    for (const feat of features) {
        if (String(feat.properties?.callsign ?? '') === normalized) return true;
    }

    const contacts = await db.contact.filter((c: { callsign: string; uid: string }) => c.callsign === normalized).toArray();
    for (const contact of contacts) {
        const feat = await db.feature.get(contact.uid);
        if (feat) return true;
    }

    return false;
}
