import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Keyboard,
    Animated,
    Platform,
    TouchableOpacity,
    Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { useKeyboardAnimation } from 'react-native-keyboard-controller';
import { useTheme } from './theme';

export type EntryMode = 'single' | 'double';

interface EntryFooterProps {
    mode: EntryMode;
    /** Current keyboard height, owned by the parent screen */
    keyboardHeight: number;
    firstValue: string;
    secondValue: string;
    onFirstValueChange: (value: string) => void;
    onSecondValueChange: (value: string) => void;
    onSubmit: (values: { first: string; second?: string }) => void;
    firstPlaceholder?: string;
    secondPlaceholder?: string;
    onKeyboardDismiss?: () => void;
    suggestions?: string[];
    lastTimeNote?: string | null;
    onFirstFieldFocus?: () => void;
    /** Increment to focus the first input (0 = no request yet) */
    focusRequest?: number;
}

const isValidNumber = (value: string): boolean => {
    const numberRegex = /^\d*\.?\d+$/;
    return numberRegex.test(value) && parseFloat(value) > 0;
};

const EntryFooter: React.FC<EntryFooterProps> = ({
    mode,
    keyboardHeight,
    firstValue,
    secondValue,
    onFirstValueChange,
    onSecondValueChange,
    onSubmit,
    firstPlaceholder = 'Enter movement name...',
    secondPlaceholder = 'Enter reps...',
    onKeyboardDismiss,
    suggestions = [],
    lastTimeNote,
    onFirstFieldFocus,
    focusRequest = 0,
}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    const firstInputRef = useRef<TextInput>(null);
    const secondInputRef = useRef<TextInput>(null);
    const isSubmitting = useRef(false);
    const warningTimeout = useRef<NodeJS.Timeout | null>(null);
    const prevKeyboardHeightRef = useRef(0);
    const hasTriggeredDismissRef = useRef(false);

    const showWarningMessage = (message: string) => {
        setWarningMessage(message);
        setShowWarning(true);
        if (warningTimeout.current) {
            clearTimeout(warningTimeout.current);
        }
        warningTimeout.current = setTimeout(() => {
            setShowWarning(false);
            warningTimeout.current = null;
        }, 2500);
    };

    const clearWarning = () => {
        if (warningTimeout.current) {
            clearTimeout(warningTimeout.current);
            warningTimeout.current = null;
        }
        setShowWarning(false);
    };

    // Clear warnings when the editing context changes
    useEffect(() => {
        clearWarning();
    }, [mode, focusRequest]);

    // Focus the first input whenever the parent requests it. The input stays
    // mounted and focused across mode switches — its keyboardType prop just
    // changes, and the (patched) native side reloads the keyboard in place
    // without dismissing it. The ref guard keeps a mode change alone from
    // re-firing an old request and reopening the keyboard.
    const lastFocusRequestRef = useRef(0);
    useEffect(() => {
        if (focusRequest > lastFocusRequestRef.current) {
            lastFocusRequestRef.current = focusRequest;
            firstInputRef.current?.focus();
        }
    }, [focusRequest]);

    // The keyboard's live position (0 → -keyboardHeight), driven natively
    // per frame by keyboard-controller, so the footer rides the keyboard
    // exactly — correct curve, no lag, interactive dismissal included. The
    // offset backs the footer off by the safe-area inset + 8 the keyboard
    // already clears, clamping at 0 while the keyboard is down.
    const { height: keyboardPosition } = useKeyboardAnimation();
    const bottomOffset = (insets.bottom || 0) + 8;
    const translateY = React.useMemo(
        () => keyboardPosition.interpolate({
            inputRange: [-bottomOffset - 1, -bottomOffset],
            outputRange: [-1, 0],
            extrapolateRight: 'clamp',
        }),
        [keyboardPosition, bottomOffset]
    );

    // The parent-owned height is still the signal for logical dismissal:
    // a drop to zero outside a submit resets the editing state.
    useEffect(() => {
        const wasVisible = prevKeyboardHeightRef.current > 0;
        prevKeyboardHeightRef.current = keyboardHeight;
        if (keyboardHeight === 0 && wasVisible && !isSubmitting.current && onKeyboardDismiss) {
            onKeyboardDismiss();
        }
    }, [keyboardHeight, onKeyboardDismiss]);

    // Clear any pending warning timer on unmount
    useEffect(() => {
        return () => {
            if (warningTimeout.current) {
                clearTimeout(warningTimeout.current);
            }
        };
    }, []);

    const handleSubmit = (override?: { first?: string; second?: string }) => {
        const firstToUse = (override?.first ?? firstValue).trim();
        const secondToUse = (override?.second ?? secondValue).trim();

        if (mode === 'single') {
            if (!firstToUse) {
                showWarningMessage('Please enter a value');
                return;
            }
            onSubmit({ first: firstToUse });
        } else if (mode === 'double') {
            if (!firstToUse) {
                showWarningMessage('Please enter a weight');
                return;
            }
            if (!secondToUse) {
                showWarningMessage('Please enter the number of reps');
                return;
            }
            if (!isValidNumber(firstToUse)) {
                showWarningMessage('Please enter a valid positive number for weight');
                return;
            }
            if (!isValidNumber(secondToUse)) {
                showWarningMessage('Please enter a valid positive number for reps');
                return;
            }
            onSubmit({ first: firstToUse, second: secondToUse });
        }
    };

    const handleGestureEvent = React.useCallback(
        ({ nativeEvent }: { nativeEvent: { translationY: number } }) => {
            if (nativeEvent.translationY > 18 && !hasTriggeredDismissRef.current) {
                hasTriggeredDismissRef.current = true;
                // Treat this as an explicit "close and clear" gesture.
                onFirstValueChange('');
                onSecondValueChange('');
                clearWarning();
                firstInputRef.current?.blur();
                secondInputRef.current?.blur();
                Keyboard.dismiss();
            }
        },
        [onFirstValueChange, onSecondValueChange]
    );

    const handleGestureStateChange = React.useCallback(
        ({ nativeEvent }: { nativeEvent: { state: GestureState } }) => {
            if (
                nativeEvent.state === GestureState.END ||
                nativeEvent.state === GestureState.CANCELLED ||
                nativeEvent.state === GestureState.FAILED
            ) {
                hasTriggeredDismissRef.current = false;
            }
        },
        []
    );

    return (
        <PanGestureHandler
            onGestureEvent={handleGestureEvent}
            onHandlerStateChange={handleGestureStateChange}
            activeOffsetY={10}
        >
            <Animated.View
                style={[
                    styles.container,
                    {
                        backgroundColor: theme.surface,
                        borderTopColor: theme.line,
                        transform: [{ translateY }],
                    }
                ]}
            >
                {/* When the footer is translated above the keyboard, this fills
                    the gap below it (visible around the keyboard's rounded
                    corners) so the background reaches the screen bottom. */}
                <View
                    pointerEvents="none"
                    style={[styles.bottomExtension, { backgroundColor: theme.surface }]}
                />
                {showWarning && (
                    <View style={[
                        styles.warningContainer,
                        { backgroundColor: theme.warningBackground }
                    ]}>
                        <Text style={[
                            styles.warningText,
                            { color: theme.warningText, fontFamily: 'Schoolbell-Regular' }
                        ]}>
                            {warningMessage}
                        </Text>
                    </View>
                )}
                <View style={styles.inputContainer}>
                    <TextInput
                        ref={firstInputRef}
                        style={[
                            styles.input,
                            { color: theme.textStrong, borderColor: theme.line }
                        ]}
                        value={firstValue}
                        onChangeText={(text) => {
                            onFirstValueChange(text);
                            if (showWarning) {
                                clearWarning();
                            }
                        }}
                        onFocus={() => {
                            onFirstFieldFocus?.();
                        }}
                        placeholder={firstPlaceholder}
                        placeholderTextColor={theme.textTertiary}
                        keyboardAppearance={theme.isDark ? 'dark' : 'light'}
                        // Changing these while focused swaps the keyboard
                        // layout in place — no remount, no responder change
                        // (patches/react-native adds the missing Fabric
                        // reloadInputViews call that makes this live-update)
                        returnKeyType={mode === 'single' ? 'done' : 'next'}
                        keyboardType={mode === 'double' ? 'numbers-and-punctuation' : 'default'}
                        onSubmitEditing={(e) => {
                            isSubmitting.current = true;
                            if (mode === 'single') {
                                // Use the event's text: the controlled prop can lag
                                // the native field by a keystroke on fast input
                                handleSubmit({ first: e.nativeEvent.text });
                            } else {
                                secondInputRef.current?.focus();
                            }
                            isSubmitting.current = false;
                        }}
                        blurOnSubmit={false}
                    />
                    <TextInput
                        ref={secondInputRef}
                        style={[
                            styles.input,
                            styles.secondInput,
                            { color: theme.textStrong, borderColor: theme.line },
                            mode === 'single' && styles.detachedInput,
                        ]}
                        pointerEvents={mode === 'double' ? 'auto' : 'none'}
                        value={secondValue}
                        onChangeText={(text) => {
                            onSecondValueChange(text);
                            if (showWarning) {
                                clearWarning();
                            }
                        }}
                        placeholder={secondPlaceholder}
                        placeholderTextColor={theme.textTertiary}
                        keyboardAppearance={theme.isDark ? 'dark' : 'light'}
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        onSubmitEditing={(e) => {
                            isSubmitting.current = true;
                            handleSubmit({ second: e.nativeEvent.text });
                            isSubmitting.current = false;
                        }}
                        blurOnSubmit={false}
                    />
                </View>
                {mode === 'single' && suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                        {suggestions.slice(0, 3).map((suggestion) => (
                            <View key={suggestion} style={styles.suggestionSlot}>
                                <TouchableOpacity
                                    style={styles.suggestionTouchable}
                                    // Selecting a suggestion submits it immediately
                                    onPress={() => handleSubmit({ first: suggestion })}
                                >
                                    <Text style={[styles.suggestionText, { color: theme.textStrong }]}>{suggestion}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
                {mode === 'double' && !!lastTimeNote && (
                    <View style={styles.lastTimeContainer}>
                        <Text style={[styles.lastTimeText, { color: theme.textMuted }]}>{lastTimeNote}</Text>
                    </View>
                )}
            </Animated.View>
        </PanGestureHandler>
    );
};

const styles = StyleSheet.create({
    container: {
        borderTopWidth: 1,
        width: '100%',
        paddingBottom: Platform.OS === 'ios' ? 8 : 8,
    },
    bottomExtension: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        height: 600,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
    input: {
        flex: 1,
        height: 40,
        backgroundColor: 'transparent',
        borderRadius: 20,
        paddingHorizontal: 16,
        marginRight: 8,
        borderWidth: 1,
    },
    secondInput: {
        flex: 0.5,
    },
    // Keeps the reps input mounted (and focusable) in single mode so a
    // focused reps field never unmounts mid-transition
    detachedInput: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        opacity: 0,
    },
    warningContainer: {
        padding: 10,
        marginBottom: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    warningText: {
        fontSize: 16,
    },
    suggestionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingBottom: 8,
    },
    suggestionSlot: {
        flex: 1,
        alignItems: 'center',
    },
    suggestionTouchable: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    suggestionText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        textAlign: 'center',
    },
    lastTimeContainer: {
        paddingHorizontal: 32,
        paddingBottom: 8,
        alignItems: 'center',
    },
    lastTimeText: {
        fontSize: 16,
        fontFamily: 'Schoolbell',
        textAlign: 'center',
    },
});

export default EntryFooter;
