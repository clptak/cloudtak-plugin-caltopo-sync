import test from 'node:test';
import assert from 'node:assert';
import { mapEventBody, eventMapId, caltopoMapUrl, MAP_FLAG, DEFAULT_EVENT_TYPE } from '../src/lib/caltopo-map-event.ts';

const REQUEST = { name: ' 2026-11-01_search_new ', lat: 39.5, lon: -105.2, channels: [3, 7], remarks: ' DR-123 ', mission: { name: '2026-11-01_search_new', guid: 'guid-1' } };

test('mapEventBody - a flagged Event at the call location, shared on the channels, keeping the Mission', () => {
    assert.deepEqual(mapEventBody(REQUEST), {
        name: '2026-11-01_search_new',
        type: DEFAULT_EVENT_TYPE,
        remarks: 'DR-123',
        geometry: { type: 'Point', coordinates: [-105.2, 39.5] },
        channels: [3, 7],
        missions: [{ name: '2026-11-01_search_new', guid: 'guid-1' }],
        metadata: { [MAP_FLAG]: true },
        editable: true,
        links: [],
        style: {},
    });
    assert.equal(MAP_FLAG, 'caltopo_map');

    const bare = mapEventBody({ ...REQUEST, mission: undefined, remarks: undefined, type: 'custom' }) as Record<string, unknown>;
    assert.deepEqual(bare.missions, []);
    assert.equal(bare.remarks, '');
    assert.equal(bare.type, 'custom');
});

test('mapEventBody - refuses a missing name, location or channel', () => {
    assert.match((mapEventBody({ ...REQUEST, name: ' ' }) as { error: string }).error, /DR or Activity/);
    assert.match((mapEventBody({ ...REQUEST, lat: Number.NaN }) as { error: string }).error, /call location/);
    assert.match((mapEventBody({ ...REQUEST, channels: [] }) as { error: string }).error, /channel/);
});

test('eventMapId - the caltopo external ID once the ETL filed it', () => {
    assert.equal(eventMapId({ external_ids: { caltopo: 'C0791J2', CAD: 'E1' } }), 'C0791J2');
    assert.equal(eventMapId({ external_ids: { CAD: 'E1' } }), undefined);
    assert.equal(eventMapId({ external_ids: { caltopo: '' } }), undefined);
    assert.equal(eventMapId({ external_ids: null }), undefined);
    assert.equal(caltopoMapUrl('C0791J2'), 'https://caltopo.com/m/C0791J2');
});
