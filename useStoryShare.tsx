import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, NativeModules, PixelRatio, Platform, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import StoryCard from './StoryCard';
import { buildStoryLayout, StoryLayout, StoryVariant } from './storyLayout';
import { buildChartCardLayout, ChartCardMode, ChartCardPoint } from './chartCardLayout';
import { buildShareMessage, buildShareUrl, canShareLift, CHART_SHARE_MESSAGE, CHART_SHARE_URL } from './shareCard';
import { Lift } from './types';
import { useTheme } from './theme';

// Native share sheet that hands Messages the 3:4 card and everyone else the
// story, and copies `link` for apps that drop the text
// (ios/liftbook/LiftbookShare.m)
const nativeShare: {
    share(options: { story: string; message: string; title: string; text: string; link: string }): Promise<boolean>;
} | undefined = Platform.OS === 'ios' ? NativeModules.LiftbookShare : undefined;

const VARIANTS: StoryVariant[] = ['story', 'message'];

// One share: both canvases plus what travels with them
interface CardShare {
    story: StoryLayout;
    message: StoryLayout;
    title: string;  // the share sheet's header
    text: string;   // sent with the image
    link: string;   // copied for apps that drop `text`
    failure: string;
}

// Share a lift or a chart as an image plus a link message. Screens render
// the returned `element` somewhere in their tree: while a share is in
// flight it mounts both cards (story and message) off-screen, captures them
// to PNGs once they've laid out and drawn, then opens the share sheet.
export const useStoryShare = (allLifts: Record<string, Lift>) => {
    const theme = useTheme();
    const [pending, setPending] = useState<CardShare | null>(null);
    const storyRef = useRef<View>(null);
    const messageRef = useRef<View>(null);
    const laidOutRef = useRef(new Set<StoryVariant>());
    const capturingRef = useRef(false);
    const giveUpRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const start = useCallback((share: CardShare) => {
        if (capturingRef.current) {
            return;
        }
        capturingRef.current = true;
        laidOutRef.current.clear();
        setPending(share);
    }, []);

    const shareLift = useCallback((lift: Lift | null | undefined) => {
        if (!lift || !canShareLift(lift)) {
            return;
        }
        const story = buildStoryLayout(lift, allLifts, 'story');
        const message = buildStoryLayout(lift, allLifts, 'message');
        if (story && message) {
            start({
                story,
                message,
                title: lift.title.trim() || 'Lift',
                text: buildShareMessage(lift),
                link: buildShareUrl(lift),
                failure: "Couldn't share this lift",
            });
        }
    }, [allLifts, start]);

    const shareChart = useCallback((movement: string, points: ChartCardPoint[], mode: ChartCardMode) => {
        const story = buildChartCardLayout(movement, points, mode, 'story');
        const message = buildChartCardLayout(movement, points, mode, 'message');
        if (story && message) {
            start({
                story,
                message,
                title: movement.trim() || 'Chart',
                text: CHART_SHARE_MESSAGE,
                link: CHART_SHARE_URL,
                failure: "Couldn't share this chart",
            });
        }
    }, [start]);

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
            Alert.alert(pending.failure);
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
            if (nativeShare) {
                const message = await captureRef(messageRef, { format: 'png', result: 'tmpfile' });
                await nativeShare.share({ story, message, title: pending.title, text: pending.text, link: pending.link });
            } else {
                await Share.share({ url: story, message: pending.text });
            }
        } catch {
            // dismissing the sheet resolves rather than throws, so this is a
            // real failure (capture or share sheet)
            Alert.alert(pending.failure);
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
    const element = pending ? (
        <View style={styles.offscreen} pointerEvents="none">
            <StoryCard ref={storyRef} layout={pending.story} scale={scale} colors={colors} onLayout={() => capture('story')} />
            <StoryCard ref={messageRef} layout={pending.message} scale={scale} colors={colors} onLayout={() => capture('message')} />
        </View>
    ) : null;

    return { shareLift, shareChart, element };
};

const styles = StyleSheet.create({
    // Laid out and drawn, but never visible
    offscreen: {
        position: 'absolute',
        top: 0,
        left: -10000,
    },
});
