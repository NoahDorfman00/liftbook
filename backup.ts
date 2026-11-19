import { NativeModules, Platform } from 'react-native';
import { Lift, Movement, Set as LiftSet } from './types';
import { dateToISO } from './utils';

// Moving lifts between phones: the whole history as one `.liftbook` file
// the user sends themselves (AirDrop, Files, Messages, Mail), and the
// import side that merges such a file into the store. No server — the file
// is the transfer.

// --- file format ------------------------------------------------------------
// JSON: { liftbook: 'backup', version, exportedAt, lifts: Lift[] }. Bump
// BACKUP_VERSION only for a change older apps can't read; they refuse
// newer files rather than import them half-understood.

export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'liftbook';

export type BackupErrorReason = 'unreadable' | 'newer';

export class BackupError extends Error {
    reason: BackupErrorReason;

    constructor(reason: BackupErrorReason) {
        super(`backup ${reason}`);
        this.name = 'BackupError';
        this.reason = reason;
    }
}

type LiftsMap = { [id: string]: Lift };

const isRecord = (value: unknown): value is { [key: string]: unknown } =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown): string =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const cleanSet = (raw: unknown): LiftSet | null =>
    isRecord(raw) ? { weight: asString(raw.weight), reps: asString(raw.reps) } : null;

const cleanMovement = (raw: unknown): Movement | null => {
    if (!isRecord(raw)) {
        return null;
    }
    const sets = Array.isArray(raw.sets) ? raw.sets : [];
    return {
        name: asString(raw.name),
        sets: sets.map(cleanSet).filter((set): set is LiftSet => set !== null),
    };
};

// Down to the fields a Lift has, each the type the app expects — a backup
// is outside input, so nothing from it reaches the store unchecked. A lift
// without an id can't be merged and is dropped.
const cleanLift = (raw: unknown): Lift | null => {
    if (!isRecord(raw)) {
        return null;
    }
    const id = asString(raw.id);
    if (!id) {
        return null;
    }
    const movements = Array.isArray(raw.movements) ? raw.movements : [];
    return {
        id,
        date: asString(raw.date),
        title: asString(raw.title),
        movements: movements.map(cleanMovement).filter((movement): movement is Movement => movement !== null),
    };
};

export const buildBackup = (lifts: LiftsMap, now: Date = new Date()): string =>
    JSON.stringify({
        liftbook: 'backup',
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        lifts: Object.values(lifts)
            .map(cleanLift)
            .filter((lift): lift is Lift => lift !== null),
    });

export const backupFileName = (now: Date = new Date()): string =>
    `Liftbook backup ${dateToISO(now)}.${BACKUP_EXTENSION}`;

// The lifts in a backup file. Throws BackupError: 'newer' for a file from a
// later format than this app knows, 'unreadable' for anything else that
// isn't a Liftbook backup.
export const parseBackup = (text: string): Lift[] => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new BackupError('unreadable');
    }
    if (!isRecord(parsed) || parsed.liftbook !== 'backup' || !Array.isArray(parsed.lifts)) {
        throw new BackupError('unreadable');
    }
    if (typeof parsed.version !== 'number') {
        throw new BackupError('unreadable');
    }
    if (parsed.version > BACKUP_VERSION) {
        throw new BackupError('newer');
    }
    // the same id twice in one file: first one wins
    const seen = new Set<string>();
    return parsed.lifts
        .map(cleanLift)
        .filter((lift): lift is Lift => {
            if (!lift || seen.has(lift.id)) {
                return false;
            }
            seen.add(lift.id);
            return true;
        });
};

// --- merge ------------------------------------------------------------------
// Import only ever adds. A lift whose id is already on this phone is left
// exactly as it is — lifts carry no "last edited" time, so there's no safe
// way to tell which copy is newer — which also makes importing the same
// file twice a no-op.

