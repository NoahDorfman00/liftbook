import { Lift, Movement } from './types';
import { isPr, liftVolume, parseWeight, shareableMovements, topSet } from './shareCard';
import metrics from './schoolbellMetrics.json';

// Layout for the share images — the 1080x1920 story and the 1080x1440
// message card (spec: FUTURE.md "Image format"; the story ports the
// reference prototype design/share-cards/story_card.py). Pure geometry in design pixels — StoryCard.tsx draws
// it. Text is measured with Schoolbell's real advance widths
// (schoolbellMetrics.json, from design/share-cards/schoolbell_metrics.swift).

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
// Messages shows images at a fixed bubble width and center-crops anything
// taller than ~4:3 — so the message variant is a 3:4 canvas, fully visible
export const MESSAGE_HEIGHT = 1440;

const LEFT = 90;
const BASE_PITCH = 72;
// wrapped rows: name size up to this × the rule pitch (bigger and a
// descender would touch the cap of the line below), and never above the cap
const WRAP_NAME_MAX = 0.88;
const WRAP_NAME_CAP_PX = 66;
// wrapping (three-rule rows) must make names this much bigger to be chosen
const WRAP_GAIN = 1.1;

// Titles shrink on one line down to TITLE_SHRINK × the frame's title size;
// longer ones go to two lines (up to that same size, down to TITLE_MIN_2)
// and the date and rules move down to make room
const TITLE_SHRINK = 0.75;
const TITLE_MIN_2 = 0.55;
const TITLE_LEADING = 1.05;
// clear space between the title and the logo lockup
const TITLE_LOGO_GAP = 80;

// barbell cut from the bootsplash logo (assets/barbell.png)
const LOGO_ASPECT = 805 / 384;

// Where things sit on each canvas. Rows always live between `firstRule` and
// `rowsEnd`; the story keeps everything inside Instagram's safe zone (top
// covered by the progress bar/profile row, bottom by the reply bar), the
// message card has no overlays and uses the space for bigger rows.
interface Frame {
    height: number;
    titleBaseline: number;
    titleSize: number;
    capTop: number;          // title cap top; the logo's top aligns to it
    logoHeight: number;
    wordmarkSize: number;
    dateSize: number;
    firstRule: number;       // the date is written on it
    rowsEnd: number;
    maxPitch: number;        // how far short workouts scale up
    summarySize: number;
    urlSize: number;
}

const FRAMES: Record<StoryVariant, Frame> = {
    story: {
        height: STORY_HEIGHT,
        titleBaseline: 268,
        titleSize: 120,
        capTop: 176, // measured cap top of the title
        logoHeight: 78,
        wordmarkSize: 44,
        dateSize: 46,
        firstRule: 366,
        rowsEnd: 1652,
        maxPitch: 100,
        summarySize: 54,
        urlSize: 40,
    },
    message: {
        height: MESSAGE_HEIGHT,
        titleBaseline: 182,
        titleSize: 110,
        capTop: 98,
        logoHeight: 72,
        wordmarkSize: 40,
        dateSize: 44,
        firstRule: 274,
        rowsEnd: 1290,
        maxPitch: 104,
        summarySize: 50,
        urlSize: 38,
    },
};

const WIDTHS: Record<string, number> = metrics.widths;
export const ASCENT: number = metrics.ascent;
const CAP_HEIGHT: number = metrics.capHeight;

export type InkRole = 'ink' | 'secondary';
export type StoryVariant = 'story' | 'message';

export interface StoryText {
    text: string;
    x: number;
    baseline: number;
    size: number;
    color: InkRole;
    align: 'left' | 'right' | 'center';
}

export interface StoryBar {
    x: number;
    bottom: number;
    width: number;
    height: number;
    radius: number;
    strokeWidth: number;
}

export interface StoryLayout {
    height: number;
    pitch: number;
    rules: number[];
    texts: StoryText[];
    bars: StoryBar[];
    logo: { x: number; y: number; width: number; height: number };
}

export const textWidth = (text: string, size: number): number => {
    let total = 0;
    for (const ch of text) {
        const w = WIDTHS[ch] ?? (ch.codePointAt(0)! > 0x2000 ? 1 : WIDTHS.n);
        total += w * size;
    }
    return total;
};

