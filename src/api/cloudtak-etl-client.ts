// Reads the Map/Mission pairs run by the CloudTAK CalTopo ETL from CloudTAK's
// own API. Listing Connection Layers needs access to the Connection - a
// CloudTAK System Administrator on a self-hosted CloudTAK.

import { std, stdurl } from '../../../../src/std.ts';
import { etlPairsFromLayer } from '../lib/etl-pairs.ts';
import type { EtlLayer, EtlPair } from '../lib/etl-pairs.ts';

interface ConnectionList {
    items: Array<{ id: number; name: string }>;
}

interface LayerList {
    items: EtlLayer[];
}

export async function listEtlPairs(): Promise<EtlPair[]> {
    const url = stdurl('/api/connection');
    url.searchParams.set('limit', '100');
    const connections = await std(url) as ConnectionList;

    const pairs: EtlPair[] = [];
    for (const connection of connections.items ?? []) {
        const layerUrl = stdurl(`/api/connection/${connection.id}/layer`);
        // CloudTAK's filter matches Layer names, which admins choose freely - the task is checked instead
        layerUrl.searchParams.set('limit', '100');

        const layers = await std(layerUrl) as LayerList;
        for (const layer of layers.items ?? []) pairs.push(...etlPairsFromLayer(connection, layer));
    }

    return pairs;
}
