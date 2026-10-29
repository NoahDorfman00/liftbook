import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, NativeModules, PixelRatio, Platform, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import StoryCard from './StoryCard';
import { buildStoryLayout, StoryVariant } from './storyLayout';
import { buildShareMessage, canShareLift } from './shareCard';
import { Lift } from './types';
import { useTheme } from './theme';

// Native share sheet that hands Messages the 3:4 card and everyone else the
// story (ios/liftbook/LiftbookShare.m)
const nativeShare: { share(options: { story: string; message: string; title: string; text: string }): Promise<boolean> } | undefined =
    Platform.OS === 'ios' ? NativeModules.LiftbookShare : undefined;

const VARIANTS: StoryVariant[] = ['story', 'message'];

// Share a lift as an image plus a "Try it →" link message. Screens render
// the returned `element` somewhere in their tree: while a share is in
// flight it mounts both cards (story and message) off-screen, captures them
// to PNGs once they've laid out and drawn, then opens the share sheet.
export const useStoryShare = (allLifts: Record<string, Lift>) => {
    const theme = useTheme();
    const [pending, setPending] = useState<Lift | null>(null);
    const storyRef = useRef<View>(null);
    const messageRef = useRef<View>(null);
    const laidOutRef = useRef(new Set<StoryVariant>());
    const capturingRef = useRef(false);
    const giveUpRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const layouts = useMemo(
        () => (pending
            ? { story: buildStoryLayout(pending, allLifts, 'story'), message: buildStoryLayout(pending, allLifts, 'message') }
            : null),
        [pending, allLifts]
    );

    const shareLift = useCallback((lift: Lift | null | undefined) => {
        if (!lift || !canShareLift(lift) || capturingRef.current) {
            return;
        }
        capturingRef.current = true;
        laidOutRef.current.clear();
        setPending(lift);
    }, []);

    // Capture once the cards have laid out and had a moment to draw (fonts,
    // SVG, the logo asset). Never leave a share stuck: if they never lay
    // out, give up after a bit. (Only until capture starts — the share sheet
    // can stay open as long as the user likes.)
    useEffect(() => {
        if (!pending) {
            return;
        }
        giveUpRef.current = setTimeout(() => {
            capturingRef.current = false;
            setPending(null);
            Alert.alert("Couldn't share this lift");
        }, 8000);
        return () => clearTimeout(giveUpRef.current);
    }, [pending]);

    const capture = useCallback(async (variant: StoryVariant) => {
        laidOutRef.current.add(variant);
        if (!pending || laidOutRef.current.size < VARIANTS.length || !storyRef.current || !messageRef.current) {
            return;
        }
        laidOutRef.current.clear(); // capture once, even if a card re-lays out
        clearTimeout(giveUpRef.current);
        try {
            await new Promise((resolve) => setTimeout(resolve, 250));
            // No width/height: view-shot reads those in points. The cards are
            // laid out at 1080/PixelRatio points, so the native captures are
            // already exactly 1080 pixels wide.
            const story = await captureRef(storyRef, { format: 'png', result: 'tmpfile' });
            const text = buildShareMessage(pending);
            if (nativeShare) {
                const message = await captureRef(messageRef, { format: 'png', result: 'tmpfile' });
                await nativeShare.share({ story, message, title: pending.title.trim() || 'Lift', text });
            } else {
                await Share.share({ url: story, message: text });
            }
        } catch {
            // dismissing the sheet resolves rather than throws, so this is a
            // real failure (capture or share sheet)
            Alert.alert("Couldn't share this lift");
        } finally {
            capturingRef.current = false;
            setPending(null);
        }
    }, [pending]);

    // Rendered at 1080/PixelRatio points so the captures are native resolution
    const scale = 1 / PixelRatio.get();
    const colors = {
        paper: theme.paper,
        ink: theme.textStrong,
        secondary: theme.textSecondary,
        rule: theme.line,
    };
    const element = layouts?.story && layouts.message ? (
        <View style={styles.offscreen} pointerEvents="none">
            <StoryCard ref={storyRef} layout={layouts.story} scale={scale} colors={colors} onLayout={() => capture('story')} />
            <StoryCard ref={messageRef} layout={layouts.message} scale={scale} colors={colors} onLayout={() => capture('message')} />
        </View>
    ) : null;

    return { shareLift, element };
};

const styles = StyleSheet.create({
    // Laid out and drawn, but never visible
    offscreen: {
        position: 'absolute',
        top: 0,
        left: -10000,
    },
});
