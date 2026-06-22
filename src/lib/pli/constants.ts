import type { CallsignLookupEntry, PliRegexRule, PliSettings } from '../../types.ts';

export const MAX_CONNECT_KEYS = 10;
export const MAX_FILTER_TERMS = 20;
export const PLI_MIN_INTERVAL_SEC = 1;
export const PLI_DEFAULT_INTERVAL_SEC = 10;

export const TAK_GROUP_OPTIONS = [
    'White', 'Green', 'Magenta', 'Red', 'Maroon', 'Purple',
    'Dark Green', 'Teal', 'Brown', 'Orange', 'Yellow', 'Blue', 'Dark Blue',
] as const;

export const DEFAULT_REGEX_LOOKUP: Record<string, string> = {
    regexBadge: '/S\\d{2,3}/g',
    regexCCSOSAR: '/-SAR-\\d{3}/',
    regexFLG: '/-CCSO-FLG-/g',
    regexPAT: '/-CCSO-PAT-/g',
    regexSAR: '/-CCSO-SAR-/g',
    regexCI: '/-CCSO-CI-/g',
    regexFL: '/-CCSO-FL-/g',
    regexBR: '/-CCSO-BR-/g',
    regexPAG: '/-CCSO-PAG-/g',
    regexWMS: '/-CCSO-WMS-/g',
    regexDoNotDelete: '/Do_NOT_DELETE/g',
};

const DEFAULT_CALLSIGN_LOOKUP: CallsignLookupEntry[] = [
    {
        groupName: 'Magenta',
        uidPrefix: 'SAR-SUBJECT ',
        uidnumber: '/subject(\\d+)/g',
        role: 'Team Member',
        text: 'subject',
    },
    {
        groupName: 'Yellow',
        uidPrefix: 'AZ-CCSO-SAR-',
        uidnumber: '/sar(\\D+)/g',
        role: 'Team Member',
        text: 'sar',
    },
];

function defaultRegexRules(key1: string, key2: string): PliRegexRule[] {
    const sworn = [
        'regexBadge', 'regexFLG', 'regexPAT', 'regexCI', 'regexFL',
        'regexBR', 'regexPAG', 'regexWMS',
    ];
    return [
        ...sworn.map((regexKey) => ({ regexKey, connectKeyId: key1 })),
        { regexKey: 'regexCCSOSAR', connectKeyId: key2 },
    ];
}

export function emptyPliSettings(): PliSettings {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();
    return {
        connectKeys: [
            { id: key1, label: 'Connect Key 1', connectKey: '' },
            { id: key2, label: 'Connect Key 2', connectKey: '' },
        ],
        regexLookUp: { ...DEFAULT_REGEX_LOOKUP },
        regexRules: defaultRegexRules(key1, key2),
        callsignLookup: [...DEFAULT_CALLSIGN_LOOKUP],
        takGroupName: 'White',
        addFilter: false,
        addFilterList: [],
        baseCaltopoUrl: 'https://caltopo.com',
    };
}
