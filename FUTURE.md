# Future features

Ideas and shelved features for upcoming releases. Each entry notes where any
existing work lives so it can be picked back up without archaeology.

## Lift share cards — story image + "try it" link

**Status (Oct 2026):** the link side is **built and live** — payload
encode/decode and PR detection in `shareCard.ts`, the deep-link route and
"Shared lift" preview modal (`SharedLiftScreen.tsx`), the `shared:` set-entry
hint, and the liftbookapp.com `/l` fallback page + AASA (liftbookSite repo).
The share *output* is now a 9:16 story image (built): `storyLayout.ts`
(pure layout, ported from the prototype in `design/share-cards/`),
`StoryCard.tsx` (draws it), `useStoryShare.tsx` (renders off-screen,
captures with `react-native-view-shot`, opens the share sheet with image +
link message). Text is measured with Schoolbell's real glyph widths
(`schoolbellMetrics.json`, from `design/share-cards/schoolbell_metrics.swift`).

### What it is

A share button on a lift that produces a **1080×1920 story image** of the
workout for the native share sheet (Instagram/Snapchat stories, iMessage,
anything that takes an image), plus a short `Try it → <link>` message. The
image is the brag; the link lets the recipient import the lift as a template
and try it with their own weights. No accounts, no server, no feed.

**Why an image, not text (the v1 text card, retired):** the original was a
Wordle-style text card — braille dot-matrix graphs (`⣀⣤⣶⣿`) aligned with
braille blanks and figure spaces, with names truncated to a 220pt pixel
budget measured from SF Pro glyph tables. It worked, but it fought the
medium: proportional fonts, bubble widths that differ by phone and by
sent-vs-received (≈275pt vs ≈240pt), Dynamic Type, and iMessage's link
detector. Every fix made the card say less; real lifts got truncated
constantly. An image removes every one of those constraints at once.

### Image format (all decisions final)

Hand-drawn notebook page, Schoolbell throughout, matching the app:

```
 Pull Day                              [barbell]
 Monday, Oct 26                         liftbook
 ───────────────────────────────────────────────
 Deadlift 🔥            ▁▂▄▆█           365×1
 Barbell Rows           ████            185×8
 Lat Pulldown           ██▇             160×10
 …
 21 sets · 22,030 lb                liftbookapp.com
```

- **Layout — compact, one row per movement**: name, pencil bars, top set.
  Each movement takes two ruled lines; text baselines sit on the rules.
  Chosen over a "full" layout (bars with a `weight×reps` label under every
  set, four lines per movement) because the full layout had to shrink to
  fit: per-set labels hit ~9pt on a phone at 6 movements and ~6pt at 9.
  Compact fits 8 movements at full size and 9 at 90%. Per-set detail lives
  behind the link, same split as the old text card.
- **Short workouts fill the page**: the rule pitch scales up (base 72px,
  max 100px) so text and bars grow, and the rows are centered between the
  header and footer — snapped so baselines stay on rules.
- **Bars**: one per set, pencil style (rounded outline + 45° hatching,
  slight hand-drawn wobble). **Proportional** height = weight ÷ that
  movement's heaviest set (min 12% so light sets stay visible). Chosen over
  min-max — the braille card needed min-max to show any shape with 7 levels,
  but in pixels it lies (160/160/140 drew the 140 as a stub). Proportional
  still dramatizes real ramps (135→365) and keeps straight sets a solid
  wall. Unparseable weights (`bw`) draw full bars. Max height 1.45 rules.
- **Top set**: heaviest set as `weight×reps`, right-aligned. Never larger
  than the movement names (names lead the row).
- **Names**: one font size for the whole card. Long names **wrap** rather
  than truncate: each half sits on its own rule (balanced word break, 🔥 on
  the last line). Tight leading between the rules was mocked and rejected —
  text floating between rules looks wrong on notebook paper. `…` only when
  a name won't fit on two lines. Per-row shrinking was rejected (rows at
  mismatched sizes).
- **Uniform row rhythm**: every row is the same height so the gaps between
  movements never alternate. One-line cards use two rules per row (names
  shrink to fit, down to a floor); if anything wraps, *every* row takes
  three rules (one-line names on the lower rule). The card picks wrapped
  rows when a name can't fit one line or when wrapping makes names ≥10%
  bigger (`WRAP_GAIN`) — long names stay big instead of shrinking into
  long, hard-to-read lines; short-name and 9-movement cards keep the
  compact rows.
- **🔥 PR marker**: right after the movement name, in the open space before
  the bars — never in the top-set column, where it shoved the numbers
  left. A PR = beats the movement's all-time top weight in strictly older
  lifts (local history only); a movement's first appearance never fires.
