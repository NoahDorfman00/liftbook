import {
    buildShareMessage,
    buildSharedNote,
    buildShareUrl,
    canShareLift,
    decodeSharePayload,
    encodeSharePayload,
    importedLiftFromPayload,
    isPr,
    liftVolume,
    parseShareLinkPayload,
    topSet,
} from '../shareCard';
import { Lift } from '../types';

const makeLift = (
    id: string,
    date: string,
    title: string,
    movements: Array<[string, Array<[string, string]>]>
): Lift => ({
    id,
    date,
    title,
    movements: movements.map(([name, sets]) => ({
        name,
        sets: sets.map(([weight, reps]) => ({ weight, reps })),
    })),
});

const pullDay = makeLift('100', '2026-08-11', 'Pull Day', [
    ['Deadlift', [['225', '5'], ['275', '3'], ['315', '2'], ['365', '1']]],
    ['Barbell Rows', [['185', '8'], ['185', '8'], ['185', '8'], ['185', '8']]],
    ['Lat Pulldown', [['160', '10'], ['160', '10'], ['140', '12']]],
    ['Curls', [['45', '10'], ['35', '12'], ['25', '15']]],
]);

describe('PR and top-set helpers', () => {
    it('picks the heaviest set, falling back to the first when nothing parses', () => {
        expect(topSet(pullDay.movements[0].sets)).toEqual({ weight: '365', reps: '1' });
        expect(topSet([{ weight: 'bw', reps: '12' }, { weight: 'bw', reps: '10' }]))
            .toEqual({ weight: 'bw', reps: '12' });
    });

    it('fires only when an older lift is beaten', () => {
        const today = makeLift('200', '2026-08-11', 'Push Day', [['Bench', [['225', '5']]]]);
        const older = makeLift('50', '2026-08-01', 'Push Day', [['Bench', [['205', '5']]]]);
        const newer = makeLift('300', '2026-08-20', 'Push Day', [['Bench', [['245', '1']]]]);
        const all = { [today.id]: today, [older.id]: older, [newer.id]: newer };
        // beats 205 from before; the later 245 doesn't count against it
        expect(isPr('Bench', 225, today, all)).toBe(true);
        expect(isPr('bench ', 205, today, all)).toBe(false);
        // a movement's first appearance never fires
        expect(isPr('Bench', 205, older, all)).toBe(false);
        expect(isPr('Bench', null, today, all)).toBe(false);
    });

    it('sums volume over sets whose weight and reps both parse', () => {
        expect(liftVolume(pullDay.movements)).toBe(14990);
        expect(liftVolume([{ name: 'Dips', sets: [{ weight: 'bw', reps: '15' }] }])).toBe(0);
    });

    it('builds the share message around the link', () => {
        expect(buildShareMessage(pullDay)).toMatch(/^Try it → https:\/\/liftbookapp\.com\/l#v1=/);
    });
});

describe('canShareLift', () => {
    it('requires at least one set with a parseable weight', () => {
        expect(canShareLift(null)).toBe(false);
        expect(canShareLift(makeLift('1', '2026-08-11', 'T', []))).toBe(false);
        expect(canShareLift(makeLift('1', '2026-08-11', 'T', [['Bench', []]]))).toBe(false);
        expect(canShareLift(makeLift('1', '2026-08-11', 'T', [['Pull-ups', [['bw', '10']]]]))).toBe(false);
        expect(canShareLift(makeLift('1', '2026-08-11', 'T', [['Bench', [['135', '5']]]]))).toBe(true);
    });
});

describe('share payload', () => {
    it('round-trips a lift through encode/decode', () => {
        const payload = encodeSharePayload(pullDay);
        expect(payload).toMatch(/^v1=[A-Za-z0-9_-]+$/);
        const decoded = decodeSharePayload(payload);
        expect(decoded.title).toBe('Pull Day');
        expect(decoded.date).toBe('2026-08-11');
        expect(decoded.movements).toEqual(pullDay.movements);
    });

    it('round-trips unicode titles and weights', () => {
        const lift = makeLift('800', '2026-08-11', 'Push 💪 día', [
            ['Press français', [['62.5', '8']]],
        ]);
        const decoded = decodeSharePayload(encodeSharePayload(lift));
        expect(decoded.title).toBe('Push 💪 día');
        expect(decoded.movements[0].name).toBe('Press français');
        expect(decoded.movements[0].sets[0]).toEqual({ weight: '62.5', reps: '8' });
    });

    it('drops empty movements from the payload', () => {
        const lift = makeLift('900', '2026-08-11', 'Quick', [
            ['Bench', [['185', '5']]],
            ['Rows', []],
        ]);
        const decoded = decodeSharePayload(encodeSharePayload(lift));
        expect(decoded.movements).toHaveLength(1);
    });

    it('rejects unknown versions and malformed payloads', () => {
        expect(() => decodeSharePayload('v2=abc')).toThrow('unsupported');
        expect(() => decodeSharePayload('v1.abc')).toThrow('unsupported'); // old dot format
        expect(() => decodeSharePayload('garbage')).toThrow('unsupported');
        expect(() => decodeSharePayload('v1=!!!')).toThrow();
        expect(() => decodeSharePayload('v1=' + 'AAAA')).toThrow();
    });

    it('keeps a big realistic workout under the iMessage link-detector cap', () => {
        // NSDataDetector stops matching URLs at ~630 chars; a broken link is
        // worse than no link, so the payload format must stay compact
        const big = makeLift('950', '2026-08-11', 'Full Body Volume Day',
            Array.from({ length: 6 }, (_, i): [string, Array<[string, string]>] => [
                `Movement Number ${i + 1}`,
                Array.from({ length: 5 }, (): [string, string] => ['185', '10']),
            ]));
        expect(buildShareUrl(big).length).toBeLessThanOrEqual(630);
    });

    it('builds the share URL with the payload in the fragment', () => {
        const url = buildShareUrl(pullDay);
        expect(url.startsWith('https://liftbookapp.com/l#v1=')).toBe(true);
        const fragment = url.split('#')[1];
        expect(decodeSharePayload(fragment).title).toBe('Pull Day');
    });
});

describe('import side', () => {
    it('extracts the payload from every link shape the app can receive', () => {
        // React Navigation strips the prefix before calling getStateFromPath
        expect(parseShareLinkPayload('l#v1=abc')).toBe('v1=abc');
        expect(parseShareLinkPayload('/l#v1=abc')).toBe('v1=abc');
        expect(parseShareLinkPayload('l/#v1=abc')).toBe('v1=abc');
        // full URLs work too (custom scheme and universal link)
        expect(parseShareLinkPayload('https://liftbookapp.com/l#v1=abc')).toBe('v1=abc');
        expect(parseShareLinkPayload('liftbook://l#v1=abc')).toBe('v1=abc');
    });

    it('rejects non-share links', () => {
        expect(parseShareLinkPayload('charts')).toBeNull();
        expect(parseShareLinkPayload('l')).toBeNull();
        expect(parseShareLinkPayload('editor#v1=abc')).toBeNull();
        expect(parseShareLinkPayload('l#v2=abc')).toBeNull();
        expect(parseShareLinkPayload('bl#v1=abc')).toBeNull();
    });

    it('builds the imported lift with empty sets and the given id/date', () => {
        const decoded = decodeSharePayload(encodeSharePayload(pullDay));
        const imported = importedLiftFromPayload(decoded, '123', '2026-09-01');
        expect(imported.id).toBe('123');
        expect(imported.date).toBe('2026-09-01');
        expect(imported.title).toBe('Pull Day');
        expect(imported.movements.map((m) => m.name)).toEqual([
            'Deadlift', 'Barbell Rows', 'Lat Pulldown', 'Curls',
        ]);
        for (const movement of imported.movements) {
            expect(movement.sets).toEqual([]);
        }
    });

    it('falls back to a default title and drops nameless movements on import', () => {
        const imported = importedLiftFromPayload(
            { title: '  ', date: '2026-08-11', movements: [
                { name: '', sets: [{ weight: '1', reps: '1' }] },
                { name: 'Bench', sets: [] },
            ] },
            '9', '2026-09-01');
        expect(imported.title).toBe('Shared Lift');
        expect(imported.movements).toHaveLength(1);
    });

    it('formats the shared note like the last-time note, matched by name', () => {
        const targets = decodeSharePayload(encodeSharePayload(pullDay)).movements;
        expect(buildSharedNote(targets, 'deadlift ')).toBe('shared: 225x5, 275x3, 315x2, 365x1');
        expect(buildSharedNote(targets, 'Barbell Rows')).toBe('shared: 185x8, 185x8, 185x8, 185x8');
        expect(buildSharedNote(targets, 'Bench')).toBeNull();
        expect(buildSharedNote(undefined, 'Deadlift')).toBeNull();
        expect(buildSharedNote(targets, '')).toBeNull();
    });
});
