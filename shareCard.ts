import { Lift, Movement, Set } from './types';
import { compareLiftsByDateDesc } from './utils';

// Sharing a lift: the helpers the story image (storyCard.ts) is built from,
// plus the link payload and the import side. Design spec: FUTURE.md
// "Lift share cards".

export const parseWeight = (raw: string): number | null => {
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
};

const parseReps = parseWeight;

// The heaviest set (first set when no weight parses) — the one each
// movement's row labels.
export const topSet = (sets: Set[]): Set => {
    let best = sets[0];
    let bestWeight = parseWeight(best.weight) ?? -Infinity;
    for (const set of sets) {
        const w = parseWeight(set.weight);
        if (w !== null && w > bestWeight) {
            best = set;
            bestWeight = w;
        }
    }
    return best;
};

// A set is an all-time PR when it beats the movement's top weight across
// all strictly older lifts. No history for the movement → no PR (a brand
// new movement shouldn't spray fire).
export const isPr = (
    movementName: string,
    weight: number | null,
    lift: Lift,
    allLifts: Record<string, Lift>
): boolean => {
    if (weight === null) {
        return false;
    }
    const name = movementName.trim().toLowerCase();
    let previousBest: number | null = null;
    for (const other of Object.values(allLifts)) {
        if (!other || other.id === lift.id) {
            continue;
        }
        if (compareLiftsByDateDesc(other, lift) <= 0) {
            continue; // only lifts strictly older than this one
        }
        for (const movement of other.movements) {
            if (movement.name.trim().toLowerCase() !== name) {
                continue;
            }
            for (const set of movement.sets) {
                const w = parseWeight(set.weight);
                if (w !== null && (previousBest === null || w > previousBest)) {
                    previousBest = w;
                }
            }
        }
    }
    return previousBest !== null && weight > previousBest;
};

// Total weight moved across sets whose weight and reps both parse
export const liftVolume = (movements: Movement[]): number => {
    let volume = 0;
    for (const movement of movements) {
        for (const set of movement.sets) {
            const w = parseWeight(set.weight);
            const r = parseReps(set.reps);
            if (w !== null && r !== null) {
                volume += w * r;
            }
        }
    }
    return volume;
};

export const shareableMovements = (lift: Lift): Movement[] =>
    lift.movements.filter((m) => m.sets.length > 0);

// The share entry points show/enable only when there is something to graph
export const canShareLift = (lift: Lift | null | undefined): boolean =>
    !!lift &&
    lift.movements.some((m) => m.sets.some((s) => parseWeight(s.weight) !== null));

// Sent alongside the share image: a caption and the tappable way in. The
// native sheet joins them per destination (LiftbookShare.m): "caption →
// link" in most apps, "caption ↓ link" in Messages (which puts the link in
// its own bubble below), nothing in story composers (they drop text).
export const LIFT_SHARE_CAPTION = 'Try it';
export const CHART_SHARE_CAPTION = 'Track yours on Liftbook';
export const shareMessage = (caption: string, link: string): string => `${caption} → ${link}`;
export const buildShareMessage = (lift: Lift): string => shareMessage(LIFT_SHARE_CAPTION, buildShareUrl(lift));

// A shared chart has no lift to try, so its link goes to the App Store via
// liftbookapp.com/get, which forwards the campaign token (App Store Connect
// → Sources → Campaigns) and gives Messages a compact preview instead of
// the App Store's full-width card
export const CHART_SHARE_URL = 'https://liftbookapp.com/get?ct=chartshare';

// What story composers (Instagram, Snapchat, …) get on the clipboard for
// their link sticker: lift links are too long for Instagram's, and a story
// viewer's next step is installing anyway. Direct to the App Store, no hop.
export const STORY_SHARE_URL = 'https://apps.apple.com/app/apple-store/id6755925820?pt=128332891&ct=storyshare&mt=8';

// --- link payload -----------------------------------------------------------
// The lift travels IN the URL fragment — no server, nothing expires, and
// fragments are never sent to any host (see FUTURE.md).
//
// Format: `v1=` + base64url(compact), where compact joins
// [title, date, ...movements] with \x1e and each movement's
// [name, w1, r1, w2, r2, …] with \x1f. Control chars are stripped from user
// strings first, so the separators can't be forged. Chosen over JSON for
// size: iOS's link detector (NSDataDetector, which Messages uses) stops
// matching URLs at ~630 chars, and JSON overhead put big workouts over the
// cap. The `=` after the version is ALSO load-bearing: the detector
// truncates the match at `#v1.`, `#v1~`, `#v1/`, `#v1:` — and even a bare
// long fragment — but matches `#v1=<payload>` in full. Verified against
// NSDataDetector directly; see FUTURE.md.

