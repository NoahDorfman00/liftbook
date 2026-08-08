import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';

// Shared machinery for the app's edge drawers (the charts screen's
// movement sheet, the editor's date dropdown). The drawer's animated
// height is the single source of truth for the open/close motion: siblings
// are flex-sized against it, so they grow and shrink frame-by-frame with
// the drawer — one cohesive animation for taps, drags, and flicks alike.
//
// `direction` is the edge the drawer lives on: a 'bottom' drawer opens by
// dragging its handle up, a 'top' drawer by dragging down. `extraHeightSV`
// lets the open height grow at runtime (the charts sheet adds the keyboard
// overlap); leave it at 0 for fixed-height drawers.
//
// The handle gesture is RNGH pan + tap composed with Exclusive, so the
// tap can't steal touches from the drag the way an RN touchable would.
export function useDrawer(
    baseHeight: number,
    direction: 'top' | 'bottom',
    onOpenChange?: (open: boolean) => void,
) {
    const [isOpen, setIsOpen] = useState(false);
    const openRef = useRef(false);
    const heightSV = useSharedValue(0);
    const extraHeightSV = useSharedValue(0);
    const dragStartH = useSharedValue(0);
    const pressed = useSharedValue(false);

    // 0 = chevron at rest (drawer closed), 1 = flipped 180° (drawer open)
    const chevronFlip = useRef(new Animated.Value(0)).current;
    const chevronRotate = useRef(
        chevronFlip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
    ).current;

    // State and side-effects of a transition. The gesture animates the
    // height itself, so this stays purely on the React side; setOpen
    // additionally drives the height for taps and programmatic changes.
    const commitOpenState = useCallback((open: boolean) => {
        if (openRef.current === open) return;
        openRef.current = open;
        Animated.timing(chevronFlip, {
            toValue: open ? 1 : 0,
            duration: 200,
            useNativeDriver: true,
        }).start();
        setIsOpen(open);
        onOpenChange?.(open);
    }, [chevronFlip, onOpenChange]);

    const setOpen = useCallback((open: boolean) => {
        if (openRef.current === open) return;
        heightSV.value = withTiming(open ? baseHeight + extraHeightSV.value : 0, { duration: 220 });
        commitOpenState(open);
    }, [commitOpenState, heightSV, extraHeightSV, baseHeight]);

    const toggle = useCallback(() => {
        setOpen(!openRef.current);
    }, [setOpen]);

    // Dragging the handle rides the drawer height directly (keyboard-style);
    // release settles open or closed by position and velocity. A tap toggles.
    // panelSwipeGesture is the same drag without the tap, for swipeable
    // regions inside the drawer itself — a separate instance because a
    // gesture object can only be attached to one GestureDetector.
    const { handleGesture, panelSwipeGesture } = useMemo(() => {
        // Dragging away from the drawer's edge grows it
        const sign = direction === 'bottom' ? -1 : 1;
        const makePan = () =>
            Gesture.Pan()
                .activeOffsetY([-12, 12])
                .failOffsetX([-20, 20])
                .onStart(() => {
                    dragStartH.value = heightSV.value;
                })
                .onUpdate((e) => {
                    const openH = baseHeight + extraHeightSV.value;
                    heightSV.value = Math.min(Math.max(dragStartH.value + sign * e.translationY, 0), openH);
                })
                .onEnd((e) => {
                    const openH = baseHeight + extraHeightSV.value;
                    const towardOpen = sign * e.velocityY;
                    const shouldOpen =
                        towardOpen > 500 ? true :
                        towardOpen < -500 ? false :
                        heightSV.value > openH / 2;
                    heightSV.value = withTiming(shouldOpen ? openH : 0, { duration: 180 });
                    runOnJS(commitOpenState)(shouldOpen);
                });
        const tap = Gesture.Tap()
            .maxDistance(12)
            .onBegin(() => {
                pressed.value = true;
            })
            .onFinalize(() => {
                pressed.value = false;
            })
            .onEnd(() => {
                runOnJS(toggle)();
            });
        return {
            handleGesture: Gesture.Exclusive(makePan(), tap),
            panelSwipeGesture: makePan(),
        };
    }, [direction, baseHeight, heightSV, extraHeightSV, dragStartH, pressed, commitOpenState, toggle]);

    const drawerStyle = useAnimatedStyle(() => ({
        height: heightSV.value,
    }));
    // Press feedback for the handle's label row, not the whole handle
    const pressedStyle = useAnimatedStyle(() => ({
        opacity: withTiming(pressed.value ? 0.5 : 1, { duration: 80 }),
    }));

    return {
        isOpen,
        setOpen,
        toggle,
        heightSV,
        extraHeightSV,
        handleGesture,
        panelSwipeGesture,
        drawerStyle,
        pressedStyle,
        chevronRotate,
    };
}
