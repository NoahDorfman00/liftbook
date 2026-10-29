import {
    barHeights,
    buildStoryLayout,
    wrapName,
    formatStoryDate,
    MESSAGE_HEIGHT,
    STORY_HEIGHT,
    STORY_WIDTH,
    StoryLayout,
    StoryText,
    textWidth,
} from '../storyLayout';
import { Lift } from '../types';

const makeLift = (
    id: string,
    date: string,
    title: string,
    movements: Array<[string, Array<[string, string]>]>
): Lift => ({
    id,
    date,
    title,
    movements: movements.map(([name, sets]) => ({
        name,
        sets: sets.map(([weight, reps]) => ({ weight, reps })),
    })),
});

const repeat = (set: [string, string], n: number): Array<[string, string]> =>
    Array.from({ length: n }, () => set);

const pullDay = makeLift('100', '2026-10-26', 'Pull Day', [
    ['Deadlift', [['135', '5'], ['225', '5'], ['275', '3'], ['315', '2'], ['365', '1']]],
    ['Barbell Rows', repeat(['185', '8'], 4)],
    ['Lat Pulldown', [['160', '10'], ['160', '10'], ['140', '12']]],
    ['Seated Cable Row', [['140', '10'], ['150', '10'], ['160', '8']]],
    ['Face Pulls', repeat(['50', '15'], 3)],
    ['Hammer Curls', [['40', '10'], ['35', '12'], ['30', '12']]],
]);
const olderPull = makeLift('50', '2026-10-19', 'Pull Day', [['Deadlift', [['345', '1']]]]);

const armDay = makeLift('300', '2026-10-28', 'Arm Day', [
    ['Close-Grip Bench', [['155', '8'], ['185', '5'], ['205', '3'], ['185', '5'], ['155', '8']]],
    ['EZ Bar Curl', [['65', '10'], ['75', '8'], ['85', '6'], ['75', '8']]],
    ['Skull Crushers', [['65', '10'], ['65', '10'], ['65', '9']]],
    ['Hammer Curls', [['40', '10'], ['35', '12'], ['30', '12']]],
    ['Cable Pushdown', [['60', '12'], ['70', '10'], ['80', '8'], ['90', '6']]],
    ['Preacher Curl', [['50', '10'], ['50', '8'], ['50', '8']]],
    ['Overhead Tricep Extension', [['50', '12'], ['50', '12'], ['45', '15']]],
    ['Concentration Curl', [['30', '10'], ['30', '8']]],
    ['Bench Dips', [['bw', '15'], ['bw', '12'], ['bw', '10']]],
]);

const layoutFor = (lift: Lift, history: Lift[] = []): StoryLayout => {
    const all: Record<string, Lift> = { [lift.id]: lift };
    for (const h of history) {
        all[h.id] = h;
    }
    return buildStoryLayout(lift, all)!;
};

const rowNames = (layout: StoryLayout, lift: Lift): StoryText[] =>
    layout.texts.filter((t) =>
        t.align === 'left' && lift.movements.some((m) => t.text.startsWith(m.name.slice(0, 6))));

