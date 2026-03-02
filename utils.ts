import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lift } from './types';

export const LOCAL_STORAGE_KEYS = {
    LIFTS: 'user_lifts',
    MOVEMENTS: 'user_movements',
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