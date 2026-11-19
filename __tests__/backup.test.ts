import {
    BACKUP_VERSION,
    BackupError,
    backupFileName,
    buildBackup,
    liftCount,
    parseBackup,
    parseImportPath,
    planImport,
    wrapIncomingUrl,
} from '../backup';
import { Lift } from '../types';

const lift = (id: string, date: string, title: string): Lift => ({
    id,
    date,
    title,
    movements: [{ name: 'Bench Press', sets: [{ weight: '135', reps: '5' }, { weight: 'bw', reps: '' }] }],
});

const byId = (lifts: Lift[]) => Object.fromEntries(lifts.map(l => [l.id, l]));

const reasonOf = (text: string) => {
    try {
        parseBackup(text);
    } catch (error) {
        return error instanceof BackupError ? error.reason : 'not a BackupError';
    }
    return 'no error';
};

describe('backup file', () => {
    it('round-trips every lift exactly', () => {
        const lifts = [lift('1700000000000', '2024-03-03', 'Push'), lift('1700000000001', '2026-11-18', 'Pull 🔥')];
        expect(parseBackup(buildBackup(byId(lifts)))).toEqual(lifts);
    });

    it('round-trips an empty store', () => {
        expect(parseBackup(buildBackup({}))).toEqual([]);
    });

    it('names the file after the local date', () => {
        expect(backupFileName(new Date(2026, 10, 19, 23, 30))).toBe('Liftbook backup 2026-11-19.liftbook');
    });

    it('leaves broken store entries out of the export', () => {
        const store = { a: lift('a', '2026-01-01', 'A'), junk: null, bad: 'nope' } as any;
        expect(parseBackup(buildBackup(store))).toEqual([store.a]);
    });

    it('rejects anything that is not a backup', () => {
        expect(reasonOf('')).toBe('unreadable');
        expect(reasonOf('not json')).toBe('unreadable');
        expect(reasonOf('null')).toBe('unreadable');
        expect(reasonOf('[]')).toBe('unreadable');
        expect(reasonOf(JSON.stringify({ lifts: [] }))).toBe('unreadable');
        expect(reasonOf(JSON.stringify({ liftbook: 'backup', version: 1 }))).toBe('unreadable');
        expect(reasonOf(JSON.stringify({ liftbook: 'backup', lifts: [] }))).toBe('unreadable');
    });

    it('refuses a backup from a newer format', () => {
        const newer = JSON.stringify({ liftbook: 'backup', version: BACKUP_VERSION + 1, lifts: [] });
        expect(reasonOf(newer)).toBe('newer');
    });

    it('keeps only the fields a lift has, as strings', () => {
        const text = JSON.stringify({
            liftbook: 'backup',
            version: 1,
            lifts: [{
                id: 42,
                date: '2026-01-01',
                title: null,
                extra: 'dropped',
                movements: [
                    { name: 'Squat', sets: [{ weight: 225, reps: 5, rpe: 9 }, 'junk'], note: 'dropped' },
                    'junk',
                    { name: 'No sets' },
                ],
            }],
        });
        expect(parseBackup(text)).toEqual([{
            id: '42',
            date: '2026-01-01',
            title: '',
            movements: [
                { name: 'Squat', sets: [{ weight: '225', reps: '5' }] },
                { name: 'No sets', sets: [] },
            ],
        }]);
    });

    it('drops lifts without an id and repeats of an id', () => {
        const text = JSON.stringify({
            liftbook: 'backup',
            version: 1,
            lifts: [
                { date: '2026-01-01', title: 'No id', movements: [] },
                null,
                { id: 'a', date: '2026-01-01', title: 'First', movements: [] },
                { id: 'a', date: '2026-01-02', title: 'Second', movements: [] },
            ],
        });
        expect(parseBackup(text).map(l => l.title)).toEqual(['First']);
    });
});

describe('planImport', () => {
    const a = lift('a', '2024-03-03', 'A');
    const b = lift('b', '2026-11-18', 'B');
    const c = lift('c', '2025-06-01', 'C');

    it('adds everything to an empty phone', () => {
        const plan = planImport({}, [a, b, c]);
        expect(plan.total).toBe(3);
        expect(plan.toAdd).toEqual([a, b, c]);
        expect(plan.alreadyHere).toBe(0);
        expect(plan.firstDate).toBe('2024-03-03');
        expect(plan.lastDate).toBe('2026-11-18');
    });

    it('skips lifts already on the phone, even if they differ', () => {
        const edited = { ...a, title: 'Edited here' };
        const plan = planImport({ a: edited }, [a, b]);
        expect(plan.toAdd).toEqual([b]);
        expect(plan.alreadyHere).toBe(1);
    });

    it('has nothing to add the second time', () => {
        const plan = planImport(byId([a, b]), [a, b]);
        expect(plan.toAdd).toEqual([]);
        expect(plan.alreadyHere).toBe(2);
    });

    it('ignores unusable dates in the range', () => {
        const plan = planImport({}, [{ ...a, date: '' }, { ...b, date: 'undefined' }]);
        expect(plan.firstDate).toBeNull();
        expect(plan.lastDate).toBeNull();
    });

    it('handles an empty backup', () => {
        expect(planImport(byId([a]), [])).toEqual({
            total: 0, toAdd: [], alreadyHere: 0, firstDate: null, lastDate: null,
        });
    });
});

describe('incoming file links', () => {
    const file = 'file:///private/var/mobile/Containers/Data/Application/X/Documents/Inbox/Liftbook%20backup%202026-11-19.liftbook';

    it('wraps a file URL so it routes, and unwraps to the same URL', () => {
        const wrapped = wrapIncomingUrl(file)!;
        expect(wrapped.startsWith('liftbook://import-backup?file=')).toBe(true);
        // the path React Navigation hands over has the prefix stripped
        expect(parseImportPath(wrapped.replace('liftbook://', ''))).toBe(file);
        expect(parseImportPath('/' + wrapped.replace('liftbook://', ''))).toBe(file);
    });

    it('leaves other links alone', () => {
        expect(wrapIncomingUrl('https://liftbookapp.com/l#v1=abc')).toBe('https://liftbookapp.com/l#v1=abc');
        expect(wrapIncomingUrl('liftbook://charts')).toBe('liftbook://charts');
        expect(wrapIncomingUrl(null)).toBeNull();
    });

    it('only unwraps import links that carry a file URL', () => {
        expect(parseImportPath('charts')).toBeNull();
        expect(parseImportPath('l#v1=abc')).toBeNull();
        expect(parseImportPath('import-backup')).toBeNull();
        expect(parseImportPath('import-backup?file=https%3A%2F%2Fexample.com%2Fx')).toBeNull();
        expect(parseImportPath('import-backup?file=%E0%A4%A')).toBeNull();
    });
});

describe('liftCount', () => {
    it('pluralizes', () => {
        expect(liftCount(0)).toBe('0 lifts');
        expect(liftCount(1)).toBe('1 lift');
        expect(liftCount(214)).toBe('214 lifts');
    });
});