describe('story layout', () => {
    it('returns null when nothing has sets', () => {
        const empty = makeLift('1', '2026-10-26', 'Empty', [['Bench', []]]);
        expect(buildStoryLayout(empty, { [empty.id]: empty })).toBeNull();
    });

    it('puts every row baseline on a rule and one bar per set', () => {
        const layout = layoutFor(pullDay);
        const names = rowNames(layout, pullDay);
        expect(names).toHaveLength(6);
        for (const name of names) {
            expect(layout.rules.some((y) => Math.abs(y - name.baseline) < 0.001)).toBe(true);
        }
        expect(layout.bars).toHaveLength(21);
    });

    it('marks a PR with fire right after the name, never on the top set', () => {
        const layout = layoutFor(pullDay, [olderPull]);
        expect(layout.texts.some((t) => t.text === 'Deadlift 🔥' && t.align === 'left')).toBe(true);
        expect(layout.texts.some((t) => t.text === '365×1' && t.align === 'right')).toBe(true);
        expect(layout.texts.filter((t) => t.text.includes('🔥'))).toHaveLength(1);
    });

    it('uses one name size per card and never lets top sets outsize names', () => {
        for (const lift of [pullDay, armDay]) {
            const layout = layoutFor(lift);
            const names = rowNames(layout, lift);
            const sizes = new Set(names.map((t) => t.size));
            expect(sizes.size).toBe(1);
            const stats = layout.texts.filter((t) => t.align === 'right' && t.text.includes('×'));
            for (const stat of stats) {
                expect(stat.size).toBeLessThanOrEqual(names[0].size);
            }
        }
    });

    it('fits a 9-movement day at near full size, inside the safe zone', () => {
        const layout = layoutFor(armDay);
        expect(layout.pitch / 72).toBeGreaterThan(0.85);
        for (const bar of layout.bars) {
            expect(bar.bottom - bar.height).toBeGreaterThan(356);
        }
        for (const text of layout.texts) {
            expect(text.baseline).toBeLessThan(1730);
            expect(text.baseline).toBeGreaterThan(180);
        }
    });

    it('keeps long names inside their column', () => {
        const layout = layoutFor(armDay);
        const firstBar = Math.min(...layout.bars.map((b) => b.x));
        for (const name of rowNames(layout, armDay)) {
            expect(name.x + textWidth(name.text, name.size)).toBeLessThan(firstBar);
        }
    });

    it('wraps a name that cannot fit onto consecutive rules, never cutting it off', () => {
        const long = makeLift('5', '2026-10-28', 'Long Names Day', [
            ['Seated Dumbbell Shoulder Press', [['50', '10'], ['55', '8'], ['60', '6']]],
            ['Single-Arm Cable Lateral Raise', [['15', '15'], ['20', '12'], ['20', '10']]],
            ['Incline Dumbbell Bench Press', [['70', '10'], ['75', '8'], ['80', '6']]],
            ['Overhead Tricep Rope Extension', [['50', '12'], ['55', '10'], ['60', '8']]],
            ['Bulgarian Split Squat With Pause', [['40', '10'], ['45', '8']]],
        ]);
        const layout = layoutFor(long);
        expect(layout.texts.some((t) => t.text.includes('…'))).toBe(false);
        const firstBar = Math.min(...layout.bars.map((bar) => bar.x));
        const nameLines = layout.texts.filter((t) =>
            t.align === 'left' && t.baseline > layout.rules[0] && !t.text.includes('sets'));
        for (const t of nameLines) {
            expect(t.x + textWidth(t.text, t.size)).toBeLessThan(firstBar);
            expect(layout.rules.some((y) => Math.abs(y - t.baseline) < 0.001)).toBe(true);
        }
        // the wrapped name's last line shares the row baseline with its top
        // set; its first line is on the rule directly above
        const last = layout.texts.find((t) => t.text === 'Shoulder Press')!;
        const first = layout.texts.find((t) => t.text === 'Seated Dumbbell')!;
        const top = layout.texts.find((t) => t.text === '60×6')!;
        expect(last.baseline).toBe(top.baseline);
        expect(last.baseline - first.baseline).toBeCloseTo(layout.pitch);
    });

    it('spaces every row the same, wrapped or not', () => {
        const long = makeLift('5', '2026-10-28', 'Long Names Day', [
            ['Seated Dumbbell Shoulder Press', [['50', '10'], ['60', '6']]],
            ['Rows', [['135', '8'], ['155', '8']]],
            ['Overhead Tricep Rope Extension', [['50', '12'], ['60', '8']]],
            ['Curls', [['30', '10'], ['35', '8']]],
        ]);
        for (const lift of [long, pullDay, armDay]) {
            for (const variant of ['story', 'message'] as const) {
                const layout = buildStoryLayout(lift, { [lift.id]: lift }, variant)!;
                // one top-set label per row, on the row baseline
                const baselines = layout.texts
                    .filter((t) => t.align === 'right' && t.text.includes('×'))
                    .map((t) => t.baseline);
                const gaps = baselines.slice(1).map((y, i) => y - baselines[i]);
                for (const gap of gaps) {
                    expect(gap).toBeCloseTo(gaps[0]);
                }
            }
        }
    });

    it('fills the page evenly however many names wrap', () => {
        // every name long enough to wrap at some sizes: the pitch/wrap budget
        // must settle, not leave rows bunched over an empty bottom
        const allLong = makeLift('9', '2026-10-28', 'Long Names Day', [
            ['Seated Dumbbell Shoulder Press', [['50', '10'], ['60', '6']]],
            ['Single-Arm Cable Lateral Raise', [['15', '15'], ['20', '10']]],
            ['Incline Dumbbell Bench Press', [['70', '10'], ['80', '6']]],
            ['Overhead Tricep Rope Extension', [['50', '12'], ['60', '8']]],
            ['Bulgarian Split Squat With Pause', [['40', '10'], ['45', '8']]],
        ]);
        for (const variant of ['story', 'message'] as const) {
            const layout = buildStoryLayout(allLong, { [allLong.id]: allLong }, variant)!;
            const footer = layout.texts.find((t) => t.text.includes('sets'))!;
            const lastRow = Math.max(...layout.bars.map((b) => b.bottom));
            const firstBarTop = Math.min(...layout.bars.map((b) => b.bottom - b.height));
            // gap below the rows is about the same as the gap above them
            const below = footer.baseline - lastRow;
            const above = firstBarTop - layout.rules[0];
            expect(Math.abs(below - above)).toBeLessThan(2.5 * layout.pitch);
        }
    });

    it('wraps a long name at a big size instead of shrinking every name to fit', () => {
        const long = makeLift('10', '2026-10-28', 'Shoulders', [
            ['Seated Dumbbell Shoulder Press', [['50', '10'], ['60', '6']]],
            ['Rear Delt Fly', repeat(['25', '15'], 3)],
            ['Cable Pushdown', [['60', '12'], ['90', '6']]],
            ['Incline Hammer Curls', [['35', '10'], ['25', '15']]],
        ]);
        const layout = layoutFor(long);
        const name = layout.texts.find((t) => t.text === 'Rear Delt Fly')!;
        const top = layout.texts.find((t) => t.text === '25×15')!;
        expect(layout.texts.some((t) => t.text === 'Shoulder Press')).toBe(true); // wrapped
        expect(name.size).toBeGreaterThan(54); // and names stayed big
        expect(top.size).toBeLessThanOrEqual(name.size);
    });

    it('keeps one wrapped name from shrinking every other name', () => {
        const mixed = makeLift('7', '2026-10-28', 'Mixed', [
            ['Seated Dumbbell Shoulder Press With Pause', [['50', '10'], ['60', '6']]],
            ['Bench', [['185', '5'], ['205', '3']]],
        ]);
        const plain = makeLift('8', '2026-10-28', 'Plain', [
            ['Bench', [['185', '5'], ['205', '3']]],
            ['Rows', [['135', '8'], ['155', '8']]],
        ]);
        // the long name wraps rather than dragging Bench down to fit it
        const sizeOf = (layout: StoryLayout) => layout.texts.find((t) => t.text === 'Bench')!.size;
        expect(sizeOf(layoutFor(mixed))).toBeGreaterThanOrEqual(0.85 * sizeOf(layoutFor(plain)));
    });

    it('scales short workouts up and centers them', () => {
        const short = makeLift('2', '2026-08-29', 'Push Day', [
            ['Bench', [['185', '8'], ['225', '5']]],
            ['Incline DB', repeat(['80', '10'], 3)],
        ]);
        const layout = layoutFor(short);
        expect(layout.pitch).toBe(100);
        const names = rowNames(layout, short);
        // centered: rows start well below the first rule under the date
        expect(names[0].baseline).toBeGreaterThan(356 + 3 * layout.pitch);
    });

    it('shrinks a medium title on one line, staying clear of the logo', () => {
        const lift = makeLift('3', '2026-10-26', 'Heavy Lower Body', [['Squat', [['225', '5']]]]);
        const layout = layoutFor(lift);
        const title = layout.texts[0];
        expect(title.text).toBe('Heavy Lower Body');
        expect(title.size).toBeLessThan(120);
        expect(title.size).toBeGreaterThanOrEqual(90);
        expect(title.x + textWidth(title.text, title.size)).toBeLessThanOrEqual(layout.logo.x - 80);
        expect(layout.rules[0]).toBe(366);
    });

    it('puts a long title on two lines instead of cutting it off', () => {
        const lift = makeLift('3', '2026-10-26', 'Absolutely Massive Upper Body Annihilation', [
            ['Bench', [['185', '5']]],
        ]);
        for (const variant of ['story', 'message'] as const) {
            const layout = buildStoryLayout(lift, { [lift.id]: lift }, variant)!;
            const [first, second] = layout.texts;
            expect(`${first.text} ${second.text}`).toBe('Absolutely Massive Upper Body Annihilation');
            expect(first.size).toBe(second.size);
            for (const line of [first, second]) {
                expect(line.x + textWidth(line.text, line.size)).toBeLessThanOrEqual(layout.logo.x - 80);
            }
            // first line's cap top level with the logo; the date moves down
            // below the second line, onto the (lowered) first rule
            expect(first.baseline - 0.752 * first.size).toBeCloseTo(layout.logo.y, 0);
            const date = layout.texts.find((t) => t.text === 'Monday, Oct 26')!;
            expect(date.baseline).toBe(layout.rules[0]);
            expect(second.baseline + 0.3 * second.size).toBeLessThan(date.baseline - 0.752 * date.size);
            const firstName = layout.texts.find((t) => t.text.startsWith('Bench'))!;
            expect(firstName.baseline).toBeGreaterThan(date.baseline);
        }
    });

    it('writes the date on the first rule, clear of the title descenders', () => {
        for (const variant of ['story', 'message'] as const) {
            const layout = buildStoryLayout(pullDay, { [pullDay.id]: pullDay }, variant)!;
            const [title, , date] = layout.texts;
            expect(date.baseline).toBe(layout.rules[0]);
            const titleDescender = title.baseline + 0.374 * title.size;
            const dateCapTop = date.baseline - 0.752 * date.size;
            expect(titleDescender).toBeLessThan(dateCapTop);
        }
    });

    it('aligns the logo top with the title cap and stays on the canvas', () => {
        const layout = layoutFor(pullDay);
        expect(layout.logo.y).toBe(176);
        expect(layout.logo.x + layout.logo.width).toBeCloseTo(STORY_WIDTH - 90);
        expect(layout.rules[layout.rules.length - 1]).toBeLessThan(STORY_HEIGHT);
    });

    it('summarizes sets and volume in the footer', () => {
        const layout = layoutFor(pullDay);
        expect(layout.texts.some((t) => t.text === '21 sets · 22,030 volume')).toBe(true);
        expect(layout.texts.some((t) => t.text === 'liftbookapp.com')).toBe(true);
        const dips = makeLift('4', '2026-10-26', 'Dips', [['Bench Dips', [['bw', '15']]]]);
        expect(layoutFor(dips).texts.some((t) => t.text === '1 set')).toBe(true);
    });
});

