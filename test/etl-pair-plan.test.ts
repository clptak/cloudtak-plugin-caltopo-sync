import test from 'node:test';
import assert from 'node:assert';
import { planEtlPair, caltopoMapId, templateCandidates, goLiveEnvironment, MISSION_DIFF_ROLE } from '../src/lib/etl-pair-plan.ts';
import type { PairRequest, TemplateLayer } from '../src/lib/etl-pair-plan.ts';
import type { EtlPair } from '../src/lib/etl-pairs.ts';

const REQUEST: PairRequest = { connectionId: 1, missionGuid: 'guid-new', missionName: '2026-11-01_search_new', map: 'https://caltopo.com/m/NEW123' };

const TEMPLATE: TemplateLayer = {
    id: 4,
    task: 'etl-caltopo-v5.18.0',
    memory: 512,
    timeout: 60,
    permissions: ['feature:*'],
    environment: {
        Source: {
            Mode: 'Sync',
            CredentialId: 'ID',
            CredentialSecret: 'SECRET',
            MissionToken: 'etl.token',
            Pairs: [{ MapId: 'APJ7U0R', MissionGuid: 'guid-old' }],
            DryRun: false,
            AppTracks: { MaxAge: 600, GroupName: 'Orange' },
        },
        DEBUG: false,
    },
};

function pair(overrides: Partial<EtlPair> = {}): EtlPair {
    return {
        connectionId: 1, connectionName: 'CCSO', layerId: 4, layerName: 'CalTopo Sync', enabled: true, version: '5.18.0',
        dataSyncId: 1, mapId: 'APJ7U0R', missionGuid: 'guid-old', dryRun: false, ...overrides,
    };
}

test('caltopoMapId - an id or a map URL, upper-cased', () => {
    assert.equal(caltopoMapId('apj7u0r'), 'APJ7U0R');
    assert.equal(caltopoMapId(' https://caltopo.com/m/APJ7U0R?lat=1 '), 'APJ7U0R');
    assert.equal(caltopoMapId('https://caltopo.com/m/2B627PB/NHJ658CPA7S1H8A1'), '2B627PB');
    assert.equal(caltopoMapId('not a map'), '');
    assert.equal(caltopoMapId(''), '');
});

test('planEtlPair - a new Mission gets a Data Sync with Mission Diff and a dry run Layer copying the template', () => {
    const plan = planEtlPair(REQUEST, [pair()], [], TEMPLATE);
    assert.ok(!('error' in plan));

    assert.equal(plan.mapId, 'NEW123');
    assert.deepEqual(plan.dataSync, {
        create: { name: '2026-11-01_search_new', description: 'CalTopo map NEW123', mission_sync: true, mission_diff: true, mission_role: MISSION_DIFF_ROLE },
    });
    assert.deepEqual(plan.layer, {
        name: 'CalTopo NEW123',
        description: 'CalTopo map NEW123 - 2026-11-01_search_new',
        task: 'etl-caltopo-v5.18.0',
        enabled: true,
        logging: true,
        memory: 512,
        timeout: 60,
        permissions: ['feature:*'],
    });
    assert.deepEqual(plan.incoming, { cron: 'rate(1 minute)' });

    const source = (plan.environment as { Source: Record<string, unknown> }).Source;
    assert.deepEqual(source.Pairs, [{ MapId: 'NEW123', MissionGuid: 'guid-new' }]);
    assert.equal(source.DryRun, true);
    assert.equal(source.CredentialSecret, 'SECRET');
    assert.deepEqual(source.AppTracks, { MaxAge: 600, GroupName: 'Orange' });

    // The template's own settings are untouched
    assert.equal((TEMPLATE.environment as { Source: { DryRun: boolean } }).Source.DryRun, false);
});

test('planEtlPair - the Mission\'s existing Data Sync is reused, by GUID or exact name', () => {
    const byGuid = planEtlPair(REQUEST, [], [{ id: 9, name: 'renamed', mission_guid: 'guid-new' }], TEMPLATE);
    assert.ok(!('error' in byGuid));
    assert.deepEqual(byGuid.dataSync, { reuse: 9 });

    const byName = planEtlPair(REQUEST, [], [{ id: 7, name: '2026-11-01_search_new', mission_guid: null }], TEMPLATE);
    assert.ok(!('error' in byName));
    assert.deepEqual(byName.dataSync, { reuse: 7 });
});

test('planEtlPair - memory is at least 256 MB', () => {
    const plan = planEtlPair(REQUEST, [], [], { ...TEMPLATE, memory: 128 });
    assert.ok(!('error' in plan));
    assert.equal(plan.layer.memory, 256);
});

test('planEtlPair - refuses a second Layer on a Mission or Map, a bad map and a Connection without a template', () => {
    assert.match((planEtlPair({ ...REQUEST, missionGuid: 'guid-old' }, [pair()], [], TEMPLATE) as { error: string }).error, /already paired with CalTopo map APJ7U0R/);
    assert.match((planEtlPair({ ...REQUEST, map: 'APJ7U0R' }, [pair()], [], TEMPLATE) as { error: string }).error, /APJ7U0R is already paired/);
    assert.match((planEtlPair({ ...REQUEST, map: '??' }, [], [], TEMPLATE) as { error: string }).error, /CalTopo map ID/);
    assert.match((planEtlPair({ ...REQUEST, missionGuid: '' }, [], [], TEMPLATE) as { error: string }).error, /Select a TAK Mission/);
    assert.match((planEtlPair(REQUEST, [], [], undefined) as { error: string }).error, /no CalTopo Sync Layer/);
    assert.match((planEtlPair(REQUEST, [], [], { ...TEMPLATE, environment: { Source: { Mode: 'Sync', CredentialId: 'ID', CredentialSecret: 'S' } } }) as { error: string }).error, /no MissionToken/);
});

test('templateCandidates - the Connection\'s pair Layers, newest version first', () => {
    const pairs = [
        pair({ layerId: 1, version: '5.9.2' }),
        pair({ layerId: 2, version: '5.18.0' }),
        pair({ layerId: 2, version: '5.18.0', mapId: 'OTHER' }),
        pair({ layerId: 3, connectionId: 2, version: '6.0.0' }),
    ];
    assert.deepEqual(templateCandidates(pairs, 1).map((p) => p.layerId), [2, 1]);
    assert.deepEqual(templateCandidates(pairs, 5), []);
});

test('goLiveEnvironment - DryRun off, everything else kept', () => {
    const env = goLiveEnvironment({ Source: { Mode: 'Sync', DryRun: true, Pairs: [] }, DEBUG: true });
    assert.deepEqual(env, { environment: { Source: { Mode: 'Sync', DryRun: false, Pairs: [] }, DEBUG: true } });
    assert.deepEqual(goLiveEnvironment({ Source: { Mode: 'Map' } }), { error: 'Not a CalTopo Sync Layer' });
});