export interface SharedLiftPayload {
    title: string;
    date: string;
    movements: Movement[];
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const utf8Bytes = (text: string): number[] => {
    const bytes: number[] = [];
    const encoded = encodeURIComponent(text);
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] === '%') {
            bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(encoded.charCodeAt(i));
        }
    }
    return bytes;
};

const bytesToUtf8 = (bytes: number[]): string =>
    decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));

/* eslint-disable no-bitwise -- base64 is bit packing */
const base64UrlEncode = (text: string): string => {
    const bytes = utf8Bytes(text);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
        out += BASE64_ALPHABET[a >> 2];
        out += BASE64_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
        if (b === undefined) break;
        out += BASE64_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
        if (c === undefined) break;
        out += BASE64_ALPHABET[c & 63];
    }
    return out;
};

const base64UrlDecode = (encoded: string): string => {
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of encoded) {
        const value = BASE64_ALPHABET.indexOf(ch);
        if (value < 0) {
            throw new Error('invalid base64url character');
        }
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return bytesToUtf8(bytes);
};
/* eslint-enable no-bitwise */

const MOVEMENT_SEP = '\x1e';
const FIELD_SEP = '\x1f';

const sanitize = (text: string): string =>
    // eslint-disable-next-line no-control-regex
    text.trim().replace(/[\x00-\x1f]/g, '');

export const encodeSharePayload = (lift: Lift): string => {
    const parts = [sanitize(lift.title), sanitize(lift.date)];
    for (const movement of shareableMovements(lift)) {
        const fields = [sanitize(movement.name)];
        for (const set of movement.sets) {
            fields.push(sanitize(set.weight), sanitize(set.reps));
        }
        parts.push(fields.join(FIELD_SEP));
    }
    return 'v1=' + base64UrlEncode(parts.join(MOVEMENT_SEP));
};

export const decodeSharePayload = (payload: string): SharedLiftPayload => {
    if (!payload.startsWith('v1=')) {
        throw new Error('unsupported share payload version');
    }
    const parts = base64UrlDecode(payload.slice(3)).split(MOVEMENT_SEP);
    if (parts.length < 2) {
        throw new Error('malformed share payload');
    }
    const [title, date, ...movementParts] = parts;
    return {
        title,
        date,
        movements: movementParts.map((part): Movement => {
            const fields = part.split(FIELD_SEP);
            // name plus complete weight/reps pairs
            if (fields[0] === undefined || fields.length % 2 === 0) {
                throw new Error('malformed share payload');
            }
            const sets: Set[] = [];
            for (let i = 1; i < fields.length; i += 2) {
                sets.push({ weight: fields[i], reps: fields[i + 1] });
            }
            return { name: fields[0], sets };
        }),
    };
};

export const buildShareUrl = (lift: Lift): string =>
    `https://liftbookapp.com/l#${encodeSharePayload(lift)}`;

// --- import side ------------------------------------------------------------

// Extract the payload from an incoming share link. React Navigation hands
// getStateFromPath the URL minus the prefix, so this sees "l#v1=…" or
// "/l#v1=…" — but it also accepts a full URL, since the same helper serves
// tests and any future Linking-event handling.
export const parseShareLinkPayload = (pathOrUrl: string): string | null => {
    const hashIndex = pathOrUrl.indexOf('#');
    if (hashIndex < 0) {
        return null;
    }
    const before = pathOrUrl.slice(0, hashIndex).replace(/\/+$/, '');
    if (!(before === 'l' || before.endsWith('/l'))) {
        return null;
    }
    const payload = pathOrUrl.slice(hashIndex + 1);
    return payload.startsWith('v1=') ? payload : null;
};

// The recipient's editable copy: shared title and movement names, empty
// sets — the sharer's numbers never enter the recipient's store (they'd
// poison charts, suggestions, and PR detection; see FUTURE.md).
export const importedLiftFromPayload = (
    shared: SharedLiftPayload,
    id: string,
    date: string
): Lift => ({
    id,
    date,
    title: shared.title.trim() || 'Shared Lift',
    movements: shared.movements
        .filter((m) => m.name.trim().length > 0)
        .map((m) => ({ name: m.name, sets: [] })),
});

// The sharer's numbers for one movement, formatted like the last-time note
// ("shared: 225x5, 245x3") — shown ephemerally during set entry.
export const buildSharedNote = (
    targets: Movement[] | undefined,
    movementName: string
): string | null => {
    if (!targets) {
        return null;
    }
    const name = movementName.trim().toLowerCase();
    if (!name) {
        return null;
    }
    const parts: string[] = [];
    for (const movement of targets) {
        if (movement.name.trim().toLowerCase() !== name) {
            continue;
        }
        for (const set of movement.sets) {
            if (set.weight.trim() && set.reps.trim()) {
                parts.push(`${set.weight.trim()}x${set.reps.trim()}`);
            }
        }
    }
    return parts.length > 0 ? `shared: ${parts.join(', ')}` : null;
};
