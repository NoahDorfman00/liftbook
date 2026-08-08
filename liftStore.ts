import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lift } from './types';

export const LOCAL_STORAGE_KEYS = {
    LIFTS: 'user_lifts',
    // Verbatim copy of an unparseable lifts blob, kept so a corrupt store
    // never silently destroys data (see loadStore below)
    LIFTS_CORRUPT_BACKUP: 'user_lifts_corrupt_backup',
};

type LiftsMap = { [id: string]: Lift };

// The blob is read, parsed, and migrated once per app launch; everything
// after that is served from this in-memory map. Saves mutate the map and
// write the whole blob through to AsyncStorage on a serialized queue.
let cache: LiftsMap | null = null;
let loadPromise: Promise<LiftsMap> | null = null;
// Cleared when we can't trust AsyncStorage anymore (the initial read
// failed, or a corrupt blob couldn't be backed up). The app then runs
// in-memory only for the session rather than risk clobbering stored data.
let persistAllowed = true;
let writeQueue: Promise<void> = Promise.resolve();

// Subscribers (see useLifts) get an immutable snapshot of the cache; it is
// replaced, never mutated, so React can detect changes by reference.
let snapshot: LiftsMap = {};
const listeners = new Set<() => void>();

const notifyListeners = (): void => {
    snapshot = { ...cache };
    listeners.forEach(listener => listener());
};

export const subscribeToLifts = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getLiftsSnapshot = (): LiftsMap => snapshot;

const isDateString = (key: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(key);

// Legacy blobs differ from the current shape in two ways:
// - entries keyed by date (e.g. "2024-01-15") instead of lift id, with the
//   date and/or id fields missing from the lift itself
// - entries saved while lift.id was undefined (keyed by the string
//   "undefined"), also missing their id field
// Fill in the missing fields (the key doubles as the date and the id for
// date-keyed entries) and re-key by id; leave everything else untouched.
// Returns null when no entry needed migrating.
const normalizeLegacyKeys = (parsed: { [key: string]: any }): LiftsMap | null => {
    let changed = false;
    const normalized: LiftsMap = {};
    Object.entries(parsed).forEach(([key, lift]) => {
        if (!lift || typeof lift !== 'object') {
            normalized[key] = lift;
            return;
        }
        if (!lift.date && isDateString(key)) {
            lift = { ...lift, date: key };
            changed = true;
        }
        if (!lift.id) {
            lift = { ...lift, id: key };
            changed = true;
        }
        if (key !== lift.id) {
            changed = true;
        }
        normalized[lift.id] = lift;
    });
    return changed ? normalized : null;
};

// Serialize blob writes so rapid saves can't interleave. The snapshot is
// taken when the write runs, so back-to-back saves may collapse into
// identical writes of the latest state — that's fine (last write wins).
const persist = (): Promise<void> => {
    writeQueue = writeQueue.then(async () => {
        if (!persistAllowed || cache === null) {
            return;
        }
        try {
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(cache));
        } catch (error) {
            console.error('Error persisting lifts:', error);
        }
    });
    return writeQueue;
};

// Recovery behavior, from least to most severe:
// - Absent key: start empty, writes enabled (fresh install).
// - Corrupt/unparseable blob: copy the raw blob to LIFTS_CORRUPT_BACKUP
//   (replacing any older backup), start empty, writes enabled.
// - Backup write failed, or the read itself failed: start empty with
//   writes disabled, so the stored blob survives until the next launch.
const loadStore = (): Promise<LiftsMap> => {
    if (!loadPromise) {
        const load = async (): Promise<LiftsMap> => {
            let raw: string | null;
            try {
                raw = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LIFTS);
            } catch (error) {
                console.error('Error reading lifts from storage:', error);
                persistAllowed = false;
                cache = {};
                return cache;
            }

            if (raw === null) {
                cache = {};
                return cache;
            }

            let parsed: any;
            try {
                parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('lifts blob is not an object');
                }
            } catch (error) {
                console.error('Corrupt lifts blob, backing it up:', error);
                try {
                    await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS_CORRUPT_BACKUP, raw);
                } catch (backupError) {
                    console.error('Backup failed, disabling writes:', backupError);
                    persistAllowed = false;
                }
                cache = {};
                return cache;
            }

            const migrated = normalizeLegacyKeys(parsed);
            cache = migrated ?? parsed;
            if (migrated) {
                await persist();
            }
            return cache!;
        };
        loadPromise = load().then(loaded => {
            notifyListeners();
            return loaded;
        });
    }
    return loadPromise;
};

// Retrieve all lifts (a shallow copy — the caller can't corrupt the store)
export const retrieveLifts = async (): Promise<LiftsMap> => {
    const lifts = await loadStore();
    return { ...lifts };
};

// Retrieve a specific lift
export const retrieveLift = async (liftId: string): Promise<Lift | null> => {
    const lifts = await loadStore();
    if (lifts[liftId]) {
        return lifts[liftId];
    }
    // Legacy fallback: an id that looks like a date may refer to a lift
    // that has since been re-keyed by id — match on its date instead
    if (isDateString(liftId)) {
        const match = Object.values(lifts).find(lift => lift && lift.date === liftId);
        if (match) {
            return match;
        }
    }
    return null;
};

// Save lift data locally
export const saveLiftLocally = async (lift: Lift): Promise<void> => {
    const lifts = await loadStore();
    lifts[lift.id] = lift;
    notifyListeners();
    await persist();
};

// Delete a lift locally by ID
export const deleteLiftLocally = async (liftId: string): Promise<void> => {
    const lifts = await loadStore();
    if (lifts[liftId]) {
        delete lifts[liftId];
        notifyListeners();
        await persist();
    }
};

export const __resetLiftStoreForTests = (): void => {
    cache = null;
    loadPromise = null;
    persistAllowed = true;
    writeQueue = Promise.resolve();
    snapshot = {};
    listeners.clear();
};
