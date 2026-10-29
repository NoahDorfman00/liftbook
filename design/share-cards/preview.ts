// Renders the app's real share-image layouts (storyLayout.ts, chartCardLayout.ts) to HTML so it
// can be screenshotted at full size without a simulator. Runs under Jest
// (which compiles the app's TypeScript); not part of the normal test run:
//
//   PREVIEW_OUT=/tmp/previews npx jest --testMatch '**/design/share-cards/preview.ts'
//
// then screenshot each HTML file with headless Chrome at 1080 wide (the
// file names end with the image height).
import fs from 'fs';
import path from 'path';
import { buildStoryLayout, StoryLayout, StoryVariant, STORY_WIDTH } from '../../storyLayout';
import { pencilBarPath } from '../../StoryCard';
import { buildChartCardLayout, ChartCardPoint } from '../../chartCardLayout';
import { Lift } from '../../types';

const ROOT = path.resolve(__dirname, '../..');
const THEMES = {
    light: { paper: '#fff', ink: '#333', secondary: '#666', rule: '#e0e0e0' },
    dark: { paper: '#1c1c1e', ink: '#d6d6d6', secondary: '#a0a0a5', rule: '#3a3a3c' },
};

const lift = (id: string, date: string, title: string, moves: Array<[string, Array<[string, string]>]>): Lift => ({
    id,
    date,
    title,
    movements: moves.map(([name, sets]) => ({ name, sets: sets.map(([weight, reps]) => ({ weight, reps })) })),
});
const times = (set: [string, string], n: number): Array<[string, string]> => Array.from({ length: n }, () => set);

const SHOULDERS = lift('3', '2026-10-28', 'Shoulders & Arms', [
    ['Seated Dumbbell Shoulder Press', [['50', '10'], ['55', '8'], ['60', '6'], ['60', '6']]],
    ['Single-Arm Cable Lateral Raise', [['15', '15'], ['20', '12'], ['20', '10']]],
    ['Rear Delt Fly', times(['25', '15'], 3)],
    ['Overhead Tricep Extension', [['50', '12'], ['55', '10'], ['60', '8']]],
    ['Incline Hammer Curls', [['35', '10'], ['30', '12'], ['25', '15']]],
    ['Cable Pushdown', [['60', '12'], ['70', '10'], ['80', '8'], ['90', '6']]],
]);
const PUSH = lift('2', '2026-10-27', 'Push Day', [
    ['Bench', [['185', '8'], ['205', '5'], ['225', '5'], ['225', '4'], ['185', '10']]],
    ['Overhead Press', [['95', '8'], ['115', '6'], ['135', '3']]],
    ['Incline DB', times(['80', '10'], 4)],
    ['Cable Fly', [['50', '12'], ['40', '12'], ['30', '15']]],
]);
const ARMS = lift('4', '2026-10-28', 'Arm Day', [
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
// stress case: every name long enough to wrap
const ALL_LONG = lift('5', '2026-10-28', 'Long Names Day', [
    ['Seated Dumbbell Shoulder Press', [['50', '10'], ['55', '8'], ['60', '6']]],
    ['Single-Arm Cable Lateral Raise', [['15', '15'], ['20', '12'], ['20', '10']]],
    ['Incline Dumbbell Bench Press', [['70', '10'], ['75', '8'], ['80', '6']]],
    ['Overhead Tricep Rope Extension', [['50', '12'], ['55', '10'], ['60', '8']]],
    ['Bulgarian Split Squat With Pause', [['40', '10'], ['45', '8']]],
]);
// long title: wraps onto two lines
const LONG_TITLE = lift('6', '2026-10-28', 'Upper Body Hypertrophy & Conditioning', PUSH.movements.map((m) =>
    [m.name, m.sets.map((set): [string, string] => [set.weight, set.reps])]));
// medium title: shrinks on one line
const MEDIUM_TITLE = { ...SHOULDERS, id: '7', title: 'Heavy Shoulders & Arms' };
// history so some PRs fire
const HISTORY = [
    lift('1', '2026-10-20', 'Old', [
        ['Bench', [['215', '3']]],
        ['Overhead Press', [['125', '4']]],
        ['Overhead Tricep Extension', [['55', '10']]],
        ['Seated Dumbbell Shoulder Press', [['55', '8']]],
    ]),
];

// chart cards: a steady climb with a deload, a long volume history, a short run
const BENCH: ChartCardPoint[] = [
    ['2026-03-04', 135], ['2026-03-11', 145], ['2026-03-20', 145], ['2026-04-02', 155], ['2026-04-16', 165],
    ['2026-05-01', 175], ['2026-05-20', 185], ['2026-06-10', 185], ['2026-07-01', 195], ['2026-07-22', 205],
    ['2026-08-15', 225], ['2026-09-10', 205], ['2026-10-01', 215], ['2026-10-26', 220],
].map(([date, value]) => ({ date: date as string, value: value as number }));
const SQUAT_VOLUME: ChartCardPoint[] = Array.from({ length: 48 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 9, 1) + i * 7 * 86400000).toISOString().slice(0, 10),
    value: 4000 + i * 90 + (i % 4) * 350 - (i % 7 === 0 ? 900 : 0),
}));
const FEW: ChartCardPoint[] = [{ date: '2026-10-14', value: 50 }, { date: '2026-10-21', value: 55 }, { date: '2026-10-28', value: 60 }];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const render = (layout: StoryLayout, theme: keyof typeof THEMES): string => {
    const c = THEMES[theme];
    const rules = layout.rules.map((y) => `<line x1="0" y1="${y}" x2="${STORY_WIDTH}" y2="${y}" stroke="${c.rule}" stroke-width="2"/>`);
    const bars = layout.bars.map((bar, i) =>
        `<path d="${pencilBarPath(bar, i + 1)}" fill="url(#hatch)" stroke="${c.ink}" stroke-width="${bar.strokeWidth}" stroke-linejoin="round"/>`);
    const paths = (layout.paths ?? []).map((p) =>
        `<path d="${p.d}" fill="${p.fill === 'hatch' ? 'url(#hatch)' : 'none'}" stroke="${p.strokeWidth > 0 ? c.ink : 'none'}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${p.opacity ?? 1}"/>`);
    const dots = (layout.dots ?? []).map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${c.ink}"/>`);
    const texts = layout.texts.map((t) => {
        const anchor = t.align === 'right' ? 'end' : t.align === 'center' ? 'middle' : 'start';
        const fill = t.color === 'ink' ? c.ink : c.secondary;
        return `<text x="${t.x}" y="${t.baseline}" font-size="${t.size}" fill="${fill}" text-anchor="${anchor}">${escape(t.text)}</text>`;
    });
    const { x, y, width, height } = layout.logo;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Schoolbell; src: url('file://${ROOT}/assets/fonts/Schoolbell-Regular.ttf'); }
