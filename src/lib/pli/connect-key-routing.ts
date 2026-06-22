import type { ConnectKeyEntry, PliRegexRule, PliSettings } from '../../types.ts';

function parseRegexPattern(raw: string): RegExp | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^\/(.*)\/([gimuy]*)$/);
    if (match) {
        try {
            return new RegExp(match[1], match[2]);
        } catch {
            return null;
        }
    }
    try {
        return new RegExp(trimmed);
    } catch {
        return null;
    }
}

export function resolveConnectKeyForCallsign(
    callsign: string,
    settings: PliSettings,
    fallbackConnectKeyId?: string | null,
): string | null {
    const byId = new Map(settings.connectKeys.map((k) => [k.id, k.connectKey.trim()]));
    for (const rule of settings.regexRules) {
        const patternRaw = settings.regexLookUp[rule.regexKey];
        if (!patternRaw) continue;
        const regex = parseRegexPattern(patternRaw);
        if (!regex) continue;
        if (regex.test(callsign)) {
            const key = byId.get(rule.connectKeyId);
            if (key) return key;
        }
    }
    if (fallbackConnectKeyId) {
        const key = byId.get(fallbackConnectKeyId);
        if (key) return key;
    }
    for (const entry of settings.connectKeys) {
        const key = entry.connectKey.trim();
        if (key) return key;
    }
    return null;
}

export function connectKeyOptions(settings: PliSettings): ConnectKeyEntry[] {
    return settings.connectKeys.filter((k) => k.connectKey.trim() !== '' || k.label.trim() !== '');
}

export function addConnectKey(settings: PliSettings): PliSettings {
    if (settings.connectKeys.length >= 10) return settings;
    const id = crypto.randomUUID();
    return {
        ...settings,
        connectKeys: [
            ...settings.connectKeys,
            { id, label: `Connect Key ${settings.connectKeys.length + 1}`, connectKey: '' },
        ],
    };
}

export function removeConnectKey(settings: PliSettings, id: string): PliSettings {
    const connectKeys = settings.connectKeys.filter((k) => k.id !== id);
    const regexRules = settings.regexRules.filter((r) => r.connectKeyId !== id);
    return { ...settings, connectKeys, regexRules };
}

export function addRegexRule(settings: PliSettings): PliRegexRule {
    const firstKey = settings.connectKeys[0]?.id ?? '';
    const firstRegex = Object.keys(settings.regexLookUp)[0] ?? 'regexBadge';
    return { regexKey: firstRegex, connectKeyId: firstKey };
}