describe('message variant', () => {
    it('is a fully visible 3:4 card with everything inside it', () => {
        for (const lift of [pullDay, armDay]) {
            const layout = buildStoryLayout(lift, { [lift.id]: lift }, 'message')!;
            expect(layout.height).toBe(MESSAGE_HEIGHT);
            expect(MESSAGE_HEIGHT / STORY_WIDTH).toBeCloseTo(4 / 3);
            for (const text of layout.texts) {
                expect(text.baseline).toBeLessThan(MESSAGE_HEIGHT - 40);
            }
            for (const bar of layout.bars) {
                expect(bar.bottom - bar.height).toBeGreaterThan(layout.rules[0]);
            }
        }
    });

    it('gives short workouts bigger rows than the story does', () => {
        const short = makeLift('6', '2026-10-27', 'Push Day', [
            ['Bench', [['185', '8'], ['225', '5']]],
            ['Incline DB', repeat(['80', '10'], 3)],
        ]);
        const all = { [short.id]: short };
        expect(buildStoryLayout(short, all, 'message')!.pitch)
            .toBeGreaterThanOrEqual(buildStoryLayout(short, all, 'story')!.pitch);
    });
});

describe('wrapName', () => {
    it('keeps short names whole and balances long ones across two lines', () => {
        expect(wrapName('Bench', ' 🔥', 54, 400)).toEqual(['Bench 🔥']);
        expect(wrapName('Overhead Tricep Extension', ' 🔥', 54, 400))
            .toEqual(['Overhead Tricep', 'Extension 🔥']);
    });

    it('only truncates what cannot fit in two lines', () => {
        const lines = wrapName('Very Long Exercise Name That Goes On And On Forever', '', 54, 300);
        expect(lines).toHaveLength(2);
        expect(lines[1].endsWith('…')).toBe(true);
        expect(wrapName('Supercalifragilisticexpialidocious', '', 54, 300)[0].endsWith('…')).toBe(true);
    });
});

describe('bar heights', () => {
    it('are proportional to the movement’s heaviest set, with a visible floor', () => {
        expect(barHeights(armDay.movements[0])).toEqual([155 / 205, 185 / 205, 1, 185 / 205, 155 / 205]);
        expect(barHeights({ name: 'Warmup', sets: [{ weight: '10', reps: '5' }, { weight: '400', reps: '1' }] }))
            .toEqual([0.12, 1]);
    });

    it('draws full bars when any weight is not a number', () => {
        expect(barHeights(armDay.movements[8])).toEqual([1, 1, 1]);
    });
});

describe('formatStoryDate', () => {
    it('spells out the local weekday and month', () => {
        expect(formatStoryDate('2026-10-26')).toBe('Monday, Oct 26');
        expect(formatStoryDate('2026-08-29')).toBe('Saturday, Aug 29');
        expect(formatStoryDate('garbage')).toBe('garbage');
    });
});
