git import React, { useState, useEffect, useRef } from 'react';
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
}) => {
    console.log('EntryFooter render:', {
        mode,
        firstPlaceholder,
        hasInitialValues: !!initialValues
    });

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

    const showWarningMessage = (message: string) => {
        setWarningMessage(message);
        setShowWarning(true);
        if (warningTimeout.current) {
            clearTimeout(warningTimeout.current);
        }
        warningTimeout.current = setTimeout(() => {
            setShowWarning(false);
        }, 3000);
    };

    useEffect(() => {
        // Auto-focus when adding sets (double mode), when entering a new lift title,
        // or when editing existing values with initialValues provided
        const isNewLift =
            mode === 'single' &&
            firstPlaceholder === 'Enter lift title...' &&
            !initialValues?.first;

        const isInteractionMode = mode !== 'hidden';

        const shouldAutoFocus =
            mode === 'double' ||
            isNewLift ||
            (initialValues != null && isInteractionMode);

        if (shouldAutoFocus) {
            if (userDismissedKeyboardRef.current) {
                console.log('EntryFooter skip auto-focus after user dismissal');
                userDismissedKeyboardRef.current = false;
                return;
            }
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
        }
    }, [mode, firstPlaceholder, initialValues]);

    useEffect(() => {
        const previousInitial = previousInitialValuesRef.current;
        const incomingFirst = initialValues?.first ?? undefined;
        const incomingSecond = initialValues?.second ?? undefined;
        const initialProvided = initialValues !== undefined;

        const hasFirstChanged = previousInitial?.first !== incomingFirst;
        const hasSecondChanged = previousInitial?.second !== incomingSecond;

        console.log('EntryFooter initialValues effect fired:', {
            previousFirst: previousInitial?.first,
            incomingFirst,
            previousSecond: previousInitial?.second,
            incomingSecond,
            initialProvided,
            hasFirstChanged,
            hasSecondChanged,
        });

        previousInitialValuesRef.current = {
            first: incomingFirst,
            second: incomingSecond,
        };

        if (!initialProvided) {
            if (previousInitial?.first !== undefined || previousInitial?.second !== undefined) {
                console.log('EntryFooter clearing values: initialValues removed');
                isProgrammaticUpdateRef.current = true;
                setFirstValue('');
                setSecondValue('');
                onFirstValueChange?.('');
            }
            return;
        }

        if (hasFirstChanged && incomingFirst !== undefined) {
            console.log('EntryFooter updating first value from initialValues');
            isProgrammaticUpdateRef.current = true;
            setFirstValue(incomingFirst);
            onFirstValueChange?.(incomingFirst);
        }

        if (hasSecondChanged && incomingSecond !== undefined) {
            console.log('EntryFooter updating second value from initialValues');
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

            console.log('Keyboard hidden event', {
                dismissedByUser: userDismissedKeyboardRef.current,
            });

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

    const handleSubmit = () => {
        const isWeightEntry = firstPlaceholder === 'Enter weight...';

        if (mode === 'single') {
            if (!firstValue.trim()) {
                showWarningMessage(isWeightEntry ? 'Please enter a weight' : 'Please enter a value');
                return;
            }
            if (isWeightEntry && !isValidNumber(firstValue)) {
                showWarningMessage('Please enter a valid positive number for weight');
                return;
            }
            onSubmit({ first: firstValue.trim() });
            setFirstValue('');
            onFirstValueChange?.('');
        } else if (mode === 'double') {
            if (!firstValue.trim()) {
                showWarningMessage('Please enter a weight');
                return;
            }
            if (!secondValue.trim()) {
                showWarningMessage('Please enter the number of reps');
                return;
            }
            if (!isValidNumber(firstValue)) {
                showWarningMessage('Please enter a valid positive number for weight');
                return;
            }
            if (!isValidNumber(secondValue)) {
                showWarningMessage('Please enter a valid positive number for reps');
                return;
            }
            onSubmit({ first: firstValue.trim(), second: secondValue.trim() });
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
                userDismissedKeyboardRef.current = true;
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
                            }
                        }}
                        onFocus={() => {
                            userDismissedKeyboardRef.current = false;
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
                            }}
                            onFocus={() => {
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
                {mode === 'single' && suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                        {suggestions.map((suggestion) => (
                            <TouchableOpacity
                                key={suggestion}
                                style={styles.suggestionPill}
                                onPress={() => {
                                    setFirstValue(suggestion);
                                    onFirstValueChange?.(suggestion);
                                    onSuggestionSelect?.(suggestion);
                                    setTimeout(() => {
                                        firstInputRef.current?.focus();
                                    }, 0);
                                }}
                            >
                                <Text style={styles.suggestionText}>{suggestion}</Text>
                            </TouchableOpacity>
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
        paddingHorizontal: 16,
        paddingBottom: 8,
        gap: 8,
    },
    suggestionPill: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#d0d0d0',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    suggestionText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
});

export default EntryFooter; 