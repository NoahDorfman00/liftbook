import { useColorScheme } from 'react-native';

export interface Theme {
    /** For native components that take a themeVariant/textColor instead of styles */
    isDark: boolean;
    /** Notebook page background */
    paper: string;
    /** Headers, footers, and bars */
    surface: string;
    /** Modal scrim */
    overlay: string;
    /** Ink: titles, movement names, set text */
    textPrimary: string;
    /** Headers, dates, inputs */
    textStrong: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    placeholder: string;
    /** Text while its row is being edited or pressed */
    editingText: string;
    /** Borders, separators, and the ruled notebook lines */
    line: string;
    /** Tint for the hand-drawn PNG icons */
    icon: string;
    chartGrid: string;
    chartAxis: string;
    chartMax: string;
    chartAvg: string;
    chartMin: string;
    warningBackground: string;
    warningText: string;
    destructive: string;
}

export const lightTheme: Theme = {
    isDark: false,
    paper: '#fff',
    surface: '#f5f5f5',
    overlay: 'rgba(0, 0, 0, 0.5)',
    textPrimary: '#000',
    textStrong: '#333',
    textSecondary: '#666',
    textTertiary: '#999',
    textMuted: '#888',
    placeholder: '#9e9e9e',
    editingText: '#6d6d6d',
    line: '#e0e0e0',
    icon: '#000',
    chartGrid: '#d4d4d4',
    chartAxis: '#999',
    chartMax: '#333',
    chartAvg: '#777',
    chartMin: '#bbb',
    warningBackground: '#ffe5e3',
    warningText: '#ff3b30',
    destructive: '#ff3b30',
};

export const darkTheme: Theme = {
    isDark: true,
    paper: '#1c1c1e',
    surface: '#2c2c2e',
    overlay: 'rgba(0, 0, 0, 0.6)',
    textPrimary: '#f2f2f2',
    textStrong: '#d6d6d6',
    textSecondary: '#a0a0a5',
    textTertiary: '#7c7c82',
    textMuted: '#8e8e93',
    placeholder: '#6e6e73',
    editingText: '#b3b3b8',
    line: '#3a3a3c',
    icon: '#e5e5e7',
    chartGrid: '#3a3a3c',
    chartAxis: '#6e6e73',
    chartMax: '#e5e5e7',
    chartAvg: '#98989d',
    chartMin: '#55555a',
    warningBackground: '#3d1f1d',
    warningText: '#ff6961',
    destructive: '#ff453a',
};

// Themes are module-level constants, so the returned reference only changes
// when the scheme flips — safe to pass into memoized components.
export function useTheme(): Theme {
    return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
