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

export type EntryMode = 'single' | 'double' | 'hidden';

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
}) => {
    const insets = useSafeAreaInsets();
    const [firstValue, setFirstValue] = useState(initialValues?.first || '');
    const [secondValue, setSecondValue] = useState(initialValues?.second || '');
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
    const hasAutoFocusedForCurrentSetRef = useRef(false);
    const previousSetKeyRef = useRef<string>('');
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

    useEffect(() => {
        // Auto-focus when adding sets (double mode), when entering a new lift title,
        // or when editing existing values with initialValues provided
        const isNewLift =
            mode === 'single' &&
            firstPlaceholder === 'Enter lift title...' &&
            !initialValues?.first;

        const isNewMovement =
            mode === 'single' &&
            firstPlaceholder === 'Enter movement name...' &&
            !initialValues?.first;

        const isInteractionMode = mode !== 'hidden';

        // When editing an existing set (both weight and reps provided), auto-focus weight initially
        // but only once - don't re-focus if user manually focuses reps
        const isEditingExistingSet = mode === 'double' &&
            initialValues?.first != null &&
            initialValues?.second != null;

        // Reset auto-focus tracking when the set being edited changes
        if (isEditingExistingSet) {
            const currentSetKey = `${initialValues?.first}-${initialValues?.second}`;
            if (previousSetKeyRef.current !== currentSetKey) {
                hasAutoFocusedForCurrentSetRef.current = false;
                previousSetKeyRef.current = currentSetKey;
            }
        } else {
            hasAutoFocusedForCurrentSetRef.current = false;
        }

        // Only auto-focus if explicitly requested on load, or for manual interactions (forceFocus)
        // For loads, only focus if shouldAutoFocusOnLoad is true
        // For manual interactions (clicking to add movement), use forceFocus
        const shouldAutoFocus =
            shouldAutoFocusOnLoad && (
                (mode === 'double' && (!isEditingExistingSet || !hasAutoFocusedForCurrentSetRef.current)) ||
                isNewLift ||
                isNewMovement ||
                (initialValues != null && isInteractionMode && !isEditingExistingSet)
            ) ||
            forceFocus;

        if (shouldAutoFocus) {
            if (userDismissedKeyboardRef.current) {
                userDismissedKeyboardRef.current = false;
                return;
            }
            setTimeout(() => {
                firstInputRef.current?.focus();
                if (isEditingExistingSet) {
                    hasAutoFocusedForCurrentSetRef.current = true;
                }
            }, 100);
        }
    }, [mode, firstPlaceholder, initialValues, forceFocus, shouldAutoFocusOnLoad]);

    // Explicit focus trigger when forceFocus prop is true (for manual interactions)
    useEffect(() => {
        if (forceFocus && mode !== 'hidden') {
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 150);
        }
    }, [forceFocus, mode]);

    useEffect(() => {
        const previousInitial = previousInitialValuesRef.current;
        const incomingFirst = initialValues?.first ?? undefined;
        const incomingSecond = initialValues?.second ?? undefined;
        const initialProvided = initialValues !== undefined;

        const hasFirstChanged = previousInitial?.first !== incomingFirst;
        const hasSecondChanged = previousInitial?.second !== incomingSecond;

        previousInitialValuesRef.current = {
            first: incomingFirst,
            second: incomingSecond,
        };

        if (!initialProvided) {
            if (previousInitial?.first !== undefined || previousInitial?.second !== undefined) {
                isProgrammaticUpdateRef.current = true;
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
            }
            return;
        }

        if (hasFirstChanged && incomingFirst !== undefined) {
            isProgrammaticUpdateRef.current = true;
            setFirstValue(incomingFirst);
            onFirstValueChange?.(incomingFirst);
        }

        if (hasSecondChanged && incomingSecond !== undefined) {
            setSecondValue(incomingSecond);
        }
    }, [initialValues, onFirstValueChange]);

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

            if (!userDismissedKeyboardRef.current) {
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
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
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 50);
        }
    };

    if (mode === 'hidden') {
        return null;
    }

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
                        { backgroundColor: '#ffebee' }
                    ]}>
                        <Text style={[
                            styles.warningText,
                            { color: '#c62828' }
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
        padding: 8,
        marginBottom: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    warningText: {
        fontSize: 14,
        fontWeight: '500',
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