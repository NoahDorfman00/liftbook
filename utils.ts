// YYYY-MM-DD string to a local-timezone Date at midnight
export const isoToDate = (iso: string): Date => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
};

// Date to YYYY-MM-DD in the local timezone
export const dateToISO = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Today's date as YYYY-MM-DD in the local timezone
export const todayISO = (): string => dateToISO(new Date());

// Human-readable date for display, from a YYYY-MM-DD string
export const formatDisplayDate = (dateStr: string): string =>
    new Date(dateStr.split('T')[0] + 'T12:00:00Z').toLocaleDateString();

// Split on spaces, dashes, slashes, colons, and parentheses
export const splitIntoWords = (text: string): string[] =>
    text
        .split(/[\s\-/:()]+/)
        .filter(word => word.length > 0)
        .map(word => word.toLowerCase());

// Newest first: by logged date, then by numeric id (creation time) as the
// tiebreaker. Shared by the lift list and the charts screen so they can't
// drift apart. (Suggestion ranking uses its own key — see suggestionEngine.)
export const compareLiftsByDateDesc = (
    a: { date: string; id: string },
    b: { date: string; id: string }
): number => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    const idA = Number.isNaN(Number(a.id)) ? 0 : Number(a.id);
    const idB = Number.isNaN(Number(b.id)) ? 0 : Number(b.id);
    return idB - idA;
};

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
