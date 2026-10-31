// A CalTopo map is created by the CloudTAK CalTopo ETL, not the plugin: the plugin creates a
// CloudTAK Event flagged caltopo_map, the ETL Layer subscribed to event:create makes the map in
// the Team account and files its ID under the Event's caltopo external ID. No CalTopo
// credentials are needed in the browser. Only flagged Events get a map - other plugins create
// Events too (etl-caltopo 5.19.0, MapEvents).

/** The Event metadata key that asks the ETL for a CalTopo map */
export const MAP_FLAG = 'caltopo_map';

/** The external ID system the ETL files the map ID under */
export const MAP_SYSTEM = 'caltopo';

/** CloudTAK's default Event symbol (CoreEntityType DEFAULT_SIDC) */
export const DEFAULT_EVENT_TYPE = '10034000001100000000';

export interface MapEventRequest {
    /** Map and Event title - the TAK Mission name, or the DR/Activity number */
    name: string;
    lat: number;
    lon: number;
    /** TAK Server Channel bitpos the Event is shared on - must include the ETL Connection's */
    channels: number[];
    /** DR or Activity number, shown in the map marker's description */
    remarks?: string;
    type?: string;
    /** The Mission the map is for, kept on the Event */
    mission?: { name: string; guid: string };
}

export function mapEventBody(request: MapEventRequest): Record<string, unknown> | { error: string } {
    const name = request.name.trim();
    if (!name) return { error: 'Enter the DR or Activity number, or activate a Data Sync to name the map after it' };
    if (!Number.isFinite(request.lat) || !Number.isFinite(request.lon)) return { error: 'Enter the call location' };
    if (!request.channels.length) return { error: 'Select at least one channel to share the map request on' };

    return {
        name,
        type: request.type || DEFAULT_EVENT_TYPE,
        remarks: (request.remarks ?? '').trim(),
        geometry: { type: 'Point', coordinates: [request.lon, request.lat] },
        channels: request.channels,
        missions: request.mission?.guid ? [request.mission] : [],
        metadata: { [MAP_FLAG]: true },
        editable: true,
        links: [],
        style: {},
    };
}

/** The map ID the ETL filed on an Event, or undefined while it hasn't yet */
export function eventMapId(event: { external_ids?: Record<string, string> | null }): string | undefined {
    const id = event.external_ids?.[MAP_SYSTEM];
    return typeof id === 'string' && id ? id : undefined;
}

export function caltopoMapUrl(mapId: string): string {
    return `https://caltopo.com/m/${mapId}`;
}
