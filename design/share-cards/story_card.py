"""Liftbook story share card — design reference for the app's layout code.

Renders the final 1080x1920 design (see FUTURE.md "Image format") as HTML/SVG;
screenshot with headless Chrome for exact PNGs:

    python3 story_card.py
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
        --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=3000 \
        --window-size=1080,1920 --screenshot="$PWD/C6.png" "file://$PWD/C6.html"

Compact pencil-bar layout: one row per movement — name, bars, top set.

Rows sit on the ruled lines (two rules per movement). Short workouts scale
the rule pitch up (bigger text, taller bars) and center the rows between
the header and footer, so the page never looks empty.
"""
import html, math

FONT = "/Users/noahdorfman/Documents/liftbook/assets/fonts/Schoolbell-Regular.ttf"
THEMES = {  # from theme.ts
    "light": dict(paper="#fff", ink="#333", secondary="#777", rule="#e6e6e6"),
    "dark": dict(paper="#1c1c1e", ink="#d6d6d6", secondary="#a0a0a5", rule="#3a3a3c"),
}
W, H, LEFT = 1080, 1920, 90
DATE_Y, FOOTER_Y = 356, 1652
MAX_PITCH = 100   # how far short workouts may scale up (72 = base)
CAP_TOP = 192     # measured cap top of the 120px title at baseline 284

def num(s):
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None

def heights(sets):
    ws = [num(w) for w, _ in sets]
    if any(w is None for w in ws):
        return [1.0] * len(sets)          # bodyweight etc: full bars
    hi = max(ws)
    return [max(0.12, w / hi) for w in ws]

def top_set(sets):
    best = sets[0]
    for s in sets:
        if num(s[0]) is not None and (num(best[0]) is None or num(s[0]) > num(best[0])):
            best = s
    return best

def t(x, y, s, size, color, anchor="start"):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size:.1f}" fill="{color}" '
            f'text-anchor="{anchor}">{html.escape(s)}</text>')

def est_width(s, fs):
    return sum(fs * (1.05 if ord(c) > 0x2000 else 0.52 if c.isdigit() or c == '×' else 0.45) for c in s)

def fit(name, suffix, size, max_w, min_size):
    """shrink, then truncate the name (never the suffix) — like adjustsFontSizeToFit"""
    while size > min_size and est_width(name + suffix, size) > max_w:
        size -= 1
    while est_width(name + suffix, size) > max_w and len(name) > 1:
        name = name[:-2].rstrip() + "…"
    return name + suffix, size

def card(workout, theme="light"):
    c = THEMES[theme]
    moves = workout["movements"]
    n = len(moves)
    region = FOOTER_Y - DATE_Y
    p = min(MAX_PITCH, region / (2 * n + 2))
    s = p / 72
    footer_y = DATE_Y + math.floor((FOOTER_Y + 68 - DATE_Y) / p) * p
    block = 1.45 * p + 2 * p * (n - 1)
    target = DATE_Y + (footer_y - 50 - DATE_Y - block) / 2 + 1.45 * p
    first_k = max(2, round((target - DATE_Y) / p))

    body = []
    y = DATE_Y
    while y < H:
        body.append(f'<line x1="0" y1="{y:.1f}" x2="{W}" y2="{y:.1f}" stroke="{c["rule"]}" stroke-width="2"/>')
        y += p
    MASK_W, MASK_H = 805, 384     # barbell cut from the bootsplash logo

    def barbell(x, y, h, color=None):
        w = h * MASK_W / MASK_H
        return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                f'fill="{color or c["ink"]}" mask="url(#barbell-{x:.0f})"/>'
                f'<mask id="barbell-{x:.0f}" mask-type="alpha"><image href="barbell_mask.png" '
                f'x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"/></mask>'), w

    # brand lockup: barbell over wordmark, top aligned to the title's cap top
    body.append(t(LEFT, 284, workout["title"], 120, c["ink"]))
    h = 78
    cx = W - LEFT - h * MASK_W / MASK_H / 2
    mark, _ = barbell(cx - h * MASK_W / MASK_H / 2, CAP_TOP, h)
    body.append(mark)
    body.append(t(cx, CAP_TOP + h + 42, "liftbook", 44, c["ink"], "middle"))
    body.append(t(LEFT, DATE_Y - 14, workout["date"], 46, c["secondary"]))

    tops = [top_set(st) for _, st, _ in moves]
    bw, gap = 26 * s, 12 * s
    max_sets = max(len(st) for _, st, _ in moves)
    suffixes = [" 🔥" if pr else "" for _, _, pr in moves]

    def columns(label_fs):
        label_w = max(est_width(f"{w}×{r}", label_fs) for w, r in tops)
        bars_left = W - LEFT - label_w - 44 * s - max_sets * (bw + gap) + gap
        return bars_left, bars_left - LEFT - 44 * s

    # one name size for the whole card: the largest that fits every name
    # (down to a floor); only names still too long at the floor truncate.
    # Top-set labels never outsize the names — names lead the row.
    label_fs = 44 * s
    bars_left, name_w = columns(label_fs)
    name_fs = min(fit(name, sfx, 54 * s, name_w, 38 * s)[1]
                  for (name, _, _), sfx in zip(moves, suffixes))
    if label_fs > name_fs:
        label_fs = name_fs
        bars_left, name_w = columns(label_fs)
    for m, ((name, sets, pr), (w, r)) in enumerate(zip(moves, tops)):
        y = DATE_Y + (first_k + 2 * m) * p
        text, fs = fit(name, suffixes[m], name_fs, name_w, name_fs)
        body.append(t(LEFT, y, text, fs, c["ink"]))
        for i, h in enumerate(heights(sets)):
            bh = 1.45 * p * h
            body.append(
                f'<rect x="{bars_left + i * (bw + gap):.1f}" y="{y - bh:.1f}" width="{bw:.1f}" '
                f'height="{bh:.1f}" rx="{3 * s:.1f}" fill="url(#hatch)" stroke="{c["ink"]}" '
                f'stroke-width="{2.6 * s:.1f}" filter="url(#rough)"/>')
        body.append(t(W - LEFT, y, f"{w}×{r}", label_fs, c["ink"], "end"))

    all_sets = [x for _, st, _ in moves for x in st]
    vol = sum((num(w) or 0) * float(r) for w, r in all_sets)
    body.append(t(LEFT, footer_y, f"{len(all_sets)} sets · {vol:,.0f} lb", 54, c["ink"]))
    body.append(t(W - LEFT, footer_y, "liftbookapp.com", 40, c["secondary"], "end"))

    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Schoolbell; src: url('file://{FONT}'); }}
