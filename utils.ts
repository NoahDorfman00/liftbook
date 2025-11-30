import { getDatabase, ref, get, set } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lift } from './types';

export const LOCAL_STORAGE_KEYS = {
    LIFTS: 'user_lifts',
    MOVEMENTS: 'user_movements',
    LAST_SYNC: 'last_sync_time',
};

interface LocalData {
    lifts: { [id: string]: Lift };
    movements: { [name: string]: string[] };
    lastModified: number;
}

// Initialize or get local data store
export const getLocalData = async (): Promise<LocalData> => {
    try {
        const liftsData = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LIFTS);
        const movementsData = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.MOVEMENTS);
        const parsedLifts = liftsData ? JSON.parse(liftsData) : {};

        // Convert any old date-based keys to use their stored ID
        const normalizedLifts: { [id: string]: Lift } = {};
        Object.entries(parsedLifts).forEach(([key, lift]: [string, any]) => {
            // If the key is a date (YYYY-MM-DD) and the lift has an id field, use the id
            if (key.match(/^\d{4}-\d{2}-\d{2}$/) && lift.id) {
                normalizedLifts[lift.id] = lift;
            } else {
                normalizedLifts[key] = lift;
            }
        });

        return {
            lifts: normalizedLifts,
            movements: movementsData ? JSON.parse(movementsData) : {},
            lastModified: Date.now(),
        };
    } catch (error) {
        console.error('Error getting local data:', error);
        return { lifts: {}, movements: {}, lastModified: Date.now() };
    }
};

// Save lift data locally
export const saveLiftLocally = async (lift: Lift) => {
    try {
        const localData = await getLocalData();
        // Use the lift's ID as the key instead of date
        localData.lifts[lift.id] = lift;
        localData.lastModified = Date.now();
        await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(localData.lifts));
    } catch (error) {
        console.error('Error saving lift locally:', error);
    }
};

// Delete a lift locally by ID
export const deleteLiftLocally = async (liftId: string) => {
    try {
        const localData = await getLocalData();
        if (localData.lifts[liftId]) {
            delete localData.lifts[liftId];
            localData.lastModified = Date.now();
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(localData.lifts));
        }
    } catch (error) {
        console.error('Error deleting lift locally:', error);
    }
};

// Save movement data locally
export const saveMovementLocally = async (name: string, dates: string[]) => {
    try {
        const localData = await getLocalData();
        localData.movements[name] = dates;
        localData.lastModified = Date.now();
        await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.MOVEMENTS, JSON.stringify(localData.movements));
    } catch (error) {
        console.error('Error saving movement locally:', error);
    }
};

// Sync local data with database for a specific user.
// NOTE: This is future-facing; until you have auth wired up and pass a real userId,
// this function should not be called.
export const syncToDatabase = async (userId: string | null | undefined, force: boolean = false) => {
    if (!userId) {
        return;
    }

    try {
        const lastSync = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC);
        const lastSyncTime = lastSync ? parseInt(lastSync) : 0;
        const currentTime = Date.now();

        // Only sync if it's been more than 5 minutes or force sync is requested
        if (!force && currentTime - lastSyncTime < 5 * 60 * 1000) {
            return;
        }

        const localData = await getLocalData();
        const db = getDatabase();
        const userRef = (path: string) => ref(db, `users/${userId}/${path}`);

        // Sync lifts
        if (Object.keys(localData.lifts).length > 0) {
            await set(userRef('lifts'), localData.lifts);
        }

        // Sync movements
        if (Object.keys(localData.movements).length > 0) {
            await set(userRef('movements'), localData.movements);
        }

        // Update last sync time
        await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, currentTime.toString());
    } catch (error) {
        console.error('Error syncing with database:', error);
    }
};

// Sync database data to local storage for a specific user.
// NOTE: This is future-facing; until you have auth wired up and pass a real userId,
// this function should not be called.
export const syncFromDatabase = async (userId: string | null | undefined) => {
    if (!userId) {
        return;
    }

    try {
        const db = getDatabase();
        const userRef = (path: string) => ref(db, `users/${userId}/${path}`);

        const liftsSnapshot = await get(userRef('lifts'));
        if (liftsSnapshot.exists()) {
            const lifts = liftsSnapshot.val();
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(lifts));
        }

        const movementsSnapshot = await get(userRef('movements'));
        if (movementsSnapshot.exists()) {
            const movements = movementsSnapshot.val();
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
        }
    } catch (error) {
        console.error('Error syncing from database:', error);
    }
};

// Retrieve all lifts
export const retrieveLifts = async (): Promise<{ [id: string]: Lift }> => {
    try {
        const localData = await getLocalData();
        return localData.lifts;
    } catch (error) {
        console.error('Error retrieving lifts:', error);
        return {};
    }
};

// Retrieve a specific lift
export const retrieveLift = async (liftId: string): Promise<Lift | null> => {
    try {
        const localData = await getLocalData();
        // First try to find by ID
        if (localData.lifts[liftId]) {
            return localData.lifts[liftId];
        }

        // If not found and the ID looks like a date, check all lifts for matching date
        if (liftId.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const matchingLift = Object.values(localData.lifts).find(lift => lift.date === liftId);
            if (matchingLift) {
                return matchingLift;
            }
        }

        return null;
    } catch (error) {
        console.error(`Error retrieving lift for id: ${liftId}`, error);
        return null;
    }
};

// Retrieve all movements
export const retrieveMovements = async (): Promise<{ [name: string]: string[] }> => {
    try {
        const localData = await getLocalData();
        return localData.movements;
    } catch (error) {
        console.error('Error retrieving movements:', error);
        return {};
    }
};

// Retrieve a specific movement
export const retrieveMovement = async (name: string): Promise<string[]> => {
    try {
        const localData = await getLocalData();
        return localData.movements[name] || [];
    } catch (error) {
        console.error(`Error retrieving movement: ${name}`, error);
        return [];
    }
}; 