// Shrink toward minSize, then truncate the name (never the suffix) with …
const fit = (
    name: string,
    suffix: string,
    size: number,
    maxWidth: number,
    minSize: number
): { text: string; size: number } => {
    let fs = size;
    while (fs > minSize && textWidth(name + suffix, fs) > maxWidth) {
        fs -= 1;
    }
    if (textWidth(name + suffix, fs) <= maxWidth) {
        return { text: name + suffix, size: fs };
    }
    let cut = name;
    while (cut.length > 1 && textWidth(cut + '…' + suffix, fs) > maxWidth) {
        cut = Array.from(cut).slice(0, -1).join('').trimEnd();
    }
    return { text: cut + '…' + suffix, size: fs };
};

// The card's shared name size: the largest that fits every name on one line,
// down to `min`. Names that won't fit even at `min` are going to wrap anyway,
// so they don't drag everyone else down.
const sharedNameSize = (
    names: string[],
    suffixes: string[],
    max: number,
    width: number,
    min: number
): number => {
    const sizes = names.map((name, i) => {
        const fitted = fit(name, suffixes[i], max, width, min);
        return fitted.text.endsWith('…') || fitted.text.includes('…') ? max : fitted.size;
    });
    return Math.min(max, ...sizes);
};

// A movement name as one or two lines at a fixed size. Fits on one line →
// as is. Otherwise break at the word boundary that best balances the two
// lines (the PR suffix stays on the last line). Only a name that can't fit
// in two lines — or a single unbreakable word — gets an ellipsis.
export const wrapName = (
    name: string,
    suffix: string,
    size: number,
    maxWidth: number
): string[] => {
    if (textWidth(name + suffix, size) <= maxWidth) {
        return [name + suffix];
    }
    const words = name.split(/\s+/);
    let best: string[] | null = null;
    let bestWidth = Infinity;
    for (let k = 1; k < words.length; k++) {
        const first = words.slice(0, k).join(' ');
        const second = words.slice(k).join(' ') + suffix;
        const widest = Math.max(textWidth(first, size), textWidth(second, size));
        if (widest <= maxWidth && widest < bestWidth) {
            best = [first, second];
            bestWidth = widest;
        }
    }
    if (best) {
        return best;
    }
    // too long even for two lines: fill the first line, truncate the second
    let k = 0;
    while (k + 1 < words.length && textWidth(words.slice(0, k + 1).join(' '), size) <= maxWidth) {
        k += 1;
    }
    if (k === 0) {
        return [fit(name, suffix, size, maxWidth, size).text];
    }
    const rest = fit(words.slice(k).join(' '), suffix, size, maxWidth, size).text;
    return [words.slice(0, k).join(' '), rest];
};

