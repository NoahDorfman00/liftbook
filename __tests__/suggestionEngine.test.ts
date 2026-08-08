import {
    buildTitleCandidates,
    buildMovementCandidates,
    getLastTimeNote,
    liftRecencyKey,
} from '../suggestionEngine';
import { Lift } from '../types';

const lift = (
    id: string,
    date: string,
    title: string,
    movements: { name: string; sets?: { weight: string; reps: string }[] }[] = []
): Lift => ({
    id,
    date,
    title,
    movements: movements.map(m => ({ name: m.name, sets: m.sets ?? [{ weight: '100', reps: '5' }] })),
});

const byId = (...lifts: Lift[]): { [id: string]: Lift } =>
    Object.fromEntries(lifts.map(l => [l.id, l]));

describe('liftRecencyKey', () => {
    it('uses the later of logged date and numeric-id creation time', () => {
        const backdated = lift('1700000000000', '2020-01-01', 'Push Day');
        const dated = lift('not-a-number', '2026-01-01', 'Pull Day');
        expect(liftRecencyKey(backdated)).toBe(1700000000000);
        expect(liftRecencyKey(dated)).toBe(Date.parse('2026-01-01T00:00:00'));
    });
});

describe('buildTitleCandidates', () => {
    it('predicts the cycle: titles between the previous occurrence of the last title come first', () => {
        // Cycle: Push, Pull, Legs, Push — editing a new lift, last was Push;
        // between the two Pushes came Pull then Legs, so predict Pull first.
        const lifts = byId(
            lift('1', '2026-01-01', 'Push Day'),
            lift('2', '2026-01-02', 'Pull Day'),
            lift('3', '2026-01-03', 'Legs Day'),
            lift('4', '2026-01-04', 'Push Day'),
        );
        const candidates = buildTitleCandidates(lifts, 'new-lift-id');
        expect(candidates.slice(0, 3)).toEqual(['Pull Day', 'Legs Day', 'Push Day']);
    });

    it('lists saved titles by recency before defaults, deduped case-insensitively', () => {
        const lifts = byId(
            lift('1', '2026-01-01', 'custom day'),
            lift('2', '2026-01-02', 'Custom Day'),
        );
        const candidates = buildTitleCandidates(lifts, 'new-lift-id');
        expect(candidates[0]).toBe('Custom Day'); // most recent casing wins
        expect(candidates.filter(c => c.toLowerCase() === 'custom day')).toHaveLength(1);
        expect(candidates).toContain('Arm Day'); // defaults follow
    });

    it('anchors cycle prediction on the most recent lift other than the current one', () => {
        const lifts = byId(
            lift('1', '2026-01-01', 'Push Day'),
            lift('2', '2026-01-02', 'Pull Day'),
        );
        // Editing lift 2 itself: the cycle anchor is lift 1 (Push Day), which
        // has no prior occurrence, so nothing precedes it and ordering falls
        // through to plain recency (which includes the current lift's title).
        const candidates = buildTitleCandidates(lifts, '2');
        expect(candidates.slice(0, 2)).toEqual(['Pull Day', 'Push Day']);
    });
});

describe('buildMovementCandidates', () => {
    const current = lift('current', '2026-02-01', 'Push Day', [{ name: 'Bench Press' }]);

    it('prioritizes movements from same-titled lifts in recency + position order', () => {
        const lifts = byId(
            lift('1', '2026-01-01', 'Push Day', [{ name: 'Old Push Move' }]),
            lift('2', '2026-01-15', 'Push Day', [{ name: 'Incline Press' }, { name: 'Fly' }]),
            lift('3', '2026-01-20', 'Pull Day', [{ name: 'Row' }]),
        );
        const candidates = buildMovementCandidates(lifts, current);
        // Same-titled lifts, most recent first, top-to-bottom; then other lifts
        expect(candidates.slice(0, 3)).toEqual(['Incline Press', 'Fly', 'Old Push Move']);
        expect(candidates.indexOf('Row')).toBeGreaterThan(candidates.indexOf('Old Push Move'));
    });

    it('demotes movements already in the current lift to the end', () => {
        const lifts = byId(
            lift('1', '2026-01-15', 'Push Day', [{ name: 'Bench Press' }, { name: 'Fly' }]),
        );
        const candidates = buildMovementCandidates(lifts, current);
        expect(candidates[0]).toBe('Fly');
        expect(candidates.indexOf('Bench Press')).toBeGreaterThan(candidates.indexOf('Adduction'));
    });
});

describe('getLastTimeNote', () => {
    const current = lift('1706000000000', '2026-02-01', 'Push Day', [{ name: 'Bench Press' }]);

    it('reports sets from the nearest previous lift containing the movement', () => {
        const lifts = byId(
            lift('1', '2026-01-01', 'Push Day', [
                { name: 'Bench Press', sets: [{ weight: '95', reps: '10' }] },
            ]),
            lift('2', '2026-01-15', 'Push Day', [
                { name: 'Bench Press', sets: [{ weight: '135', reps: '8' }, { weight: '140', reps: '6' }] },
            ]),
        );
        expect(getLastTimeNote(lifts, current, 'bench press')).toBe('last time: 135x8, 140x6');
    });

    it('ignores lifts newer than the current one and invalid sets', () => {
        const lifts = byId(
            lift('9999999999999', '2026-03-01', 'Push Day', [
                { name: 'Bench Press', sets: [{ weight: '999', reps: '9' }] },
            ]),
            lift('2', '2026-01-15', 'Push Day', [
                { name: 'Bench Press', sets: [{ weight: 'abc', reps: '8' }] },
            ]),
        );
        expect(getLastTimeNote(lifts, current, 'Bench Press')).toBeNull();
    });

    it('returns null for a movement never done before', () => {
        expect(getLastTimeNote({}, current, 'Bench Press')).toBeNull();
    });
});