export interface ImportPlan {
    total: number;          // lifts in the file
    toAdd: Lift[];          // the ones not on this phone yet
    alreadyHere: number;    // skipped: id already on this phone
    firstDate: string | null; // earliest and latest logged dates in the file
    lastDate: string | null;
}

export const planImport = (existing: LiftsMap, incoming: Lift[]): ImportPlan => {
    const toAdd = incoming.filter(lift => !existing[lift.id]);
    const dates = incoming
        .map(lift => lift.date)
        .filter(date => /^\d{4}-\d{2}-\d{2}/.test(date))
        .sort();
    return {
        total: incoming.length,
        toAdd,
        alreadyHere: incoming.length - toAdd.length,
        firstDate: dates.length > 0 ? dates[0] : null,
        lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
    };
};

export const liftCount = (count: number): string => `${count} ${count === 1 ? 'lift' : 'lifts'}`;

// --- incoming files ---------------------------------------------------------
// A backup opened from outside (AirDrop, "Open in Liftbook") reaches the app
// as a file:// URL through Linking. React Navigation only routes URLs under
// its prefixes, so the file URL is wrapped in a liftbook:// link that
// App.tsx's getStateFromPath turns into the import screen.

const IMPORT_PATH = 'import-backup';

export const isBackupFileUrl = (url: string | null | undefined): url is string =>
    !!url && url.startsWith('file://');

export const wrapIncomingUrl = (url: string | null): string | null =>
    isBackupFileUrl(url) ? `liftbook://${IMPORT_PATH}?file=${encodeURIComponent(url)}` : url;

// The file URL from a wrapped link's path (as React Navigation hands it to
// getStateFromPath, prefix already stripped), or null for any other path
export const parseImportPath = (path: string): string | null => {
    const match = /^\/?import-backup\?file=([^&#]+)/.exec(path);
    if (!match) {
        return null;
    }
    try {
        const file = decodeURIComponent(match[1]);
        return isBackupFileUrl(file) ? file : null;
    } catch {
        return null;
    }
};

// --- native side ------------------------------------------------------------
// ios/liftbook/LiftbookShare.m (LiftbookBackup). iOS only, like the app.

interface NativeBackup {
    // Writes `contents` to a temp file called `fileName` and opens the share
    // sheet with it. Resolves with whether the user went through with it.
    exportFile(fileName: string, contents: string): Promise<boolean>;
    // Opens the Files picker. Resolves with a file URL (a copy the app can
    // read), or null if the user backed out.
    pickFile(): Promise<string | null>;
    // Reads a picked or opened file, then deletes the app's copy of it.
    readFile(url: string): Promise<string>;
    // A backup file the app was handed that hasn't been seen yet (the one it
    // was launched with). Resolves with its URL once, then null.
    takeIncomingFile(): Promise<string | null>;
}

const nativeBackup: NativeBackup | undefined =
    Platform.OS === 'ios' ? NativeModules.LiftbookBackup : undefined;

export const backupSupported = (): boolean => !!nativeBackup;

export const exportBackupFile = (lifts: LiftsMap): Promise<boolean> => {
    if (!nativeBackup) {
        return Promise.reject(new Error('backup not supported'));
    }
    return nativeBackup.exportFile(backupFileName(), buildBackup(lifts));
};

export const pickBackupFile = (): Promise<string | null> => {
    if (!nativeBackup) {
        return Promise.reject(new Error('backup not supported'));
    }
    return nativeBackup.pickFile();
};

// Never rejects: a missed file is no reason to hold up launch
export const takeIncomingBackupFile = (): Promise<string | null> => {
    if (!nativeBackup || !nativeBackup.takeIncomingFile) {
        return Promise.resolve(null);
    }
    return nativeBackup.takeIncomingFile().then(
        (url) => url ?? null,
        () => null,
    );
};

export const readBackupFile = (url: string): Promise<string> => {
    if (!nativeBackup) {
        return Promise.reject(new Error('backup not supported'));
    }
    return nativeBackup.readFile(url);
};