// Bar heights as a fraction of the movement's heaviest set. Any
// unparseable weight (bw, etc.) means the shape is unknowable: full bars.
export const barHeights = (movement: Movement): number[] => {
    const weights = movement.sets.map((s) => parseWeight(s.weight));
    if (weights.some((w) => w === null)) {
        return movement.sets.map(() => 1);
    }
    const hi = Math.max(...(weights as number[]));
    return (weights as number[]).map((w) => Math.max(0.12, w / hi));
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-26" → "Monday, Oct 26" (local calendar date, no UTC shift)
export const formatStoryDate = (iso: string): string => {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        return iso;
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
};

const withCommas = (n: number): string =>
    String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const buildStoryLayout = (
    lift: Lift,
    allLifts: Record<string, Lift>,
    variant: StoryVariant = 'story'
): StoryLayout | null => {
    const movements = shareableMovements(lift);
    if (movements.length === 0) {
        return null;
    }
    const frame = FRAMES[variant];
    const texts: StoryText[] = [];
    const bars: StoryBar[] = [];

    // header: title top left, brand lockup top right (top = title cap top)
    const logoWidth = frame.logoHeight * LOGO_ASPECT;
    const logo = {
        x: STORY_WIDTH - LEFT - logoWidth,
        y: frame.capTop,
        width: logoWidth,
        height: frame.logoHeight,
    };
    const titleText = lift.title.trim().split(/\s+/).join(' ') || 'Lift';
    const titleWidth = logo.x - TITLE_LOGO_GAP - LEFT;
    const oneLineTitle = fit(titleText, '', frame.titleSize, titleWidth, frame.titleSize * TITLE_SHRINK);
    let titleLines = [oneLineTitle.text];
    let titleSize = oneLineTitle.size;
    let titleBaseline = frame.titleBaseline;
    if (oneLineTitle.text !== titleText) {
        // two balanced lines, as big as fits without cutting anything off;
        // the first line's cap top stays level with the logo
        titleSize = frame.titleSize * TITLE_SHRINK;
        titleLines = wrapName(titleText, '', titleSize, titleWidth);
        while (titleSize > frame.titleSize * TITLE_MIN_2 && titleLines.join(' ') !== titleText) {
            titleSize -= 1;
            titleLines = wrapName(titleText, '', titleSize, titleWidth);
        }
        titleBaseline = frame.capTop + CAP_HEIGHT * titleSize + (titleLines.length - 1) * TITLE_LEADING * titleSize;
    }
    titleLines.forEach((line, i) => {
        texts.push({
            text: line,
            x: LEFT,
            baseline: titleBaseline - (titleLines.length - 1 - i) * TITLE_LEADING * titleSize,
            size: titleSize,
            color: 'ink',
            align: 'left',
        });
    });
    // the date (and the rules under it) keep their distance from the title's
    // last line
    const f = { ...frame, firstRule: frame.firstRule + Math.max(0, titleBaseline - frame.titleBaseline) };
    texts.push({
        text: 'liftbook',
        x: logo.x + logoWidth / 2,
        baseline: f.capTop + f.logoHeight + f.wordmarkSize * 0.95,
        size: f.wordmarkSize,
        color: 'ink',
        align: 'center',
    });
    texts.push({ text: formatStoryDate(lift.date), x: LEFT, baseline: f.firstRule, size: f.dateSize, color: 'secondary', align: 'left' });

    const tops = movements.map((m) => topSet(m.sets));
    const stats = tops.map((set) => `${set.weight.trim()}×${set.reps.trim()}`);
    const suffixes = movements.map((m, i) =>
        isPr(m.name, parseWeight(tops[i].weight), lift, allLifts) ? ' 🔥' : '');
    const names = movements.map((m) => m.name.trim());
    const n = movements.length;
    const maxSets = Math.max(...movements.map((m) => m.sets.length));

    // Column geometry and name lines at a given rule pitch. Each movement
    // takes two ruled lines (name/bars/top set on one, a blank one after);
    // a name too long for one line puts each half on its own rule, and that
    // movement takes one extra rule so the blank line between movements
    // stays. Wrapping depends on the pitch and vice versa, so settle both.
    // Column geometry, the card's shared name size and each name's lines at
    // a given rule pitch. `maxName`/`minName` bound the shared size: the
    // largest that fits every name on one line, down to `minName`; names
    // that won't fit even then wrap. Top-set labels never outsize the
    // names — names lead the row.
    const measure = (pitch: number, maxName: number, minName: number, maxLabel = 44 * (pitch / BASE_PITCH)) => {
        const s = pitch / BASE_PITCH;
        const barWidth = 26 * s;
        const barGap = 12 * s;
        const columns = (labelSize: number) => {
            const labelWidth = Math.max(...stats.map((stat) => textWidth(stat, labelSize)));
            const barsLeft = STORY_WIDTH - LEFT - labelWidth - 44 * s - maxSets * (barWidth + barGap) + barGap;
            return { barsLeft, nameWidth: barsLeft - LEFT - 44 * s };
        };
        let labelSize = maxLabel;
        let { barsLeft, nameWidth } = columns(labelSize);
        const nameSize = sharedNameSize(names, suffixes, maxName, nameWidth, minName);
        if (labelSize > nameSize) {
            labelSize = nameSize;
            ({ barsLeft, nameWidth } = columns(labelSize));
        }
        const lines = names.map((name, i) => wrapName(name, suffixes[i], nameSize, nameWidth));
        return { s, barWidth, barGap, barsLeft, labelSize, nameSize, lines };
    };
    const wraps = (m: ReturnType<typeof measure>) => m.lines.some((l) => l.length > 1);

    // Uniform rhythm: every row is the same height, so the space between
    // movements never alternates. Two candidates, and the card takes the one
    // with bigger names:
    //  - one line: two rules per row (name/bars/top set, then a blank one);
    //    names shrink as far as they must to fit on one line
    //  - wrapped: three rules per row — a long name's halves on the upper
    //    and lower rule, one-line names on the lower — so names stay big
    //    (up to what fits between the rules without descenders colliding)
    // Wrapping wins only when it makes names clearly bigger, so short names
    // keep the compact rows and long ones stop shrinking into hard-to-read
    // lines.
    const region = f.rowsEnd - f.firstRule;
    const oneLinePitch = Math.min(f.maxPitch, region / (2 * n + 2));
    const oneLine = measure(oneLinePitch, 54 * (oneLinePitch / BASE_PITCH), 38 * (oneLinePitch / BASE_PITCH));
    const wrapPitch = Math.min(f.maxPitch, region / (3 * n + 2));
    const wrapMax = Math.min(WRAP_NAME_MAX * wrapPitch, WRAP_NAME_CAP_PX);
    // every row already has room for two lines, so names never shrink here:
    // all at the full wrapped size, and whatever doesn't fit one line wraps.
    // Top sets keep their one-line size (capped by the names, as always)
    // rather than shrinking with the tighter wrapped pitch.
    const wrappedCandidate = measure(wrapPitch, wrapMax, wrapMax, 44 * (oneLinePitch / BASE_PITCH));
    // (a name too long for one line even at the smallest size forces the
    // three-rule rhythm, so spacing stays even)
    const useWrap = wraps(oneLine)
        || (wraps(wrappedCandidate) && wrappedCandidate.nameSize > WRAP_GAIN * oneLine.nameSize);
    const rowRules = useWrap ? 3 : 2;
    const pitch = useWrap ? wrapPitch : oneLinePitch;
    const { s, barWidth, barGap, barsLeft, labelSize, nameSize, lines } = useWrap ? wrappedCandidate : oneLine;
    const wrapped = lines.some((l) => l.length > 1);

    // center the rows (first row's top .. last baseline) between the date and
    // the footer, snapped so every baseline stays on a rule
    const footerY = f.firstRule + Math.floor((f.rowsEnd + 68 - f.firstRule) / pitch) * pitch;
    const rowTop = wrapped ? 1.6 : 1.45; // first name line or tallest bar
    const block = rowTop * pitch + rowRules * (n - 1) * pitch;
    const target = f.firstRule + (footerY - 50 - f.firstRule - block) / 2 + rowTop * pitch;
    let k = Math.max(rowTop > 1.5 ? 3 : 2, Math.round((target - f.firstRule) / pitch));

    movements.forEach((movement, m) => {
        // name lines on consecutive rules; the last shares the row's
        // baseline with the bars and the top set
        const y = f.firstRule + k * pitch;
        lines[m].forEach((line, i) => {
            texts.push({
                text: line,
                x: LEFT,
                baseline: y - (lines[m].length - 1 - i) * pitch,
                size: nameSize,
                color: 'ink',
                align: 'left',
            });
        });
        barHeights(movement).forEach((h, i) => {
            bars.push({
                x: barsLeft + i * (barWidth + barGap),
                bottom: y,
                width: barWidth,
                height: 1.45 * pitch * h,
                radius: 3 * s,
                strokeWidth: 2.6 * s,
            });
        });
        texts.push({ text: stats[m], x: STORY_WIDTH - LEFT, baseline: y, size: labelSize, color: 'ink', align: 'right' });
        k += rowRules;
    });

    const totalSets = movements.reduce((sum, m) => sum + m.sets.length, 0);
    const volume = liftVolume(movements);
    const summary = [`${totalSets} set${totalSets === 1 ? '' : 's'}`];
    if (volume > 0) {
        summary.push(`${withCommas(volume)} lb`);
    }
    texts.push({ text: summary.join(' · '), x: LEFT, baseline: footerY, size: f.summarySize, color: 'ink', align: 'left' });
    texts.push({ text: 'liftbookapp.com', x: STORY_WIDTH - LEFT, baseline: footerY, size: f.urlSize, color: 'secondary', align: 'right' });

    const rules: number[] = [];
    for (let y = f.firstRule; y < f.height; y += pitch) {
        rules.push(y);
    }
    return { height: f.height, pitch, rules, texts, bars, logo };
};
