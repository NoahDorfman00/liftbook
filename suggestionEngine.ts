import { Lift } from './types';
import { DEFAULT_LIFT_TITLES, DEFAULT_MOVEMENTS } from './suggestions';

// Recency key for suggestion ranking: a lift counts as "active" at either its
// logged date or its creation time (numeric id), whichever is later. This is
// deliberately different from the list/chart ordering, which is date-first —
// suggestions care about what the user actually did most recently.
export const liftRecencyKey = (lift: Lift): number => {
    const dateTimestamp = Date.parse(`${lift.date}T00:00:00`);
    const parsedDate = Number.isNaN(dateTimestamp) ? 0 : dateTimestamp;
    const parsedId = Number.isNaN(Number(lift.id)) ? 0 : Number(lift.id);
    return Math.max(parsedDate, parsedId);
};

// Unique lift titles, most recently used first
const orderedLiftTitles = (allLifts: { [id: string]: Lift }): string[] => {
    const validTitles = Object.values(allLifts).filter(item => item?.title?.trim());
    validTitles.sort((a, b) => liftRecencyKey(b) - liftRecencyKey(a));
    const seen = new Set<string>();
    const titles: string[] = [];
    validTitles.forEach(item => {
        const trimmed = item.title.trim();
        const key = trimmed.toLowerCase();
        if (trimmed && !seen.has(key)) {
            seen.add(key);
            titles.push(trimmed);
        }
    });
    return titles;
};

// Titles that historically follow the most recent lift's title: everything
// logged between the previous occurrence of that title and now, i.e. "what
// the user usually does next in their cycle".
const cycleSuggestions = (allLifts: { [id: string]: Lift }, currentLiftId: string): string[] => {
    const sorted = Object.values(allLifts)
        .filter(l => l?.title?.trim())
        .sort((a, b) => liftRecencyKey(a) - liftRecencyKey(b));

    const mostRecentIdx = [...sorted]
        .reverse()
        .findIndex(l => l.id !== currentLiftId);
    if (mostRecentIdx === -1) return [];
    const lastIdx = sorted.length - 1 - mostRecentIdx;

    const lastTitle = sorted[lastIdx].title.trim().toLowerCase();

    // Find the previous occurrence of the same title
    let prevIdx = -1;
    for (let i = lastIdx - 1; i >= 0; i--) {
        if (sorted[i].title.trim().toLowerCase() === lastTitle) {
            prevIdx = i;
            break;
        }
    }

    // Slice between previous occurrence and most recent (exclusive on both ends),
    // or take everything before if the title only appears once
    const sliceStart = prevIdx === -1 ? 0 : prevIdx + 1;
    const between = sorted.slice(sliceStart, lastIdx);

    const seen = new Set<string>();
    const titles: string[] = [];
    between.forEach(l => {
        const trimmed = l.title.trim();
        const key = trimmed.toLowerCase();
        if (key === lastTitle) return;
        if (seen.has(key)) return;
        seen.add(key);
        titles.push(trimmed);
    });

    return titles;
};

// Ordered, deduped title candidates for the entry footer. Priority order:
// cycle-predicted next titles, then all saved titles by recency, then the
// default titles alphabetically.
export const buildTitleCandidates = (
    allLifts: { [id: string]: Lift },
    currentLiftId: string
): string[] => {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const push = (title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(trimmed);
    };

    cycleSuggestions(allLifts, currentLiftId).forEach(push);
    orderedLiftTitles(allLifts).forEach(push);
    [...DEFAULT_LIFT_TITLES].sort((a, b) => a.localeCompare(b)).forEach(push);

    return candidates;
};

// Ordered, deduped movement candidates for the entry footer. Priority order:
// movements from same-titled lifts (recency + position order), movements from
// other lifts, defaults, and finally movements already in the current lift.
export const buildMovementCandidates = (
    allLifts: { [id: string]: Lift },
    currentLift: Lift
): string[] => {
    const normalizedCurrentTitle = currentLift.title.trim().toLowerCase();

    // Movements already in the current lift sort to the back (priority 4)
    const existingNames = new Set<string>();
    currentLift.movements.forEach((movement) => {
        if (movement.name.trim()) {
            existingNames.add(movement.name.trim().toLowerCase());
        }
    });

    const priority1: string[] = []; // From same-titled lifts, recency + position order
    const priority2: string[] = []; // From other lifts
    const priority3: string[] = []; // Defaults
    const priority4: string[] = []; // Already in current lift

    const seen = new Set<string>();
    const push = (name: string, bucket: string[]) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        (existingNames.has(key) ? priority4 : bucket).push(trimmed);
    };

    const nameMatchedLifts: Lift[] = [];
    const otherLifts: Lift[] = [];
    Object.values(allLifts).forEach((liftItem) => {
        if (liftItem.id === currentLift.id) {
            return; // Skip current lift
        }
        const isNameMatched = liftItem.title &&
            liftItem.title.trim().toLowerCase() === normalizedCurrentTitle;
        (isNameMatched ? nameMatchedLifts : otherLifts).push(liftItem);
    });

    // Walk same-titled lifts most-recent-first, movements top-to-bottom
    nameMatchedLifts.sort((a, b) => b.date.localeCompare(a.date));
    nameMatchedLifts.forEach((liftItem) => {
        liftItem.movements.forEach((movement) => push(movement.name, priority1));
    });
    otherLifts.forEach((liftItem) => {
        liftItem.movements.forEach((movement) => push(movement.name, priority2));
    });
    DEFAULT_MOVEMENTS.forEach((name) => push(name, priority3));

    // priority1 keeps recency + position order — do not sort it
    priority2.sort((a, b) => a.localeCompare(b));
    priority3.sort((a, b) => a.localeCompare(b));
    priority4.sort((a, b) => a.localeCompare(b));

    return [...priority1, ...priority2, ...priority3, ...priority4];
};

// "last time: 135x8, 140x6" — the sets of the given movement from the most
// recent lift before the current one that contains it, or null.
export const getLastTimeNote = (
    allLifts: { [id: string]: Lift },
    currentLift: Lift,
    movementName: string
): string | null => {
    const trimmedName = movementName.trim();
    if (!trimmedName) {
        return null;
    }
    const normalizedName = trimmedName.toLowerCase();

    const currentKey = liftRecencyKey(currentLift);
    let previousLift: Lift | null = null;
    let previousKey = -1;

    for (const liftItem of Object.values(allLifts)) {
        if (liftItem.id === currentLift.id) {
            continue;
        }

        const key = liftRecencyKey(liftItem);
        if (key >= currentKey) {
            continue;
        }

        const hasMovement = liftItem.movements.some(
            (movement) => movement.name.trim().toLowerCase() === normalizedName
        );

        if (hasMovement && key > previousKey) {
            previousKey = key;
            previousLift = liftItem;
        }
    }

    if (!previousLift) {
        return null;
    }

    const setParts: string[] = [];
    for (const movement of previousLift.movements) {
        if (movement.name.trim().toLowerCase() !== normalizedName) {
            continue;
        }
        for (const set of movement.sets) {
            const w = parseFloat(set.weight);
            const r = parseFloat(set.reps);
            if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) {
                setParts.push(`${set.weight}x${set.reps}`);
            }
        }
    }

    if (setParts.length === 0) {
        return null;
    }

    return `last time: ${setParts.join(', ')}`;
};
