import React from 'react';
import Svg, { Path } from 'react-native-svg';

// Hand-drawn share glyph (box with an arrow up), matching the sketchy
// back/trash/chart icon style
const ShareIcon = ({ color }: { color: string }) => (
    <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path
            d="M9 11.9 Q6.3 11.6 6.2 12.3 Q5.8 16.6 6.1 21 Q6.1 21.8 7 21.9 Q13 22.5 19.1 21.8 Q19.9 21.7 19.9 20.9 Q20.3 16.5 19.9 12.2 Q19.9 11.6 17.2 11.9"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
        <Path
            d="M13 15.8 Q12.9 10 13.1 4.8"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
        />
        <Path
            d="M9.7 7.5 Q11.4 5.7 13 4 Q14.7 5.6 16.3 7.3"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </Svg>
);

export default ShareIcon;
