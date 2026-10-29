import {
    BASE_PITCH,
    buildStoryHeader,
    formatShortDate,
    LEFT,
    parseIsoDate,
    pushStoryFooter,
    STORY_WIDTH,
    storyFooterY,
    storyRules,
    StoryDot,
    StoryLayout,
    StoryText,
    StoryVariant,
    textWidth,
    withCommas,
} from './storyLayout';

// Layout for sharing a chart: the same notebook page as the lift card
// (header, rules, footer), with one pencil line instead of movement rows.
// Weight mode plots each session's top set, volume mode its total — the
// on-screen min/avg lines would only confuse someone who's never used the
// app. The headline is the progress: first session → best.

export type ChartCardMode = 'weight' | 'volume';

export interface ChartCardPoint {
    date: string; // YYYY-MM-DD
    value: number;
}

// The chart entry point shows only when there is a line worth bragging about
export const MIN_CHART_SHARE_POINTS = 3;

export const canShareChart = (points: ChartCardPoint[]): boolean =>
    points.length >= MIN_CHART_SHARE_POINTS;

const HEADLINE_SIZE = 96;
const SUBLINE_SIZE = 44;
const VALUE_LABEL_SIZE = 44;
const LINE_WIDTH = 7;
// with this many sessions or fewer every one gets a dot; past it only the
// first, best and latest do
const MAX_DOTS = 30;

// 225 → "225", 22.5 → "22.5", 12345 → "12,345"
export const formatAmount = (n: number): string =>
    Number.isInteger(Math.round(n * 10) / 10) ? withCommas(n) : (Math.round(n * 10) / 10).toFixed(1);

// "Mar 4 – Oct 26", with years when the span crosses one
export const formatSpan = (first: string, last: string): string => {
    if (first === last) {
        return formatShortDate(first, true);
    }
    const crossesYear = first.slice(0, 4) !== last.slice(0, 4);
    return `${formatShortDate(first, crossesYear)} – ${formatShortDate(last, crossesYear)}`;
};

// Smooth line through the points (horizontal control points, like the
// on-screen chart)
const linePath = (pts: { x: number; y: number }[]): string => {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cx = (prev.x + curr.x) / 2;
        d += ` C ${cx} ${prev.y} ${cx} ${curr.y} ${curr.x} ${curr.y}`;
    }
    return d;
};

export const buildChartCardLayout = (
    movement: string,
    points: ChartCardPoint[],
    mode: ChartCardMode,
    variant: StoryVariant = 'story'
): StoryLayout | null => {
    const sorted = points
        .filter((p) => Number.isFinite(p.value) && parseIsoDate(p.date))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
        return null;
    }
    const texts: StoryText[] = [];
    const title = movement.trim().split(/\s+/).join(' ') || 'Chart';
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const { f, logo } = buildStoryHeader(title, formatSpan(first.date, last.date), variant, texts);
    const pitch = BASE_PITCH;
    const footerY = storyFooterY(f, pitch);

    // headline: where it started → the best it's been
    let bestIndex = 0;
    sorted.forEach((p, i) => {
        if (p.value >= sorted[bestIndex].value) {
            bestIndex = i; // ties go to the latest
        }
    });
    const best = sorted[bestIndex];
    const improved = best.value > first.value;
    const headline = improved
        ? `${formatAmount(first.value)} → ${formatAmount(best.value)} lb`
        : `${formatAmount(best.value)} lb`;
    const what = mode === 'weight' ? 'top set' : 'volume per session';
    const gain = mode === 'weight'
        ? `+${formatAmount(best.value - first.value)} lb`
        : `+${Math.round(((best.value - first.value) / first.value) * 100)}%`;
    texts.push({ text: headline, x: LEFT, baseline: f.firstRule + 2 * pitch, size: HEADLINE_SIZE, color: 'ink', align: 'left' });
    texts.push({
        text: improved ? `${what} · ${gain}` : what,
        x: LEFT,
        baseline: f.firstRule + 3 * pitch,
        size: SUBLINE_SIZE,
        color: 'secondary',
        align: 'left',
    });

    // the plot: top on a rule below the headline, bottom on the rule above
    // the footer (the span in the header dates it). Time-proportional x, so
    // gaps between sessions show.
    const plotTop = f.firstRule + 5 * pitch;
    const plotBottom = footerY - pitch;
    const x0 = LEFT + 20;
    const x1 = STORY_WIDTH - LEFT - 20;
    const t0 = parseIsoDate(first.date)!.getTime();
    const span = parseIsoDate(last.date)!.getTime() - t0;
    const lo = Math.min(...sorted.map((p) => p.value));
    const hi = best.value;
    const toX = (p: ChartCardPoint) =>
        span > 0 ? x0 + ((parseIsoDate(p.date)!.getTime() - t0) / span) * (x1 - x0) : (x0 + x1) / 2;
    // lowest value sits a little above the bottom rule so the shading shows
    const toY = (v: number) =>
        hi > lo ? plotBottom - (plotBottom - plotTop) * (0.12 + 0.88 * ((v - lo) / (hi - lo))) : (plotTop + plotBottom) / 2;
    const pts = sorted.map((p) => ({ x: toX(p), y: toY(p.value) }));

    const paths: StoryLayout['paths'] = [];
    if (pts.length > 1) {
        const line = linePath(pts);
        paths.push({ d: `${line} L ${pts[pts.length - 1].x} ${plotBottom} L ${pts[0].x} ${plotBottom} Z`, fill: 'hatch', strokeWidth: 0, opacity: 0.35 });
        paths.push({ d: line, fill: 'none', strokeWidth: LINE_WIDTH });
    }
    const dots: StoryDot[] = [];
    pts.forEach((pt, i) => {
        if (pts.length <= MAX_DOTS || i === 0 || i === bestIndex || i === pts.length - 1) {
            dots.push({ x: pt.x, y: pt.y, r: i === bestIndex ? 13 : 9 });
        }
    });

    // the best value above its point, kept inside the margins. Only that
    // one: the headline already gives the start, and a label on the first
    // point collides with a line that climbs steeply out of it.
    const bestText = formatAmount(best.value);
    const bestWidth = textWidth(bestText, VALUE_LABEL_SIZE);
    texts.push({
        text: bestText,
        x: Math.min(Math.max(pts[bestIndex].x - bestWidth / 2, LEFT), STORY_WIDTH - LEFT - bestWidth),
        baseline: pts[bestIndex].y - 30,
        size: VALUE_LABEL_SIZE,
        color: 'ink',
        align: 'left',
    });

    pushStoryFooter(`${sorted.length} session${sorted.length === 1 ? '' : 's'}`, footerY, f, texts);

    return { height: f.height, pitch, rules: storyRules(f, pitch), texts, bars: [], paths, dots, logo };
};
