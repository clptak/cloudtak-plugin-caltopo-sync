import test from 'node:test';
import assert from 'node:assert';
import { etlPairsFromLayer, etlPairHealth, etlChangeSummary, ETL_STALE_MS } from '../src/lib/etl-pairs.ts';
import type { EtlLayer } from '../src/lib/etl-pairs.ts';

const NOW = Date.parse('2026-10-31T16:30:00Z');
const CONNECTION = { id: 1, name: 'CCSO SAR' };

function layer(overrides: Partial<EtlLayer> = {}, status?: unknown): EtlLayer {
    return {
        id: 4,
        name: 'CalTopo Sync',
        enabled: true,
        task: 'etl-caltopo-v5.18.0',
        incoming: {
            environment: {
                Source: {
                    Mode: 'Sync',
                    CredentialId: 'ID',
                    CredentialSecret: 'SECRET',
                    MissionToken: 'etl.token',
                    Pairs: [{ MapId: 'APJ7U0R', MissionGuid: 'c66f4e80' }],
                    DryRun: false,
                },
            },
            ephemeral: status === undefined ? {} : { 'sync:status': status, 'sync:APJ7U0R:c66f4e80': { links: [] } },
            data: 1,
        },
        ...overrides,
    };
}

const STATUS = {
    at: '2026-10-31T16:29:00.000Z',
    pairs: [{
        MapId: 'APJ7U0R', MissionGuid: 'c66f4e80', at: '2026-10-31T16:29:00.000Z', ok: true, dryRun: false,
        mission: 16, caltopo: 20, linked: 16, plan: {}, applied: 0, failed: 0, toTak: 3, appTracks: 0, errors: [],
    }],
};

test('etlPairsFromLayer - a Sync Layer gives its pairs with their last status, never its secrets', () => {
    const pairs = etlPairsFromLayer(CONNECTION, layer({}, STATUS));

    assert.equal(pairs.length, 1);
    assert.deepEqual({ ...pairs[0], status: undefined }, {
        connectionId: 1,
        connectionName: 'CCSO SAR',
        layerId: 4,
        layerName: 'CalTopo Sync',
        enabled: true,
        version: '5.18.0',
        dataSyncId: 1,
        mapId: 'APJ7U0R',
        missionGuid: 'c66f4e80',
        dryRun: false,
        status: undefined,
    });
    assert.equal(pairs[0].status?.linked, 16);
    assert.equal(pairs[0].status?.toTak, 3);
    assert.ok(!JSON.stringify(pairs).includes('SECRET'));
    assert.ok(!JSON.stringify(pairs).includes('etl.token'));
});

test('etlPairsFromLayer - other Layers, other modes and incomplete pairs are ignored', () => {
    assert.deepEqual(etlPairsFromLayer(CONNECTION, layer({ task: 'etl-arcgis-v1.0.0' })), []);
    assert.deepEqual(etlPairsFromLayer(CONNECTION, layer({ incoming: { environment: { Source: { Mode: 'Team' } } } })), []);
    assert.deepEqual(etlPairsFromLayer(CONNECTION, layer({ incoming: undefined })), []);
    assert.deepEqual(etlPairsFromLayer(CONNECTION, layer({ incoming: { environment: { Source: { Mode: 'Sync', Pairs: [{ MapId: 'X' }] } } } })), []);
});

test('etlPairsFromLayer - a pair without a saved status has none, DryRun defaults on', () => {
    const [pair] = etlPairsFromLayer(CONNECTION, layer({ incoming: { environment: { Source: { Mode: 'Sync', Pairs: [{ MapId: 'M', MissionGuid: 'G' }] } } } }));
    assert.equal(pair.status, undefined);
    assert.equal(pair.dryRun, true);
    assert.equal(pair.dataSyncId, null);
});

test('etlPairHealth - disabled, never run, errors, stale, dry run and ok', () => {
    const [pair] = etlPairsFromLayer(CONNECTION, layer({}, STATUS));

    assert.equal(etlPairHealth(pair, NOW), 'ok');
    assert.equal(etlPairHealth({ ...pair, enabled: false }, NOW), 'disabled');
    assert.equal(etlPairHealth({ ...pair, status: undefined }, NOW), 'never');
    assert.equal(etlPairHealth({ ...pair, status: { ...pair.status!, ok: false } }, NOW), 'error');
    assert.equal(etlPairHealth(pair, Date.parse(pair.status!.at) + ETL_STALE_MS + 1), 'stale');
    assert.equal(etlPairHealth({ ...pair, status: { ...pair.status!, dryRun: true } }, NOW), 'dry-run');
});

test('etlChangeSummary - counts in words, dry runs as planned', () => {
    const [pair] = etlPairsFromLayer(CONNECTION, layer({}, STATUS));
    const status = pair.status!;

    assert.equal(etlChangeSummary(status), 'No changes');
    assert.equal(etlChangeSummary({ ...status, plan: { create: 2, update: 1, skip: 3 } }), '2 created, 1 updated');
    assert.equal(etlChangeSummary({ ...status, plan: { create: 2 }, failed: 1 }), '2 created, 1 failed');
    assert.equal(etlChangeSummary({ ...status, dryRun: true, plan: { delete: 1 } }), '1 to be deleted');
});
