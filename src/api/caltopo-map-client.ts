// Asks the CloudTAK CalTopo ETL for a new CalTopo map through a flagged CloudTAK Event and
// waits for the ETL to file the map ID on it (see lib/caltopo-map-event.ts).

import { std } from '../../../../src/std.ts';
import GroupManager from '../../../../src/base/group.ts';
import { mapEventBody, eventMapId, caltopoMapUrl } from '../lib/caltopo-map-event.ts';
import type { MapEventRequest } from '../lib/caltopo-map-event.ts';

export interface CreatedCaltopoMap {
    mapId: string;
    url: string;
    eventId: string;
}

/** The bitpos of the user's active channels - used when no channel is picked */
export async function activeChannels(): Promise<number[]> {
    return (await GroupManager.list({ active: true })).map((group) => group.bitpos);
}

/** Channel names to bitpos */
export async function channelBitpos(names: string[]): Promise<number[]> {
    const groups = await GroupManager.list();
    return groups.filter((group) => names.includes(group.name)).map((group) => group.bitpos);
}

const WAIT_MS = 120_000;
const POLL_MS = 3_000;

export async function createCaltopoMap(request: MapEventRequest, onStep: (step: string) => void = () => {}): Promise<CreatedCaltopoMap> {
    const body = mapEventBody(request);
    if ('error' in body) throw new Error(String(body.error));

    onStep('Requesting the CalTopo map');
    const event = await std('/api/core/event', { method: 'POST', body }) as { id: string };

    onStep('Waiting for the CloudTAK ETL to create the map');
    const until = Date.now() + WAIT_MS;
    while (Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const current = await std(`/api/core/event/${event.id}`) as { external_ids?: Record<string, string> };
        const mapId = eventMapId(current);
        if (mapId) return { mapId, url: caltopoMapUrl(mapId), eventId: event.id };
    }

    throw new Error(`No CalTopo map after ${WAIT_MS / 1000}s - the Event "${String(body.name)}" was created, but no CalTopo Layer made a map for it. `
        + 'Check that a CalTopo Layer on these channels has its Outgoing AccountId and TeamId set and runs etl-caltopo 5.19.0 or later');
}
