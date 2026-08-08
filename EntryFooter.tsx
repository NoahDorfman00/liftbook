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

export type EntryMode = 'single' | 'double';

interface EntryFooterProps {
    mode: EntryMode;
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
    const insets = useSafeAreaInsets();
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    const firstInputRef = useRef<TextInput>(null);
    const secondInputRef = useRef<TextInput>(null);
    const isSubmitting = useRef(false);
    const warningTimeout = useRef<NodeJS.Timeout | null>(null);
    const keyboardHeight = useRef(new Animated.Value(0));
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

    // Focus the first input whenever the parent requests it
    useEffect(() => {
        if (focusRequest > 0) {
            const timeout = setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [focusRequest]);

    useEffect(() => {
        const keyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const keyboardHideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const keyboardWillShow = Keyboard.addListener(keyboardEventName, (e) => {
            const target = Math.max(0, e.endCoordinates.height - (insets.bottom || 0) - 8);
            if (Platform.OS === 'ios') {
                Animated.spring(keyboardHeight.current, {
                    toValue: target,
                    useNativeDriver: true,
                    tension: 65,
                    friction: 11,
                }).start();
            } else {
                Animated.timing(keyboardHeight.current, {
                    toValue: target,
                    duration: 100,
                    useNativeDriver: true,
                }).start();
            }
        });

        const keyboardWillHide = Keyboard.addListener(keyboardHideEventName, () => {
            if (Platform.OS === 'ios') {
                Animated.spring(keyboardHeight.current, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 65,
                    friction: 11,
                }).start();
            } else {
                Animated.timing(keyboardHeight.current, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }).start();
            }

            if (!isSubmitting.current && onKeyboardDismiss) {
                onKeyboardDismiss();
            }
        });

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
            if (warningTimeout.current) {
                clearTimeout(warningTimeout.current);
            }
        };
    }, [onKeyboardDismiss, insets.bottom]);

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
                        backgroundColor: '#f5f5f5',
                        transform: [
                            {
                                translateY: Animated.multiply(keyboardHeight.current, -1),
                            },
                        ],
                    }
                ]}
            >
                {showWarning && (
                    <View style={[
                        styles.warningContainer,
                        { backgroundColor: '#ffe5e3' }
                    ]}>
                        <Text style={[
                            styles.warningText,
                            { color: '#ff3b30', fontFamily: 'Schoolbell-Regular' }
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
                            { color: '#333' }
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
                        placeholderTextColor={'#999'}
                        returnKeyType={mode === 'single' ? 'done' : 'next'}
                        keyboardType={mode === 'double' ? 'numbers-and-punctuation' : 'default'}
                        onSubmitEditing={(e) => {
                            isSubmitting.current = true;
                            if (mode === 'single') {
                                // Use the event's text: the controlled prop can lag
                                // the native field by a keystroke on fast input
                                handleSubmit({ first: e.nativeEvent.text });
                            } else if (secondInputRef.current) {
                                secondInputRef.current.focus();
                            }
                            isSubmitting.current = false;
                        }}
                        blurOnSubmit={false}
                    />
                    {mode === 'double' && (
                        <TextInput
                            ref={secondInputRef}
                            style={[
                                styles.input,
                                styles.secondInput,
                                { color: '#333' }
                            ]}
                            value={secondValue}
                            onChangeText={(text) => {
                                onSecondValueChange(text);
                                if (showWarning) {
                                    clearWarning();
                                }
                            }}
                            placeholder={secondPlaceholder}
                            placeholderTextColor={'#999'}
                            keyboardType="numbers-and-punctuation"
                            returnKeyType="done"
                            onSubmitEditing={(e) => {
                                isSubmitting.current = true;
                                handleSubmit({ second: e.nativeEvent.text });
                                isSubmitting.current = false;
                            }}
                            blurOnSubmit={false}
                        />
                    )}
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
                                    <Text style={styles.suggestionText}>{suggestion}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
                {mode === 'double' && !!lastTimeNote && (
                    <View style={styles.lastTimeContainer}>
                        <Text style={styles.lastTimeText}>{lastTimeNote}</Text>
                    </View>
                )}
            </Animated.View>
        </PanGestureHandler>
    );
};

const styles = StyleSheet.create({
    container: {
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        width: '100%',
        paddingBottom: Platform.OS === 'ios' ? 8 : 8,
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
        borderColor: '#e0e0e0',
    },
    secondInput: {
        flex: 0.5,
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
        color: '#333',
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
        color: '#888',
        textAlign: 'center',
    },
});

export default EntryFooter;
