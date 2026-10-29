import {
    buildChartCardLayout,
    canShareChart,
    ChartCardPoint,
    formatAmount,
    formatPercent,
    formatSpan,
} from '../chartCardLayout';
import { MESSAGE_HEIGHT, STORY_HEIGHT, STORY_WIDTH, StoryLayout, StoryText } from '../storyLayout';

const points = (...pairs: Array<[string, number]>): ChartCardPoint[] =>
    pairs.map(([date, value]) => ({ date, value }));

const bench = points(
    ['2026-03-04', 135],
    ['2026-04-10', 155],
    ['2026-06-01', 185],
    ['2026-08-15', 225],
    ['2026-10-26', 215],
);

const texts = (layout: StoryLayout | null): string[] => layout!.texts.map((t) => t.text);
const find = (layout: StoryLayout | null, text: string): StoryText =>
    layout!.texts.find((t) => t.text === text)!;

describe('canShareChart', () => {
    it('needs a few sessions to draw a line worth sharing', () => {
        expect(canShareChart(bench.slice(0, 2))).toBe(false);
        expect(canShareChart(bench.slice(0, 3))).toBe(true);
    });
});

describe('formatAmount', () => {
    it('keeps halves, drops float noise, groups thousands', () => {
        expect(formatAmount(225)).toBe('225');
        expect(formatAmount(22.5)).toBe('22.5');
        expect(formatAmount(185.00000001)).toBe('185');
        expect(formatAmount(12345)).toBe('12,345');
    });
});

describe('formatPercent', () => {
    it('drops the decimal once it is noise', () => {
        expect(formatPercent(66.67)).toBe('67%');
        expect(formatPercent(2.46)).toBe('2.5%');
        expect(formatPercent(5)).toBe('5%');
    });
});

describe('formatSpan', () => {
    it('shows years only when the span crosses one', () => {
        expect(formatSpan('2026-03-04', '2026-10-26')).toBe('Mar 4 – Oct 26');
        expect(formatSpan('2025-11-02', '2026-10-26')).toBe('Nov 2, 2025 – Oct 26, 2026');
        expect(formatSpan('2026-10-26', '2026-10-26')).toBe('Oct 26, 2026');
    });
});

describe('buildChartCardLayout', () => {
    it('heads the card with the movement, the span and first → best', () => {
        const layout = buildChartCardLayout('Bench Press', bench, 'weight');
        expect(texts(layout)).toEqual(expect.arrayContaining([
            'Bench Press',
            'Mar 4 – Oct 26',
            '135 → 225',
            'top set · +67%',
            '5 sessions',
            'liftbookapp.com',
        ]));
    });

    it('reports volume progress as a percentage', () => {
        const layout = buildChartCardLayout('Squat', points(['2026-01-01', 4000], ['2026-02-01', 5000], ['2026-03-01', 6000]), 'volume');
        expect(texts(layout)).toEqual(expect.arrayContaining(['4,000 → 6,000', 'volume per session · +50%']));
    });

    it('drops the arrow when the first session is still the best', () => {
        const layout = buildChartCardLayout('Row', points(['2026-01-01', 200], ['2026-02-01', 180], ['2026-03-01', 190]), 'weight');
        expect(texts(layout)).toContain('200');
        expect(texts(layout)).toContain('top set');
        expect(texts(layout).some((t) => t.includes('→'))).toBe(false);
    });

    it('places sessions by date and peaks the best one at the top', () => {
        const layout = buildChartCardLayout('Bench Press', bench, 'weight')!;
        const dots = layout.dots!;
        expect(dots).toHaveLength(5);
        // x follows time: the big Jun → Aug gap is wider than Mar → Apr
        expect(dots[3].x - dots[2].x).toBeGreaterThan(dots[1].x - dots[0].x);
        // the best session is highest and gets the bigger dot
        expect(Math.min(...dots.map((d) => d.y))).toBe(dots[3].y);
        expect(dots[3].r).toBeGreaterThan(dots[0].r);
        // a shaded area and the line on top of it
        expect(layout.paths!.map((p) => p.fill)).toEqual(['hatch', 'none']);
    });

    it('keeps every label and dot on the canvas', () => {
        for (const variant of ['story', 'message'] as const) {
            const layout = buildChartCardLayout('Bench Press', bench, 'weight', variant)!;
            expect(layout.height).toBe(variant === 'story' ? STORY_HEIGHT : MESSAGE_HEIGHT);
            for (const dot of layout.dots!) {
                expect(dot.x).toBeGreaterThan(0);
                expect(dot.x).toBeLessThan(STORY_WIDTH);
                expect(dot.y).toBeLessThan(layout.height);
            }
            const best = find(layout, '225');
            expect(best.x).toBeGreaterThanOrEqual(90);
        }
    });

    it('labels only the best value on the plot', () => {
        const layout = buildChartCardLayout('Bench Press', bench, 'weight');
        expect(texts(layout)).toContain('225');
        expect(texts(layout)).not.toContain('135');
    });

    it('dots only the first, best and latest of a long history', () => {
        const many = Array.from({ length: 60 }, (_, i): ChartCardPoint => ({
            date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
            value: 100 + i,
        }));
        expect(buildChartCardLayout('Curl', many, 'weight')!.dots).toHaveLength(2); // best is the latest
    });

    it('never names a unit — people log in lb or kg', () => {
        for (const mode of ['weight', 'volume'] as const) {
            expect(texts(buildChartCardLayout('Bench Press', bench, mode)).some((t) => /\b(lb|lbs|kg)\b/.test(t))).toBe(false);
        }
    });

    it('returns null with nothing to plot', () => {
        expect(buildChartCardLayout('Bench Press', [], 'weight')).toBeNull();
    });
});