html,body { margin:0; background:${c.paper}; }
svg { display:block; font-family: Schoolbell, 'Apple Color Emoji'; }
.logo { position:absolute; left:${x}px; top:${y}px; width:${width}px; height:${height}px; background:${c.ink};
  -webkit-mask: url('file://${ROOT}/assets/barbell.png') center / contain no-repeat; }
</style></head><body><div style="position:relative">
<svg width="${STORY_WIDTH}" height="${layout.height}" viewBox="0 0 ${STORY_WIDTH} ${layout.height}" xmlns="http://www.w3.org/2000/svg">
<defs><pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse">
<path d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9" stroke="${c.ink}" stroke-width="2.6" stroke-linecap="square"/></pattern></defs>
<rect width="${STORY_WIDTH}" height="${layout.height}" fill="${c.paper}"/>
${rules.join('')}${bars.join('')}${paths.join('')}${dots.join('')}${texts.join('')}
</svg><div class="logo"></div></div></body></html>`;
};

test('render share image previews', () => {
    const out = process.env.PREVIEW_OUT;
    if (!out) {
        return;
    }
    fs.mkdirSync(out, { recursive: true });
    const cases: Array<[string, Lift, StoryVariant, keyof typeof THEMES]> = [
        ['story_shoulders_light', SHOULDERS, 'story', 'light'],
        ['story_arms_dark', ARMS, 'story', 'dark'],
        ['message_push_light', PUSH, 'message', 'light'],
        ['message_shoulders_light', SHOULDERS, 'message', 'light'],
        ['message_arms_dark', ARMS, 'message', 'dark'],
        ['story_alllong_light', ALL_LONG, 'story', 'light'],
        ['message_alllong_light', ALL_LONG, 'message', 'light'],
        ['story_longtitle_light', LONG_TITLE, 'story', 'light'],
        ['message_longtitle_light', LONG_TITLE, 'message', 'light'],
        ['story_mediumtitle_dark', MEDIUM_TITLE, 'story', 'dark'],
        ['message_mediumtitle_light', MEDIUM_TITLE, 'message', 'light'],
    ];
    for (const [name, workout, variant, theme] of cases) {
        const all: Record<string, Lift> = { [workout.id]: workout };
        for (const h of HISTORY) {
            all[h.id] = h;
        }
        const layout = buildStoryLayout(workout, all, variant)!;
        fs.writeFileSync(path.join(out, `${name}__${layout.height}.html`), render(layout, theme));
    }

    const charts: Array<[string, string, ChartCardPoint[], 'weight' | 'volume', StoryVariant, keyof typeof THEMES]> = [
        ['chart_bench_story_light', 'Bench Press', BENCH, 'weight', 'story', 'light'],
        ['chart_bench_message_light', 'Bench Press', BENCH, 'weight', 'message', 'light'],
        ['chart_bench_story_dark', 'Bench Press', BENCH, 'weight', 'story', 'dark'],
        ['chart_squat_volume_story_light', 'Barbell Back Squat', SQUAT_VOLUME, 'volume', 'story', 'light'],
        ['chart_few_message_dark', 'Seated Dumbbell Shoulder Press', FEW, 'weight', 'message', 'dark'],
    ];
    for (const [name, movement, points, mode, variant, theme] of charts) {
        const layout = buildChartCardLayout(movement, points, mode, variant)!;
        fs.writeFileSync(path.join(out, `${name}__${layout.height}.html`), render(layout, theme));
    }
});
