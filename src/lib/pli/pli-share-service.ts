import { liveQuery } from 'dexie';
import type { Remote } from 'comlink';
import { db } from '../../../../../src/database.ts';
import COT, { OriginMode } from '../../../../../src/base/cot.ts';
import Subscription from '../../../../../src/base/subscription.ts';
import type { Feature } from '../../../../../src/types.ts';
import type Atlas from '../../../../../src/workers/atlas.ts';
import type { Pair, PliSettings } from '../../types.ts';
import { reportPosition, fetchMapKml } from '../../api/caltopo-client.ts';
import { resolveConnectKeyForCallsign } from './connect-key-routing.ts';
import {
    featurePositionKey,
    isPliFeature,
    pliCallsign,
    pliCoordinates,
} from './detect-pli.ts';
import { buildPliFeature } from './build-pli-feature.ts';
import {
    buildPliFromAppTrack,
    parseAppTrackPlacemarks,
    passesAdditionalFilter,
} from './kml-app-tracks.ts';
import { isCallsignConnectedOnMap } from './tak-connected.ts';
import { PLI_DEFAULT_INTERVAL_SEC, PLI_MIN_INTERVAL_SEC } from './constants.ts';

type FeatureListener = {
    unsubscribe: () => void;
};

interface RunningPairState {
    pair: Pair;
    intervalSec: number;
    timerId: ReturnType<typeof setInterval>;
    inFlight: boolean;
}

let featureListener: FeatureListener | null = null;
const lastReported = new Map<string, string>();
const runningPairs = new Map<number, RunningPairState>();
let activeSettings: PliSettings | null = null;
let getWorker: (() => Promise<Remote<Atlas>>) | null = null;

export function configurePliRuntime(opts: {
    getAtlasWorker: () => Promise<Remote<Atlas>> | Remote<Atlas>;
}): void {
    getWorker = async () => await opts.getAtlasWorker();
}

async function loadVisiblePliFeatures(): Promise<Feature[]> {
    const out: Feature[] = [];
    const seen = new Set<string>();

    const connectionFeatures = await db.feature.toArray();
    for (const feat of connectionFeatures) {
        const feature = {
            id: feat.id,
            type: 'Feature',
            path: feat.path,
            properties: feat.properties,
            geometry: feat.geometry,
        } as Feature;
        if (!isPliFeature(feature)) continue;
        if (seen.has(feature.id)) continue;
        seen.add(feature.id);
        out.push(feature);
    }

    const missionFeatures = await db.subscription_feature.toArray();
    for (const row of missionFeatures) {
        const feat = {
            id: row.id,
            type: 'Feature',
            path: row.path,
            properties: row.properties,
            geometry: row.geometry,
        } as Feature;
        if (!isPliFeature(feat)) continue;
        if (seen.has(feat.id)) continue;
        seen.add(feat.id);
        out.push(feat);
    }

    return out;
}

async function forwardFeatureToCaltopo(
    feature: Feature,
    settings: PliSettings,
    pair: Pair,
): Promise<void> {
    const callsign = pliCallsign(feature);
    const coords = pliCoordinates(feature);
    if (!callsign || !coords) return;

    const posKey = featurePositionKey(feature);
    const dedupeKey = `${pair.id}:${callsign}:${posKey}`;
    if (lastReported.get(callsign) === dedupeKey) return;

    const connectKey = resolveConnectKeyForCallsign(
        callsign,
        settings,
        pair.pli_connect_key_id,
    );
    if (!connectKey) return;

    await reportPosition({
        connectKey,
        id: callsign,
        lat: coords.lat,
        lng: coords.lon,
        baseCaltopoUrl: settings.baseCaltopoUrl,
    });
    lastReported.set(callsign, dedupeKey);
}

async function onVisiblePliChanged(settings: PliSettings): Promise<void> {
    if (!runningPairs.size) return;
    const features = await loadVisiblePliFeatures();
    const pairs = [...runningPairs.values()].map((s) => s.pair);
    for (const feature of features) {
        for (const pair of pairs) {
            try {
                await forwardFeatureToCaltopo(feature, settings, pair);
            } catch (err) {
                console.warn('PLI TAK→CalTopo report failed', err);
            }
        }
    }
}

function ensureFeatureListener(settings: PliSettings): void {
    activeSettings = settings;
    if (featureListener) return;

    const subscription = liveQuery(async () => {
        await db.feature.toArray();
        await db.subscription_feature.toArray();
        return Date.now();
    }).subscribe(() => {
        if (!activeSettings) return;
        void onVisiblePliChanged(activeSettings);
    });

    featureListener = {
        unsubscribe: () => subscription.unsubscribe(),
    };

    void onVisiblePliChanged(settings);
}

function teardownFeatureListenerIfIdle(): void {
    if (runningPairs.size > 0) return;
    featureListener?.unsubscribe();
    featureListener = null;
    activeSettings = null;
    lastReported.clear();
}

async function tickCaltopoToTak(pair: Pair, settings: PliSettings): Promise<void> {
    const state = runningPairs.get(pair.id);
    if (!state || state.inFlight) return;
    state.inFlight = true;
    try {
        const kml = await fetchMapKml({
            mapId: pair.caltopo_map_id,
            baseCaltopoUrl: settings.baseCaltopoUrl,
        });
        const tracks = parseAppTrackPlacemarks(kml);
        if (!getWorker) throw new Error('Atlas worker not configured');

        const sub = await Subscription.load(pair.tak_mission_id, {
            token: localStorage.token ?? '',
        });
        if (!sub) throw new Error(`Mission ${pair.tak_mission_id} is not loaded`);

        const atlas = await getWorker();

        for (const track of tracks) {
            if (!passesAdditionalFilter(track.name, settings)) continue;
            if (await isCallsignConnectedOnMap(track.name)) continue;

            const payload = buildPliFromAppTrack(track, settings);
            const feat = buildPliFeature(payload, pair.tak_mission_id);
            await COT.style(feat);
            const cot = await COT.load(feat, {
                mode: OriginMode.MISSION,
                mode_id: pair.tak_mission_id,
            }, { skipSave: true });
            await sub.feature.update(atlas as unknown as Atlas, cot);
        }
    } catch (err) {
        console.warn(`PLI CalTopo→TAK tick failed for pair ${pair.id}`, err);
    } finally {
        if (state) state.inFlight = false;
    }
}

export function isPliSharing(pairId: number): boolean {
    return runningPairs.has(pairId);
}

export function startPliShare(pair: Pair, settings: PliSettings): void {
    if (runningPairs.has(pair.id)) return;

    const intervalSec = Math.max(
        PLI_MIN_INTERVAL_SEC,
        Math.floor(pair.pli_interval_sec ?? PLI_DEFAULT_INTERVAL_SEC) || PLI_DEFAULT_INTERVAL_SEC,
    );

    ensureFeatureListener(settings);

    const timerId = setInterval(() => {
        void tickCaltopoToTak(pair, settings);
    }, intervalSec * 1000);

    runningPairs.set(pair.id, { pair, intervalSec, timerId, inFlight: false });
    void tickCaltopoToTak(pair, settings);
}

export function stopPliShare(pairId: number): void {
    const state = runningPairs.get(pairId);
    if (!state) return;
    clearInterval(state.timerId);
    runningPairs.delete(pairId);
    teardownFeatureListenerIfIdle();
}

export function stopAllPliShare(): void {
    for (const id of [...runningPairs.keys()]) {
        stopPliShare(id);
    }
}

export function updatePliShareSettings(settings: PliSettings): void {
    activeSettings = settings;
}
