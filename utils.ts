import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lift } from './types';

export const LOCAL_STORAGE_KEYS = {
    LIFTS: 'user_lifts',
};

// Today's date as YYYY-MM-DD in the local timezone
export const todayISO = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Human-readable date for display, from a YYYY-MM-DD string
export const formatDisplayDate = (dateStr: string): string =>
    new Date(dateStr.split('T')[0] + 'T12:00:00Z').toLocaleDateString();

// Split on spaces, dashes, slashes, colons, and parentheses
export const splitIntoWords = (text: string): string[] =>
    text
        .split(/[\s\-/:()]+/)
        .filter(word => word.length > 0)
        .map(word => word.toLowerCase());

// Each query word must match the start of a distinct target word
export const matchesQuery = (text: string, query: string): boolean => {
    if (!query) return true;
    const targetWords = splitIntoWords(text);
    const queryWords = splitIntoWords(query);
    if (queryWords.length === 0) return true;
    const used = new Array(targetWords.length).fill(false);
    return queryWords.every(qWord => {
        const idx = targetWords.findIndex(
            (tWord, i) => !used[i] && tWord.startsWith(qWord)
        );
        if (idx === -1) return false;
        used[idx] = true;
        return true;
    });
};

interface LocalData {
    lifts: { [id: string]: Lift };
}

// Initialize or get local data store
export const getLocalData = async (): Promise<LocalData> => {
    try {
        const liftsData = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LIFTS);
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

        return { lifts: normalizedLifts };
    } catch (error) {
        console.error('Error getting local data:', error);
        return { lifts: {} };
    }
};

// Save lift data locally
export const saveLiftLocally = async (lift: Lift) => {
    try {
        const localData = await getLocalData();
        // Use the lift's ID as the key instead of date
        localData.lifts[lift.id] = lift;
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
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(localData.lifts));
        }
    } catch (error) {
        console.error('Error deleting lift locally:', error);
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