- **Header**: title (120px) top left; the date (secondary) is written on
  the first rule, clear of the title's descenders (they collided when the
  date floated under the title). Long titles shrink on one line to 75%,
  then go to two balanced lines (≤75%, down to 55% before `…`) with the
  first line's cap top level with the logo; the date and rules move down
  to make room. At least 80px between the title and the logo.
  **Brand lockup top right**: the barbell from the splash logo over a
  "liftbook" wordmark, ink color, ~78px barbell — its top aligned exactly
  to the title's cap top (y=176), bottom floating free. Riding the date's
  rule, a footer signature, a gray stamp, and an app-icon tile were all
  mocked and rejected (rule-riding and full-size felt like a second
  headline; the tile read as a sticker on the notebook).
- **Footer**: `N sets · N lb` left, `liftbookapp.com` right (secondary) —
  the link isn't tappable inside an image, so the domain is the path in.
- **Theme follows the app's appearance** (light/dark from `theme.ts`). A
  story fills the screen, so "light pops more" doesn't apply there, and
  dark matches Instagram's chrome.
- **IG safe zone**: content stays between y≈190 and ≈1660 — the top is
  covered by the story progress bar/profile row, the bottom by the reply
  bar.
- **Two canvases**: the 1080×1920 story and a 1080×1440 (3:4) message
  card. Measured from real iMessage screenshots: Messages shows images at
  a fixed bubble width and center-crops anything taller than ~4:3, so the
  story arrived with its header and footer cut off until tapped. Same
  design on the message card, no IG safe zone, bigger rows.

### Delivery

One Share button, one native sheet (`ios/liftbook/LiftbookShare.m`, a
`UIActivityItemSource`): Messages gets the 3:4 card, every other
destination (Instagram, Photos, AirDrop) gets the story. Both are captured
off-screen with react-native-view-shot before the sheet opens; the sheet
header shows the lift title and image. The PNG goes out **with** a
`Try it → <link>` message in the same share action: iMessage receives image + tappable link; Instagram stories
take the image (the link would need IG's manual link sticker — the
`liftbookapp.com` footer covers that path). Direct "Share to Story" via
Instagram's URL scheme requires registering a Meta app ID; skipped unless
the share sheet route proves clunky.

Prototype (`design/share-cards/story_card.py`) renders exact 1080×1920
mockups with headless Chrome — it is the reference the app's layout
function ports.

### The link — payload in the URL, zero backend

Serialize the lift (movement names + sets, sharer's weights included) and
put it in the **URL fragment**: `https://liftbookapp.com/l#v1=<payload>`.
The link *is* the data — nothing hosted, nothing expires, and fragments are
never sent to the server, so even the fallback page's host sees no lift
data (same privacy stance as Liftbook Heavy, without the WebRTC
dependency).

Two hard-won constraints from iOS's link detector (NSDataDetector — what
Messages uses to linkify; verified directly against the framework on
macOS after a real iMessage broke the link):

- **The `=` after the version is load-bearing.** The detector truncates
  its match at `#v1.`, `#v1~`, `#v1/`, `#v1:`, `#v1!` — and even a bare
  long fragment with no separator — but matches `#v1=<payload>` in full.
  Only `=` worked of everything tested.
- **~630-char URL cap.** Past that the detector truncates regardless, so
  the payload must be compact. Base64url JSON blew the cap around 6
  movements; the shipped format is `v1=` + base64url of a delimited
  string — `[title, date, ...movements]` joined with `\x1e`, each
  movement `[name, w1, r1, w2, r2, …]` joined with `\x1f`, control chars
  stripped from user text first. ~53% smaller than the JSON equivalent
  (a 3-movement card: 185-char URL vs 393); a 6-movement × 5-set workout
  stays comfortably under the cap (tested). Zero dependencies —
  hand-rolled base64url in `shareCard.ts` since Hermes lacks btoa.
  Truly extreme workouts (8+ movements with long names) could still
  exceed 630 and un-linkify; revisit (deflate as `v2=`) only if that
  shows up in practice. `v1=` semantics freeze once links are in the
  wild.

- **Recipient with app**: universal link opens a preview modal (same
  pattern as Heavy's modal screen) rendering the shared workout
  Liftbook-style — title, movements, the sharer's sets, notebook paper.
  Two actions: **Try this lift** and dismiss. Dismiss saves nothing; links
  never expire (the data is the URL), so re-tapping always works.
  - **Try this lift** creates a regular `Lift`: today's date, shared title,
    movement names, **empty sets** — the sharer's weights are never written
    to the recipient's store (they would poison charts, suggestions, and PR
    detection). No new object type, no flag; after import it's just a lift.
  - The sharer's numbers ride along **ephemerally** as a route param to the
    editor and surface during set entry as a `shared:` note line **stacked
    above** the regular `last time:` note (never replacing it — target vs
    baseline are both needed to pick a weight, and the side-by-side is the
    fun). Only the `shared:` line shows when the recipient has no history
    for that movement; style it distinctly (accent color or prefix) from
    the last-time line. In-memory only, gone when the editor closes — no schema
    change; the original message still has the card.
  - The editor's existing auto-focus logic drops the cursor into the first
    movement's first set, so the full flow is tap → preview → one button →
    typing your own weight.
  - Malformed / future-version payloads get one friendly alert, never a
    crash. Re-tapping a link twice makes a second draft lift — harmless.
  - Implementation note: the payload is in the URL *fragment*, which React
    Navigation's path matching ignores — the route needs a small custom
    `getStateFromPath` that parses the fragment itself.