html,body {{ margin:0; background:{c["paper"]}; }}
svg {{ display:block; font-family: Schoolbell, 'Apple Color Emoji'; }}
</style></head><body>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="rough" x="-20%" y="-10%" width="140%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/>
    <feDisplacementMap in="SourceGraphic" scale="4"/>
  </filter>
  <pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="12" stroke="{c["ink"]}" stroke-width="2.6"/>
  </pattern>
</defs>
<rect width="{W}" height="{H}" fill="{c["paper"]}"/>
{''.join(body)}
</svg></body></html>"""

PUSH4 = {"title": "Push Day", "date": "Thursday, Aug 29", "movements": [
    ("Bench", [("185", "8"), ("205", "5"), ("225", "5"), ("225", "4"), ("185", "10")], True),
    ("Overhead Press", [("95", "8"), ("115", "6"), ("135", "3")], False),
    ("Incline DB", [("80", "10"), ("80", "10"), ("80", "9"), ("80", "8")], False),
    ("Cable Fly", [("50", "12"), ("40", "12"), ("30", "15")], False),
]}
PULL6 = {"title": "Pull Day", "date": "Monday, Oct 26", "movements": [
    ("Deadlift", [("135", "5"), ("225", "5"), ("275", "3"), ("315", "2"), ("365", "1")], True),
    ("Barbell Rows", [("185", "8")] * 4, False),
    ("Lat Pulldown", [("160", "10"), ("160", "10"), ("140", "12")], False),
    ("Seated Cable Row", [("140", "10"), ("150", "10"), ("160", "8")], False),
    ("Face Pulls", [("50", "15")] * 3, False),
    ("Hammer Curls", [("40", "10"), ("35", "12"), ("30", "12")], False),
]}
ARMS9 = {"title": "Arm Day", "date": "Wednesday, Oct 28", "movements": [
    ("Close-Grip Bench", [("155", "8"), ("185", "5"), ("205", "3"), ("185", "5"), ("155", "8")], True),
    ("EZ Bar Curl", [("65", "10"), ("75", "8"), ("85", "6"), ("75", "8")], False),
    ("Skull Crushers", [("65", "10"), ("65", "10"), ("65", "9")], False),
    ("Hammer Curls", [("40", "10"), ("35", "12"), ("30", "12")], False),
    ("Cable Pushdown", [("60", "12"), ("70", "10"), ("80", "8"), ("90", "6")], False),
    ("Preacher Curl", [("50", "10"), ("50", "8"), ("50", "8")], False),
    ("Overhead Tricep Extension", [("50", "12"), ("50", "12"), ("45", "15")], True),
    ("Concentration Curl", [("30", "10"), ("30", "8")], False),
    ("Bench Dips", [("bw", "15"), ("bw", "12"), ("bw", "10")], False),
]}

RENDERS = {
    "C4": (PUSH4, {}),
    "C6": (PULL6, {}),
    "C9": (ARMS9, {}),
    "C6_dark": (PULL6, {"theme": "dark"}),
}
for key, (workout, opts) in RENDERS.items():
    open(f"{key}.html", "w").write(card(workout, **opts))
print(" ".join(RENDERS))
