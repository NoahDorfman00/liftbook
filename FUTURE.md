# Future features

Ideas and shelved features for upcoming releases. Each entry notes where any
existing work lives so it can be picked back up without archaeology.

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
