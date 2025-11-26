import { Platform, Vibration } from 'react-native';

// Simple cross-platform haptic helpers using the core Vibration API.
// iOS: short vs long vibration patterns feel like different haptics.
// Android: maps to the system vibration pattern.

const vibratePattern = (pattern: number | number[]) => {
    try {
        // On iOS 13+, very short durations are treated as light taps.
        // On Android, arrays specify on/off durations.
        Vibration.vibrate(pattern as any);
    } catch {
        // Fail silently if vibration is unavailable
    }
};

export const hapticTap = () => {
    // Intentionally no-op: we only provide haptics for holds/destructive actions.
};

export const hapticHold = () => {
    // Ultra-short, "tap-like" tick for long-press / destructive actions
    if (Platform.OS === 'ios') {
        vibratePattern(8);
    } else {
        vibratePattern([0, 8]);
    }
};

export const hapticSuccess = () => {
    // Tiny double-tick
    vibratePattern([0, 10, 40, 10]);
};


