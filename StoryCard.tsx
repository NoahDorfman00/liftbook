import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Defs, Line, Path, Pattern } from 'react-native-svg';
import {
    ASCENT,
    STORY_WIDTH,
    StoryBar,
    StoryLayout,
    StoryText,
} from './storyLayout';

export interface StoryColors {
    paper: string;
    ink: string;
    secondary: string;
    rule: string;
}

interface StoryCardProps {
    layout: StoryLayout;
    colors: StoryColors;
    /** points per design pixel — 1 / PixelRatio so the capture is exactly 1080px wide */
    scale: number;
    onLayout?: () => void;
}

// Deterministic jitter so each bar looks hand-drawn but renders identically
// every time (react-native-svg has no turbulence filter, which is what the
// prototype used for the wobble).
const jitter = (seed: number): number => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
};

// A rounded bar outline with slightly wobbly edges and corners
export const pencilBarPath = (bar: StoryBar, seed: number): string => {
    const { x, width, height, radius } = bar;
    const top = bar.bottom - height;
    const r = Math.min(radius, width / 2, height / 2);
    const w = (k: number) => jitter(seed * 13 + k) * Math.max(1, bar.strokeWidth * 0.45);
    const left = x + w(1);
    const right = x + width + w(2);
    const yTop = top + w(3);
    const yBottom = bar.bottom + w(4);
    return [
        `M ${left + r} ${yTop}`,
        `Q ${(left + right) / 2} ${yTop + w(5)} ${right - r} ${yTop + w(6) * 0.5}`,
        `Q ${right} ${yTop} ${right} ${yTop + r}`,
        `Q ${right + w(7)} ${(yTop + yBottom) / 2} ${right} ${yBottom - r}`,
        `Q ${right} ${yBottom} ${right - r} ${yBottom}`,
        `Q ${(left + right) / 2} ${yBottom + w(8)} ${left + r} ${yBottom}`,
        `Q ${left} ${yBottom} ${left} ${yBottom - r}`,
        `Q ${left + w(9)} ${(yTop + yBottom) / 2} ${left} ${yTop + r}`,
        `Q ${left} ${yTop} ${left + r} ${yTop}`,
        'Z',
    ].join(' ');
};

// The share image (1080x1920 story, or the content-height message variant). Bars and rules are one SVG in design pixels;
// text is native Text (Schoolbell + color emoji, which SVG text can't do on
// iOS), positioned so each baseline lands where the layout puts it.
const StoryCard = React.forwardRef<View, StoryCardProps>(({ layout, colors, scale, onLayout }, ref) => {
    const px = (v: number) => v * scale;

    const textStyle = (item: StoryText) => {
        const top = px(item.baseline - ASCENT * item.size);
        const base = {
            position: 'absolute' as const,
            top,
            fontFamily: 'Schoolbell',
            fontSize: px(item.size),
            color: item.color === 'ink' ? colors.ink : colors.secondary,
        };
        if (item.align === 'right') {
            return { ...base, left: 0, width: px(item.x), textAlign: 'right' as const };
        }
        if (item.align === 'center') {
            return { ...base, left: px(item.x - 400), width: px(800), textAlign: 'center' as const };
        }
        return { ...base, left: px(item.x), width: px(STORY_WIDTH - item.x) };
    };

    return (
        <View
            ref={ref}
            collapsable={false}
            onLayout={onLayout}
            style={[styles.card, { width: px(STORY_WIDTH), height: px(layout.height), backgroundColor: colors.paper }]}
        >
            <Svg
                width={px(STORY_WIDTH)}
                height={px(layout.height)}
                viewBox={`0 0 ${STORY_WIDTH} ${layout.height}`}
                style={StyleSheet.absoluteFill}
            >
                <Defs>
                    {/* 45° pencil hatching drawn into the tile itself (with the
                        corner pieces that make it seamless) — react-native-svg
                        doesn't honor patternTransform rotation */}
                    <Pattern id="hatch" width={12} height={12} patternUnits="userSpaceOnUse">
                        <Path
                            d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9"
                            stroke={colors.ink}
                            strokeWidth={2.6}
                            strokeLinecap="square"
                        />
                    </Pattern>
                </Defs>
                {layout.rules.map((y) => (
                    <Line key={`rule-${y}`} x1={0} y1={y} x2={STORY_WIDTH} y2={y} stroke={colors.rule} strokeWidth={2} />
                ))}
                {layout.bars.map((bar, i) => (
                    <Path
                        key={`bar-${i}`}
                        d={pencilBarPath(bar, i + 1)}
                        fill="url(#hatch)"
                        stroke={colors.ink}
                        strokeWidth={bar.strokeWidth}
                        strokeLinejoin="round"
                    />
                ))}
            </Svg>

            <Image
                source={require('./assets/barbell.png')}
                style={[styles.logo, {
                    left: px(layout.logo.x),
                    top: px(layout.logo.y),
                    width: px(layout.logo.width),
                    height: px(layout.logo.height),
                    tintColor: colors.ink,
                }]}
            />

            {layout.texts.map((item, i) => (
                <Text key={`text-${i}`} style={textStyle(item)} numberOfLines={1} allowFontScaling={false}>
                    {item.text}
                </Text>
            ))}
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
    },
    logo: {
        position: 'absolute',
    },
});

export default StoryCard;
