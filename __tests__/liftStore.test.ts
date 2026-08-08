import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    LOCAL_STORAGE_KEYS,
    retrieveLifts,
    retrieveLift,
    saveLiftLocally,
    deleteLiftLocally,
    __resetLiftStoreForTests,
} from '../liftStore';
import { Lift } from '../types';

const LIFTS_KEY = LOCAL_STORAGE_KEYS.LIFTS;
const BACKUP_KEY = LOCAL_STORAGE_KEYS.LIFTS_CORRUPT_BACKUP;

const lift = (id: string, date: string, title: string): Lift => ({
    id,
    date,
    title,
    movements: [{ name: 'Bench Press', sets: [{ weight: '135', reps: '5' }] }],
});

const seed = async (blob: unknown) => {
    await AsyncStorage.setItem(
        LIFTS_KEY,
        typeof blob === 'string' ? blob : JSON.stringify(blob)
    );
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
};

const storedLifts = async (): Promise<any> => {
    const raw = await AsyncStorage.getItem(LIFTS_KEY);
    return raw ? JSON.parse(raw) : null;
};

beforeEach(async () => {
    __resetLiftStoreForTests();
    await AsyncStorage.clear();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    (console.error as jest.Mock).mockRestore();
});

describe('loading stored shapes', () => {
    it('loads a modern id-keyed blob as-is', async () => {
        const a = lift('100', '2026-01-01', 'Push Day');
        const b = lift('200', '2026-01-02', 'Pull Day');
        await seed({ '100': a, '200': b });

        const lifts = await retrieveLifts();
        expect(lifts).toEqual({ '100': a, '200': b });
    });

    it('does not write back when nothing needed migrating', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });

        await retrieveLifts();
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('re-keys legacy date-keyed entries by their stored id and persists the normalized blob once', async () => {
        const legacy = lift('123', '2024-01-15', 'Leg Day');
        await seed({ '2024-01-15': legacy });

        const lifts = await retrieveLifts();
        expect(lifts).toEqual({ '123': legacy });

        // The one-time migration writes the normalized form back to storage
        expect(await storedLifts()).toEqual({ '123': legacy });

        // A fresh launch over the migrated blob has nothing left to migrate
        __resetLiftStoreForTests();
        (AsyncStorage.setItem as jest.Mock).mockClear();
        expect(await retrieveLifts()).toEqual({ '123': legacy });
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('handles a mixed blob: modern entries untouched, legacy entries re-keyed', async () => {
        const modern = lift('100', '2026-01-01', 'Push Day');
        const legacy = lift('123', '2024-01-15', 'Leg Day');
        await seed({ '100': modern, '2024-01-15': legacy });

        expect(await retrieveLifts()).toEqual({ '100': modern, '123': legacy });
        expect(await storedLifts()).toEqual({ '100': modern, '123': legacy });
    });

    it('keeps a date-keyed entry with no id under its date key', async () => {
        // Oldest legacy shape: keyed by date, no id field on the lift
        const noId = { date: '2024-01-15', title: 'Old Day', movements: [] };
        await seed({ '2024-01-15': noId });

        const lifts = await retrieveLifts();
        expect(lifts['2024-01-15']).toEqual(noId);
    });

    it('preserves lifts missing a date field without inventing one', async () => {
        const noDate = { id: '123', title: 'Undated', movements: [] };
        await seed({ '123': noDate });

        const lifts = await retrieveLifts();
        expect(lifts['123']).toEqual(noDate);
    });

    it('survives a null entry without dropping the other lifts', async () => {
        const good = lift('100', '2026-01-01', 'Push Day');
        await seed({ '100': good, '2024-01-15': null });

        const lifts = await retrieveLifts();
        expect(lifts['100']).toEqual(good);
    });

    it('returns an empty store when the key is absent', async () => {
        expect(await retrieveLifts()).toEqual({});
    });
});

describe('load-once semantics', () => {
    it('reads and parses the blob only once across many operations', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });

        await retrieveLifts();
        await retrieveLift('100');
        await retrieveLifts();
        await saveLiftLocally(lift('200', '2026-01-02', 'Pull Day'));
        await retrieveLifts();

        const liftsReads = (AsyncStorage.getItem as jest.Mock).mock.calls.filter(
            ([key]) => key === LIFTS_KEY
        );
        expect(liftsReads).toHaveLength(1);
    });

    it('concurrent first reads share a single load', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });

        await Promise.all([retrieveLifts(), retrieveLift('100'), retrieveLifts()]);

        const liftsReads = (AsyncStorage.getItem as jest.Mock).mock.calls.filter(
            ([key]) => key === LIFTS_KEY
        );
        expect(liftsReads).toHaveLength(1);
    });
});