- **Recipient without app**: static page at `liftbookapp.com/l` (single HTML
  file, e.g. GitHub Pages) decodes the fragment in JS, renders the lift, and
  shows an App Store button. The link is never a dead end; install is the
  upsell, not the gate. Requires the apple-app-site-association setup
  already noted under Liftbook Heavy.

### UI placement (decided)

Exactly two share entry points, both at "looking at a finished workout"
moments; nothing pushier (no chart-screen button, no post-workout prompt):

- **Editor header**: share icon left of the trash icon (header is currently
  back | date | trash with room to spare). Hand-drawn share glyph (sketchy
  iOS box-with-arrow) to match the back/trash/chart icon style. Hidden until
  the lift has at least one set with a parseable weight. Not on the notebook
  page itself — no chrome invades the paper, and the title bubble is already
  a tap-to-edit target.
- **Lift list**: second swipe action on the existing left-swipe, becoming
  **Share | Delete** (`Swipeable` supports multiple actions; standard iOS
  pattern). Zero new visible chrome; lets old workouts be re-shared without
  opening them. Share on an empty lift no-ops.

Share tap → render both images off-screen → native share sheet
directly with image + link message (no preview screen; the share sheet
previews the image itself).

### Explicit non-goals (bloat guardrails)

No share history, no inbox, no notifications, no try-counts, no re-share
attribution, no second share format ("humble mode" etc.). One button, one
format, one deep-link handler.

### Open implementation questions

- `Set.weight` is a free-form string (types.ts) — bar heights, volume total,
  and PR detection need numeric parsing. Decide fallbacks for non-numeric /
  empty weights (likely: all-equal bars, omit volume line) and how to treat
  `+45`-style weighted-dips notation.
- Footer assumes `lb`; the app has no unit setting today.
- Verify on device that iMessage keeps both the image and the link
  message from one share action (some apps drop one of the two).
- Verify on device that Messages receives the 3:4 card uncropped and
  Instagram the story from the same sheet.

## Liftbook Heavy — peer-to-peer data transfer

**Status:** built and working, shelved from the current release.
**Code:** preserved on the [`heavy-p2p`](../../tree/heavy-p2p) branch
(last commit with the feature integrated: `0b72c33`). The feature was removed
from `main` after that commit.

### What it does

Scanning a QR / opening a `liftbook://heavy?session=...` deep link on the
browser side opens `HeavyShareScreen`, which sends the user's full lift history
directly to the browser over a WebRTC data channel. Firebase RTDB
(`liftbook-695fc-default-rtdb`) is used only for signaling (offer/answer/ICE
under `heavy-sessions/<sessionId>`); the lift data itself never touches a
server — that privacy property is the point of the feature.

### How it works (for re-integration)

- `HeavyShareScreen.tsx` — the whole feature is this one screen plus:
  - `Heavy: { session: string }` in `RootStackParamList` (types.ts)
  - `Heavy: 'heavy'` in the linking config and a modal `Stack.Screen` (App.tsx)
  - `react-native-webrtc` in package.json
- Signaling: app PUTs the SDP offer to Firebase, polls every 500 ms for the
  browser's answer and ICE candidates, 30 s timeout. STUN only
  (`stun:stun.l.google.com:19302`), no TURN.
- Transfer: JSON payload chunked at 16 KB per data-channel message,
  terminated with an `__END__` sentinel. Session is deleted from Firebase
  after send.

### Why it was shelved

`react-native-webrtc` is by far the heaviest dependency (~336 MB WebRTC
xcframework in the iOS build) and the current release doesn't need it.
Shipping without it shrinks the binary and removes camera/mic-adjacent
review surface.

### Notes for when it comes back

- Consider whether the browser counterpart should also poll less aggressively
  or use RTDB REST streaming (EventSource) instead of 500 ms intervals.
- No TURN server means transfers fail on symmetric-NAT networks; fine for
  same-network sharing, worth revisiting for remote sharing.
- If P2P privacy ever stops being a requirement, the same UX can be built by
  relaying the payload through the existing Firebase session — no WebRTC dep.
- Re-check that the linking config's `https://liftbookapp.com` universal link
  domain has a valid apple-app-site-association when the deep-link flow ships.
