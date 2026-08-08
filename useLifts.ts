import { useEffect, useSyncExternalStore } from 'react';
import { Lift } from './types';
import { retrieveLifts, subscribeToLifts, getLiftsSnapshot } from './liftStore';

// Live view of the lift store. Kicks off the one-time load on first use and
// re-renders whenever any screen saves or deletes a lift, so callers never
// need to mirror the store into their own state.
export function useLifts(): { [id: string]: Lift } {
    useEffect(() => {
        retrieveLifts();
    }, []);
    return useSyncExternalStore(subscribeToLifts, getLiftsSnapshot);
}