describe('retrieveLift', () => {
    it('finds a lift by id', async () => {
        const a = lift('100', '2026-01-01', 'Push Day');
        await seed({ '100': a });
        expect(await retrieveLift('100')).toEqual(a);
    });

    it('falls back to matching lift.date when the id looks like a date', async () => {
        const a = lift('100', '2024-01-15', 'Leg Day');
        await seed({ '100': a });
        expect(await retrieveLift('2024-01-15')).toEqual(a);
    });

    it('returns null when nothing matches', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });
        expect(await retrieveLift('999')).toBeNull();
        expect(await retrieveLift('2020-05-05')).toBeNull();
    });
});

describe('saving and deleting', () => {
    it('save updates memory and writes through to storage', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });

        const newLift = lift('200', '2026-01-02', 'Pull Day');
        await saveLiftLocally(newLift);

        expect(await retrieveLift('200')).toEqual(newLift);
        const stored = await storedLifts();
        expect(stored['200']).toEqual(newLift);
        expect(stored['100']).toBeDefined();
    });

    it('rapid successive saves all land in memory and in the final stored blob', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });

        const saves = [];
        for (let i = 0; i < 10; i++) {
            saves.push(saveLiftLocally(lift(`s${i}`, '2026-01-03', `Lift ${i}`)));
        }
        await Promise.all(saves);

        const lifts = await retrieveLifts();
        const stored = await storedLifts();
        for (let i = 0; i < 10; i++) {
            expect(lifts[`s${i}`]).toBeDefined();
            expect(stored[`s${i}`]).toBeDefined();
        }
        expect(stored['100']).toBeDefined();
    });

    it('delete removes the lift from memory and storage', async () => {
        await seed({
            '100': lift('100', '2026-01-01', 'Push Day'),
            '200': lift('200', '2026-01-02', 'Pull Day'),
        });

        await deleteLiftLocally('100');

        expect(await retrieveLift('100')).toBeNull();
        const stored = await storedLifts();
        expect(stored['100']).toBeUndefined();
        expect(stored['200']).toBeDefined();
    });

    it('deleting an unknown id is a no-op and does not write', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });
        await retrieveLifts();
        (AsyncStorage.setItem as jest.Mock).mockClear();

        await deleteLiftLocally('999');

        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
        expect(await retrieveLift('100')).not.toBeNull();
    });

    it('mutating a retrieved map does not corrupt the store', async () => {
        const a = lift('100', '2026-01-01', 'Push Day');
        await seed({ '100': a });

        const lifts = await retrieveLifts();
        delete lifts['100'];

        expect(await retrieveLift('100')).toEqual(a);
    });
});

describe('corrupt blob recovery', () => {
    it('backs up unparseable JSON, starts empty, and lets new saves persist', async () => {
        await seed('{definitely not json');

        expect(await retrieveLifts()).toEqual({});

        // The corrupt blob is preserved verbatim under the backup key
        expect(await AsyncStorage.getItem(BACKUP_KEY)).toBe('{definitely not json');

        // The store recovers: new data saves and persists normally
        const newLift = lift('300', '2026-01-05', 'Fresh Start');
        await saveLiftLocally(newLift);
        expect((await storedLifts())['300']).toEqual(newLift);
        expect(await AsyncStorage.getItem(BACKUP_KEY)).toBe('{definitely not json');
    });

    it('treats a non-object root (e.g. "null") as corrupt', async () => {
        await seed('null');

        expect(await retrieveLifts()).toEqual({});
        expect(await AsyncStorage.getItem(BACKUP_KEY)).toBe('null');
    });

    it('disables writes if the corrupt blob cannot be backed up', async () => {
        await seed('{broken');
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

        expect(await retrieveLifts()).toEqual({});

        // Save works in memory but must not touch the stored blob —
        // the unrecovered original is still sitting under the lifts key
        await saveLiftLocally(lift('300', '2026-01-05', 'Fresh Start'));
        expect(await AsyncStorage.getItem(LIFTS_KEY)).toBe('{broken');
        expect(await retrieveLift('300')).not.toBeNull();
    });
});

describe('read failure safety', () => {
    it('never overwrites the stored blob after the initial read fails', async () => {
        await seed({ '100': lift('100', '2026-01-01', 'Push Day') });
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('io error'));

        // App still runs, with an empty in-memory session
        expect(await retrieveLifts()).toEqual({});

        // Saves and deletes update memory only; the stored blob is untouched
        await saveLiftLocally(lift('300', '2026-01-05', 'New'));
        await deleteLiftLocally('100');
        expect(await retrieveLift('300')).not.toBeNull();

        const stored = await storedLifts();
        expect(stored['100']).toBeDefined();
        expect(stored['300']).toBeUndefined();
    });

    it('does not crash any public API after a read failure', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('io error'));

        await expect(retrieveLifts()).resolves.toEqual({});
        await expect(retrieveLift('x')).resolves.toBeNull();
        await expect(saveLiftLocally(lift('1', '2026-01-01', 'A'))).resolves.toBeUndefined();
        await expect(deleteLiftLocally('1')).resolves.toBeUndefined();
    });
});
