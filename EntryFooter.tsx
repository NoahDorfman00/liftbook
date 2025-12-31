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
    onSubmit: (values: { first: string; second?: string }) => void;
    initialValues?: { first: string; second?: string };
    firstPlaceholder?: string;
    secondPlaceholder?: string;
    onKeyboardDismiss?: () => void;
    suggestions?: string[];
    onSuggestionSelect?: (suggestion: string) => void;
    onFirstValueChange?: (value: string) => void;
    onFirstFieldFocus?: () => void;
    forceFocus?: boolean;
    shouldAutoFocusOnLoad?: boolean;
    focusTrigger?: number;
}

const isValidNumber = (value: string): boolean => {
    const numberRegex = /^\d*\.?\d+$/;
    return numberRegex.test(value) && parseFloat(value) > 0;
};

const EntryFooter: React.FC<EntryFooterProps> = ({
    mode,
    onSubmit,
    initialValues,
    firstPlaceholder = 'Enter movement name...',
    secondPlaceholder = 'Enter reps...',
    onKeyboardDismiss,
    suggestions = [],
    onSuggestionSelect,
    onFirstValueChange,
    onFirstFieldFocus,
    forceFocus = false,
    shouldAutoFocusOnLoad = false,
    focusTrigger = 0,
}) => {
    const insets = useSafeAreaInsets();
    const [firstValue, setFirstValue] = useState(initialValues?.first || '');
    const [secondValue, setSecondValue] = useState(initialValues?.second || '');
    
    // Debug: Log initial mount values and value changes
    React.useEffect(() => {
        console.log('[DEBUG EntryFooter] Component mounted/remounted with initialValues:', initialValues, 'firstValue:', firstValue);
    }, []);
    
    React.useEffect(() => {
        console.log('[DEBUG EntryFooter] firstValue changed to:', firstValue);
    }, [firstValue]);
    const [showWarning, setShowWarning] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    const firstInputRef = useRef<TextInput>(null);
    const secondInputRef = useRef<TextInput>(null);
    const isSubmitting = useRef(false);
    const warningTimeout = useRef<NodeJS.Timeout | null>(null);
    const keyboardHeight = useRef(new Animated.Value(0));
    const previousInitialValuesRef = useRef<{ first?: string; second?: string }>({
        first: initialValues?.first,
        second: initialValues?.second,
    });
    const isProgrammaticUpdateRef = useRef(false);
    const userDismissedKeyboardRef = useRef(false);
    const hasTriggeredDismissRef = useRef(false);
    const [activeField, setActiveField] = useState<'first' | 'second'>('first');

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

    // Clear warnings when mode, initialValues, or focusTrigger change (user switched to different item)
    useEffect(() => {
        setShowWarning(false);
        if (warningTimeout.current) {
            clearTimeout(warningTimeout.current);
            warningTimeout.current = null;
        }
    }, [mode, initialValues?.first, initialValues?.second, focusTrigger]);

    // Only focus when explicitly requested via forceFocus or shouldAutoFocusOnLoad
    useEffect(() => {
        if (forceFocus) {
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
        }
    }, [forceFocus]);

    // Auto-focus on initial load when shouldAutoFocusOnLoad is true
    useEffect(() => {
        if (shouldAutoFocusOnLoad) {
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
        }
    }, [shouldAutoFocusOnLoad]);

    // Focus first input when focusTrigger changes (for adding multiple sets)
    useEffect(() => {
        if (focusTrigger > 0) {
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
        }
    }, [focusTrigger]);

    useEffect(() => {
        const previousInitial = previousInitialValuesRef.current;
        const incomingFirst = initialValues?.first ?? undefined;
        const incomingSecond = initialValues?.second ?? undefined;
        const initialProvided = initialValues !== undefined;

        const hasFirstChanged = previousInitial?.first !== incomingFirst;
        const hasSecondChanged = previousInitial?.second !== incomingSecond;

        console.log('[DEBUG EntryFooter] initialValues sync effect:', {
            previousInitial,
            incomingFirst,
            incomingSecond,
            initialProvided,
            hasFirstChanged,
            hasSecondChanged,
            currentFirstValue: firstValue,
        });

        previousInitialValuesRef.current = {
            first: incomingFirst,
            second: incomingSecond,
        };

        if (!initialProvided) {
            if (previousInitial?.first !== undefined || previousInitial?.second !== undefined) {
                console.log('[DEBUG EntryFooter] Clearing values (no initial provided)');
                isProgrammaticUpdateRef.current = true;
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
            }
            return;
        }

        // Set the value if it has changed from previous initial OR if current value doesn't match incoming
        // This ensures the value is set correctly even on remount
        if (hasFirstChanged && incomingFirst !== undefined) {
            console.log('[DEBUG EntryFooter] Setting firstValue to:', incomingFirst, '(changed from previous initial)');
            isProgrammaticUpdateRef.current = true;
            setFirstValue(incomingFirst);
            onFirstValueChange?.(incomingFirst);
        } else if (incomingFirst !== undefined && firstValue !== incomingFirst && previousInitial?.first === undefined) {
            // Special case: if previousInitial was undefined (component just mounted/remounted)
            // and the current value doesn't match incoming, set it
            console.log('[DEBUG EntryFooter] Setting firstValue to:', incomingFirst, '(remount case, current:', firstValue, ')');
            isProgrammaticUpdateRef.current = true;
            setFirstValue(incomingFirst);
            onFirstValueChange?.(incomingFirst);
        }

        if (hasSecondChanged && incomingSecond !== undefined) {
            console.log('[DEBUG EntryFooter] Setting secondValue to:', incomingSecond);
            setSecondValue(incomingSecond);
        }
    }, [initialValues, onFirstValueChange, firstValue]);

    useEffect(() => {
        const keyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const keyboardHideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const keyboardWillShow = Keyboard.addListener(keyboardEventName, (e) => {
            const target = Math.max(0, e.endCoordinates.height - (insets.bottom || 0) - 8);
            if (Platform.OS === 'ios') {
                // Use spring animation to match iOS keyboard behavior more closely
                Animated.spring(keyboardHeight.current, {
                    toValue: target,
                    useNativeDriver: false,
                    tension: 65,
                    friction: 11,
                }).start();
            } else {
                Animated.timing(keyboardHeight.current, {
                    toValue: target,
                    duration: 100,
                    useNativeDriver: false,
                }).start();
            }
        });

        const keyboardWillHide = Keyboard.addListener(keyboardHideEventName, (e) => {
            if (Platform.OS === 'ios') {
                // Use spring animation to match iOS keyboard behavior more closely
                Animated.spring(keyboardHeight.current, {
                    toValue: 0,
                    useNativeDriver: false,
                    tension: 65,
                    friction: 11,
                }).start();
            } else {
                Animated.timing(keyboardHeight.current, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: false,
                }).start();
            }

            if (!isSubmitting.current && onKeyboardDismiss) {
                onKeyboardDismiss();
            }

            // Don't clear values if we have initialValues (editing existing item)
            // or if user explicitly dismissed keyboard
            if (!userDismissedKeyboardRef.current && !initialValues) {
                console.log('[DEBUG EntryFooter] Keyboard hide - clearing values (no initialValues)');
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
            } else {
                console.log('[DEBUG EntryFooter] Keyboard hide - NOT clearing values', {
                    userDismissedKeyboard: userDismissedKeyboardRef.current,
                    hasInitialValues: !!initialValues,
                });
            }

            userDismissedKeyboardRef.current = false;
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
        const isWeightEntry = firstPlaceholder === 'Enter weight...';

        const firstToUse = (override?.first ?? firstValue).trim();
        const secondToUse = (override?.second ?? secondValue).trim();

        if (mode === 'single') {
            if (!firstToUse) {
                showWarningMessage(isWeightEntry ? 'Please enter a weight' : 'Please enter a value');
                return;
            }
            if (isWeightEntry && !isValidNumber(firstToUse)) {
                showWarningMessage('Please enter a valid positive number for weight');
                return;
            }
            onSubmit({ first: firstToUse });
            setFirstValue('');
            onFirstValueChange?.('');
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
            setFirstValue('');
            setSecondValue('');
            onFirstValueChange?.('');
            // Don't auto-focus here - let the parent control focus via forceFocus prop
        }
    };

    const handleGestureEvent = React.useCallback(
        ({ nativeEvent }: { nativeEvent: { translationY: number } }) => {
            if (nativeEvent.translationY > 18 && !hasTriggeredDismissRef.current) {
                hasTriggeredDismissRef.current = true;
                // Treat this as an explicit "close and clear" gesture.
                userDismissedKeyboardRef.current = false;
                isProgrammaticUpdateRef.current = true;
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
                // Clear warning when swiping away
                if (warningTimeout.current) {
                    clearTimeout(warningTimeout.current);
                    warningTimeout.current = null;
                }
                setShowWarning(false);
                firstInputRef.current?.blur();
                secondInputRef.current?.blur();
                Keyboard.dismiss();
            }
        },
        []
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
                            const isProgrammatic = isProgrammaticUpdateRef.current;
                            isProgrammaticUpdateRef.current = false;
                            setFirstValue(text);
                            // Always call onFirstValueChange for user input, even if there was a recent programmatic update
                            // This ensures suggestions update on the first keystroke
                            // Only skip if this onChangeText was triggered by the programmatic update itself
                            if (!isProgrammatic) {
                                userDismissedKeyboardRef.current = false;
                                onFirstValueChange?.(text);
                                // Clear warning when user starts typing
                                if (showWarning) {
                                    if (warningTimeout.current) {
                                        clearTimeout(warningTimeout.current);
                                    }
                                    setShowWarning(false);
                                }
                            } else {
                                // Even if this was triggered by a programmatic update, if the text is different
                                // from what we set, it means the user has typed, so we should notify
                                // Check if text differs from the expected initial value
                                const expectedValue = initialValues?.first ?? '';
                                if (text !== expectedValue) {
                                    // User has modified the value, notify parent
                                    onFirstValueChange?.(text);
                                }
                            }
                        }}
                        onFocus={() => {
                            setActiveField('first');
                            userDismissedKeyboardRef.current = false;
                            onFirstFieldFocus?.();
                        }}
                        placeholder={firstPlaceholder}
                        placeholderTextColor={'#999'}
                        returnKeyType={mode === 'single' ? 'done' : 'next'}
                        keyboardType={firstPlaceholder === 'Enter weight...' ? 'numbers-and-punctuation' : 'default'}
                        onSubmitEditing={() => {
                            isSubmitting.current = true;
                            if (mode === 'single') {
                                handleSubmit();
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
                                const isProgrammatic = isProgrammaticUpdateRef.current;
                                isProgrammaticUpdateRef.current = false;
                                setSecondValue(text);
                                userDismissedKeyboardRef.current = false;
                                // Clear warning when user starts typing
                                if (showWarning) {
                                    if (warningTimeout.current) {
                                        clearTimeout(warningTimeout.current);
                                    }
                                    setShowWarning(false);
                                }
                            }}
                            onFocus={() => {
                                setActiveField('second');
                                userDismissedKeyboardRef.current = false;
                            }}
                            placeholder={secondPlaceholder}
                            placeholderTextColor={'#999'}
                            keyboardType="numbers-and-punctuation"
                            returnKeyType="done"
                            onSubmitEditing={() => {
                                isSubmitting.current = true;
                                handleSubmit();
                                isSubmitting.current = false;
                            }}
                            blurOnSubmit={false}
                        />
                    )}
                </View>
                {(
                    (mode === 'single' && suggestions.length > 0) ||
                    (mode === 'double' &&
                        suggestions.length > 0 &&
                        firstPlaceholder === 'Enter weight...' &&
                        activeField === 'first')
                ) && (
                        <View style={styles.suggestionsContainer}>
                            {suggestions.slice(0, 3).map((suggestion) => (
                                <View key={suggestion} style={styles.suggestionSlot}>
                                    <TouchableOpacity
                                        style={styles.suggestionTouchable}
                                        onPress={() => {
                                            onSuggestionSelect?.(suggestion);

                                            // In single mode (titles/movements), selecting a suggestion should submit immediately.
                                            if (mode === 'single') {
                                                handleSubmit({ first: suggestion });
                                                return;
                                            }

                                            // In double mode, suggestions are only shown for the weight field.
                                            // Selecting a suggestion should fill the weight and move focus to reps,
                                            // not submit the whole set.
                                            if (mode === 'double') {
                                                isProgrammaticUpdateRef.current = true;
                                                setFirstValue(suggestion);
                                                onFirstValueChange?.(suggestion);
                                                setTimeout(() => {
                                                    secondInputRef.current?.focus();
                                                }, 0);
                                            }
                                        }}
                                    >
                                        <Text style={styles.suggestionText}>{suggestion}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
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
});

export default EntryFooter; 