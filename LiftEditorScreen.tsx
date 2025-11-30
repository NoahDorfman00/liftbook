import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Text,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Keyboard,
    Image,
    LayoutChangeEvent,
    LayoutRectangle,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import EntryFooter, { EntryMode } from './EntryFooter';
import MessageBubble from './MessageBubble';
import { RootStackParamList } from './types';
import { retrieveLift, retrieveLifts, saveLiftLocally, deleteLiftLocally } from './utils';
import { DEFAULT_LIFT_TITLES, DEFAULT_MOVEMENTS } from './suggestions';

// Toggle to show/hide debug outlines for alignment debugging
const DEBUG_OUTLINES_ENABLED = false;

type LiftEditorScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftEditor'>;
type LiftEditorScreenRouteProp = RouteProp<RootStackParamList, 'LiftEditor'>;

interface Set {
    weight: string;
    reps: string;
}

interface Movement {
    name: string;
    sets: Set[];
}

interface Lift {
    id: string;
    date: string;
    title: string;
    movements: Movement[];
}

const RuledLines = () => {
    const lines = Array.from({ length: 50 }, (_, i) => (
        <View
            key={i}
            style={[
                styles.ruledLine,
                { top: i * 24 } // Start at 0px from top, every 24px
            ]}
        />
    ));
    return <>{lines}</>;
};

const LiftEditorScreen: React.FC = () => {
    const navigation = useNavigation<LiftEditorScreenNavigationProp>();
    const route = useRoute<LiftEditorScreenRouteProp>();
    const [isLoading, setIsLoading] = useState(!!route.params?.liftId);

    const [lift, setLift] = useState<Lift>({
        id: route.params?.liftId || Date.now().toString(),
        date: route.params?.date || (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        })(),
        title: '',
        movements: [],
    });

    const [entryMode, setEntryMode] = useState<EntryMode>('single');
    const [editingTarget, setEditingTarget] = useState<'none' | 'title' | 'movementName' | 'set'>('none');
    const [editingMovementIndex, setEditingMovementIndex] = useState<number | null>(null);
    const [editingSetIndex, setEditingSetIndex] = useState<number | null>(null);
    const [isAddingNewMovement, setIsAddingNewMovement] = useState(false);
    const [allLifts, setAllLifts] = useState<{ [id: string]: Lift }>({});
    const [firstInputValue, setFirstInputValue] = useState('');
    const [pendingDeleteMovementIndex, setPendingDeleteMovementIndex] = useState<number | null>(null);
    const [pendingDeleteSet, setPendingDeleteSet] = useState<{ movementIndex: number; setIndex: number } | null>(null);
    const [shouldAutoFocusOnLoad, setShouldAutoFocusOnLoad] = useState(false);
    const [shouldFocusSetAfterMovementSubmit, setShouldFocusSetAfterMovementSubmit] = useState(false);
    const [shouldFocusSetOnEmptyLineClick, setShouldFocusSetOnEmptyLineClick] = useState(false);

    const scrollViewRef = useRef<ScrollView>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);
    const titleLayoutRef = useRef<LayoutRectangle | null>(null);
    const movementLayoutsRef = useRef<Record<number, LayoutRectangle>>({});
    const setLayoutsRef = useRef<Record<string, LayoutRectangle>>({});
    const addSetLayoutsRef = useRef<Record<number, LayoutRectangle>>({});
    const scrollRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const NEW_MOVEMENT_INDEX = -1;

    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
        const [year, month, day] = lift.date.split('-').map(Number);
        return new Date(year, month - 1, day);
    });

    const isSubmitting = useRef<boolean>(false);

    useEffect(() => {
        const loadAllLifts = async () => {
            const liftsMap = await retrieveLifts();
            setAllLifts(liftsMap);
        };

        loadAllLifts();
    }, []);

    useEffect(() => {
        console.log('EntryMode changed:', {
            mode: entryMode,
            hasLiftId: !!route.params?.liftId,
            title: lift.title,
            editingMovementIndex,
            editingSetIndex,
            editingTarget
        });
    }, [entryMode, route.params?.liftId, lift.title, editingMovementIndex, editingSetIndex, editingTarget]);

    useEffect(() => {
        console.log('LiftEditor mount effect:', {
            hasLiftId: !!route.params?.liftId,
            liftId: route.params?.liftId,
            currentTitle: lift.title,
            initialEntryMode: entryMode
        });

        if (route.params?.liftId) {
            // Load existing lift data
            loadLift(route.params.liftId);
        } else {
            // New lift - focus the title input
            console.log('Setting up new lift state');
            setEntryMode('single');
            setEditingMovementIndex(null);
            setEditingSetIndex(null);
            setEditingTarget('title');
            setIsAddingNewMovement(false);
            setShouldAutoFocusOnLoad(true);
        }
    }, [route.params?.liftId]);

    useEffect(() => {
        const keyboardWillShow = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                console.log('LiftEditor - Keyboard showing:', {
                    keyboardHeight: e.endCoordinates.height,
                    screenHeight: e.endCoordinates.screenY,
                    timestamp: Date.now()
                });
                setKeyboardHeight(e.endCoordinates.height);
            }
        );

        const keyboardWillHide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => {
                console.log('LiftEditor - Keyboard hiding, timestamp:', Date.now());
                setKeyboardHeight(0);
            }
        );

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
        };
    }, []);

    useEffect(() => {
        if (!lift.title) {
            titleLayoutRef.current = null;
        }
    }, [lift.title]);

    const scrollToActiveEditingTarget = React.useCallback(() => {
        if (!scrollViewRef.current) {
            console.log('scrollToActiveEditingTarget skipped: no scrollViewRef');
            return false;
        }

        let targetY: number | null = null;

        if (editingTarget === 'title') {
            targetY = titleLayoutRef.current?.y ?? 0;
        } else if (editingTarget === 'movementName' && editingMovementIndex !== null) {
            const movementLayout = movementLayoutsRef.current[editingMovementIndex];
            if (movementLayout) {
                targetY = movementLayout.y;
            }
        } else if (editingTarget === 'set' && editingMovementIndex !== null) {
            const movementLayout = movementLayoutsRef.current[editingMovementIndex];
            const movement = editingMovementIndex >= 0 ? lift.movements[editingMovementIndex] : undefined;
            if (movementLayout) {
                if (movement && editingSetIndex != null && editingSetIndex < movement.sets.length) {
                    const setLayout = setLayoutsRef.current[`${editingMovementIndex}-${editingSetIndex}`];
                    if (setLayout) {
                        targetY = movementLayout.y + setLayout.y;
                    }
                } else {
                    const addSetLayout = addSetLayoutsRef.current[editingMovementIndex];
                    if (addSetLayout) {
                        targetY = movementLayout.y + addSetLayout.y;
                    } else {
                        targetY = movementLayout.y + movementLayout.height;
                    }
                }
            }
        }

        if (targetY == null) {
            console.log('scrollToActiveEditingTarget no target', {
                editingTarget,
                editingMovementIndex,
                editingSetIndex,
                hasTitleLayout: !!titleLayoutRef.current,
                hasMovementLayout: editingMovementIndex != null ? !!movementLayoutsRef.current[editingMovementIndex] : null,
                hasSetLayout: editingMovementIndex != null && editingSetIndex != null
                    ? !!setLayoutsRef.current[`${editingMovementIndex}-${editingSetIndex}`]
                    : null,
                hasAddSetLayout: editingMovementIndex != null ? !!addSetLayoutsRef.current[editingMovementIndex] : null,
            });
            return false;
        }

        const SCROLL_MARGIN = 128;
        const scrollY = Math.max(0, targetY - SCROLL_MARGIN);
        console.log('scrollToActiveEditingTarget scrolling', {
            editingTarget,
            editingMovementIndex,
            editingSetIndex,
            targetY,
            scrollY,
            keyboardHeight,
            footerBottomPadding: contentBottomPadding,
        });
        scrollViewRef.current.scrollTo({ y: scrollY, animated: true });
        return true;
    }, [
        editingMovementIndex,
        editingSetIndex,
        editingTarget,
        keyboardHeight,
        lift.movements,
    ]);

    const attemptScrollToActiveTarget = React.useCallback(() => {
        if (scrollRetryTimeoutRef.current) {
            clearTimeout(scrollRetryTimeoutRef.current);
            scrollRetryTimeoutRef.current = null;
        }

        const success = scrollToActiveEditingTarget();
        console.log('attemptScrollToActiveTarget result', {
            success,
            editingTarget,
            editingMovementIndex,
            editingSetIndex,
            keyboardHeight,
        });

        if (!success) {
            const retryScroll = () => {
                const retrySuccess = scrollToActiveEditingTarget();
                if (!retrySuccess) {
                    scrollRetryTimeoutRef.current = setTimeout(retryScroll, 200);
                } else {
                    scrollRetryTimeoutRef.current = null;
                }
            };

            scrollRetryTimeoutRef.current = setTimeout(retryScroll, 200);
        }
    }, [scrollToActiveEditingTarget]);

    const registerTitleLayout = React.useCallback((layout: LayoutRectangle) => {
        titleLayoutRef.current = layout;
        if (editingTarget === 'title') {
            const scroll = () => attemptScrollToActiveTarget();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scroll);
            } else {
                scroll();
            }
        }
    }, [attemptScrollToActiveTarget, editingTarget]);

    const registerMovementLayout = React.useCallback((movementIndex: number, layout: LayoutRectangle) => {
        movementLayoutsRef.current[movementIndex] = layout;
        if (editingMovementIndex === movementIndex && editingTarget !== 'none') {
            const scroll = () => attemptScrollToActiveTarget();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scroll);
            } else {
                scroll();
            }
        }
    }, [attemptScrollToActiveTarget, editingMovementIndex, editingTarget]);

    const registerSetLayout = React.useCallback((
        movementIndex: number,
        setIndex: number,
        layout: LayoutRectangle
    ) => {
        setLayoutsRef.current[`${movementIndex}-${setIndex}`] = layout;
        if (editingTarget === 'set' && editingMovementIndex === movementIndex) {
            const scroll = () => attemptScrollToActiveTarget();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scroll);
            } else {
                scroll();
            }
        }
    }, [attemptScrollToActiveTarget, editingMovementIndex, editingTarget]);

    const registerAddSetLayout = React.useCallback((movementIndex: number, layout: LayoutRectangle) => {
        addSetLayoutsRef.current[movementIndex] = layout;
        if (editingTarget === 'set' && editingMovementIndex === movementIndex) {
            const scroll = () => attemptScrollToActiveTarget();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scroll);
            } else {
                scroll();
            }
        }
    }, [attemptScrollToActiveTarget, editingMovementIndex, editingTarget]);

    useEffect(() => {
        if (editingTarget === 'none') {
            if (scrollRetryTimeoutRef.current) {
                clearTimeout(scrollRetryTimeoutRef.current);
                scrollRetryTimeoutRef.current = null;
            }
            return;
        }

        attemptScrollToActiveTarget();

        return () => {
            if (scrollRetryTimeoutRef.current) {
                clearTimeout(scrollRetryTimeoutRef.current);
                scrollRetryTimeoutRef.current = null;
            }
        };
    }, [
        attemptScrollToActiveTarget,
        editingMovementIndex,
        editingSetIndex,
        editingTarget,
        keyboardHeight,
        lift.movements,
    ]);

    // Reset shouldAutoFocusOnLoad after it's been used
    useEffect(() => {
        if (shouldAutoFocusOnLoad) {
            const timeout = setTimeout(() => {
                setShouldAutoFocusOnLoad(false);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [shouldAutoFocusOnLoad]);

    // Reset shouldFocusSetAfterMovementSubmit after it's been used
    useEffect(() => {
        if (shouldFocusSetAfterMovementSubmit) {
            const timeout = setTimeout(() => {
                setShouldFocusSetAfterMovementSubmit(false);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [shouldFocusSetAfterMovementSubmit]);

    // Reset shouldFocusSetOnEmptyLineClick after it's been used
    useEffect(() => {
        if (shouldFocusSetOnEmptyLineClick) {
            const timeout = setTimeout(() => {
                setShouldFocusSetOnEmptyLineClick(false);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [shouldFocusSetOnEmptyLineClick]);

    const loadLift = async (liftId: string) => {
        try {
            console.log('Loading existing lift:', liftId);
            const liftData = await retrieveLift(liftId);

            if (!liftData) {
                console.error('No lift data found for id:', liftId);
                setIsLoading(false);
                return;
            }

            // Handle old database scheme where date might be undefined
            const updatedLiftData = {
                ...liftData,
                // If date is undefined, use the liftId if it looks like a date, otherwise use current date
                date: liftData.date || (liftId.match(/^\d{4}-\d{2}-\d{2}$/) ? liftId : (() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                })())
            };

            console.log('Setting lift data with date:', updatedLiftData.date);
            setLift(updatedLiftData);

            // Determine auto-focus behavior based on lift state
            const hasTitle = updatedLiftData.title.trim().length > 0;
            const hasMovements = updatedLiftData.movements.length > 0;
            const lastMovement = hasMovements ? updatedLiftData.movements[updatedLiftData.movements.length - 1] : null;
            const lastMovementHasSets = lastMovement && lastMovement.sets.length > 0;

            if (!hasTitle) {
                // New lift: focus on title
                setEntryMode('single');
                setEditingTarget('title');
                setEditingMovementIndex(null);
                setEditingSetIndex(null);
                setIsAddingNewMovement(false);
                setShouldAutoFocusOnLoad(true);
            } else if (!hasMovements) {
                // Lift with only title: focus on movement
                setEntryMode('single');
                setEditingTarget('movementName');
                setEditingMovementIndex(NEW_MOVEMENT_INDEX);
                setEditingSetIndex(null);
                setIsAddingNewMovement(true);
                setShouldAutoFocusOnLoad(true);
            } else if (!lastMovementHasSets) {
                // Lift with movement at bottom with no sets: focus on set weight
                const lastMovementIndex = updatedLiftData.movements.length - 1;
                setEntryMode('double');
                setEditingTarget('set');
                setEditingMovementIndex(lastMovementIndex);
                setEditingSetIndex(0);
                setIsAddingNewMovement(false);
                setShouldAutoFocusOnLoad(true);
            } else {
                // Other cases: no auto-focus
                setEntryMode('single');
                setEditingTarget('none');
                setEditingMovementIndex(null);
                setEditingSetIndex(null);
                setIsAddingNewMovement(false);
                setShouldAutoFocusOnLoad(false);
            }

            setIsLoading(false);
            setAllLifts(prev => ({ ...prev, [updatedLiftData.id]: updatedLiftData }));
        } catch (error) {
            console.error('Error loading lift:', error);
            setIsLoading(false);
        }
    };

    const saveLift = async (liftToSave: Lift) => {
        try {
            // Ensure date is set before saving
            const liftWithDate = {
                ...liftToSave,
                date: liftToSave.date || (() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                })(),
                // Clean up movements with no sets
                movements: liftToSave.movements.filter(movement => movement.sets.length > 0)
            };

            // Save locally using the existing utility function
            await saveLiftLocally(liftWithDate);
            console.log('Lift saved successfully:', liftWithDate);
            setAllLifts(prev => ({ ...prev, [liftWithDate.id]: liftWithDate }));
        } catch (error) {
            console.error('Error saving lift:', error);
        }
    };

    const handleEntrySubmit = ({ first, second }: { first: string; second?: string }) => {
        if (entryMode === 'single') {
            if (editingTarget === 'title' || lift.title === '') {
                const newLift = { ...lift, title: first };
                setLift(newLift);
                saveLift(newLift);
                // Automatically transition to adding a new movement
                setIsAddingNewMovement(true);
                setEditingMovementIndex(NEW_MOVEMENT_INDEX);
                setEditingSetIndex(null);
                setEditingTarget('movementName');
                setEntryMode('single');
                setFirstInputValue('');
            } else {
                const isExistingMovement =
                    editingTarget === 'movementName' &&
                    editingMovementIndex !== null &&
                    editingMovementIndex >= 0 &&
                    editingMovementIndex < lift.movements.length &&
                    !isAddingNewMovement;

                if (isExistingMovement) {
                    const newLift = {
                        ...lift,
                        movements: lift.movements.map((m, idx) =>
                            idx === editingMovementIndex ? { ...m, name: first } : m
                        )
                    };
                    setLift(newLift);
                    saveLift(newLift);
                    setEditingTarget('none');
                    setEditingMovementIndex(null);
                    setEntryMode('single');
                    setIsAddingNewMovement(false);
                } else {
                    const newLift = {
                        ...lift,
                        movements: [...lift.movements, { name: first, sets: [] }],
                    };
                    setLift(newLift);
                    setEditingMovementIndex(lift.movements.length);
                    setEditingSetIndex(0);
                    setEditingTarget('set');
                    setEntryMode('double');
                    setIsAddingNewMovement(false);
                    setShouldFocusSetAfterMovementSubmit(true);
                }
            }
        } else if (entryMode === 'double' && second) {
            const newLift = {
                ...lift,
                movements: lift.movements.map((m, idx) => {
                    if (idx !== editingMovementIndex) return m;
                    if (editingTarget === 'set' && editingSetIndex !== null && m.sets[editingSetIndex]) {
                        // Editing an existing set - update it
                        const newSets = m.sets.slice();
                        newSets[editingSetIndex] = { weight: first, reps: second };
                        return { ...m, sets: newSets };
                    }
                    // Adding a new set
                    return { ...m, sets: [...m.sets, { weight: first, reps: second }] };
                })
            };

            setLift(newLift);
            saveLift(newLift);

            // Always prepare for a new set entry after submitting
            if (
                editingMovementIndex !== null &&
                editingMovementIndex >= 0 &&
                editingMovementIndex < newLift.movements.length
            ) {
                setEditingSetIndex(newLift.movements[editingMovementIndex].sets.length);
                setEditingTarget('set');
            }

            setEntryMode('double');

            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    };

    const handleMovementLongPress = (index: number) => {
        setPendingDeleteMovementIndex(index);
        Alert.alert(
            'Delete movement?',
            'This will delete the movement and all of its sets.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setPendingDeleteMovementIndex(null),
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const newLift = {
                            ...lift,
                            movements: lift.movements.filter((_, i) => i !== index),
                        };
                        setLift(newLift);
                        saveLift(newLift);
                        setIsAddingNewMovement(false);
                        setPendingDeleteMovementIndex(null);
                        setAllLifts(prev => {
                            const updated = { ...prev };
                            updated[newLift.id] = newLift;
                            return updated;
                        });
                    },
                },
            ]
        );
    };

    const handleSetLongPress = (movementIndex: number, setIndex: number) => {
        setPendingDeleteSet({ movementIndex, setIndex });
        Alert.alert(
            'Delete set?',
            'This will delete the selected set.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setPendingDeleteSet(null),
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const newLift = {
                            ...lift,
                            movements: lift.movements.map((m, mi) => {
                                if (mi !== movementIndex) return m;
                                return { ...m, sets: m.sets.filter((_, si) => si !== setIndex) };
                            })
                        };
                        setLift(newLift);
                        saveLift(newLift);
                        setIsAddingNewMovement(false);
                        setPendingDeleteSet(null);
                        setAllLifts(prev => {
                            const updated = { ...prev };
                            updated[newLift.id] = newLift;
                            return updated;
                        });
                    },
                },
            ]
        );
    };

    const handleKeyboardDismiss = () => {
        console.log('Handling keyboard dismiss');
        // Only reset states if we're not actively editing
        if (!isSubmitting.current) {
            setEntryMode('single');
            setEditingMovementIndex(null);
            setEditingSetIndex(null);
            setEditingTarget('none');
            setIsAddingNewMovement(false);
        }
    };

    const handleDeleteLift = () => {
        Alert.alert(
            'Delete entire lift?',
            'This will permanently delete this lift.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteLiftLocally(lift.id);
                        setAllLifts(prev => {
                            const updated = { ...prev };
                            delete updated[lift.id];
                            return updated;
                        });
                        navigation.navigate('LiftList');
                    }
                }
            ]
        );
    };

    const handleDatePress = () => {
        setIsDatePickerVisible(true);
    };

    const handleDateChange = (_: any, date?: Date) => {
        if (!date) {
            return;
        }

        setSelectedDate(date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        console.log('LiftEditor handleDateChange', {
            previousDate: lift.date,
            newDate: dateString,
            hasLiftId: !!route.params?.liftId,
        });

        // Update local state and persist so the list screen sees the new date
        const updatedLift: Lift = {
            ...lift,
            date: dateString,
        };

        setLift(updatedLift);
        saveLift(updatedLift);
    };

    const handleScrollViewLayout = (event: any) => {
        console.log('ScrollView layout:', {
            height: event.nativeEvent.layout.height,
            y: event.nativeEvent.layout.y
        });
    };

    const getLiftSortKey = (liftToScore: Lift) => {
        const dateTimestamp = Date.parse(`${liftToScore.date}T00:00:00`);
        const parsedDate = Number.isNaN(dateTimestamp) ? 0 : dateTimestamp;
        const parsedId = Number.isNaN(Number(liftToScore.id)) ? 0 : Number(liftToScore.id);
        return Math.max(parsedDate, parsedId);
    };

    const orderedLiftTitles = React.useMemo(() => {
        const liftsArray = Object.values(allLifts);
        const validTitles = liftsArray.filter(item => item?.title?.trim());
        validTitles.sort((a, b) => getLiftSortKey(b) - getLiftSortKey(a));
        const seen = new Set<string>();
        const titles: string[] = [];
        validTitles.forEach(item => {
            const trimmed = item.title.trim();
            const key = trimmed.toLowerCase();
            if (trimmed && !seen.has(key)) {
                seen.add(key);
                titles.push(trimmed);
            }
        });
        return titles;
    }, [allLifts]);

    const suggestionContext = React.useMemo<'title' | 'movement' | 'weight' | null>(() => {
        // Weight suggestions when editing a set (first field of double mode)
        if (entryMode === 'double' && editingTarget === 'set') {
            return 'weight';
        }

        if (entryMode !== 'single') {
            return null;
        }
        if (editingTarget === 'set') {
            return null;
        }
        if (editingTarget === 'title') {
            return 'title';
        }
        if (lift.title === '') {
            return 'title';
        }
        return 'movement';
    }, [entryMode, editingTarget, lift.title]);

    const titleSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'title') {
            return [];
        }
        const query = firstInputValue.trim().toLowerCase();
        const seen = new Set<string>();
        const suggestions: string[] = [];

        const fromHistory = query
            ? orderedLiftTitles.filter(title => title.toLowerCase().startsWith(query))
            : orderedLiftTitles;

        fromHistory.some(title => {
            const key = title.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                suggestions.push(title);
            }
            return suggestions.length === 3;
        });

        if (suggestions.length < 3) {
            const fromDefaults = query
                ? DEFAULT_LIFT_TITLES.filter(title => title.toLowerCase().startsWith(query))
                : DEFAULT_LIFT_TITLES;

            for (const title of fromDefaults) {
                if (suggestions.length >= 3) {
                    break;
                }
                const key = title.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    suggestions.push(title);
                }
            }
        }

        return suggestions;
    }, [suggestionContext, firstInputValue, orderedLiftTitles]);

    // Helper function to split movement names into words
    const splitIntoWords = (movementName: string): string[] => {
        // Split on spaces, dashes, slashes, and parentheses
        return movementName
            .split(/[\s\-/()]+/)
            .filter(word => word.length > 0)
            .map(word => word.toLowerCase());
    };

    // Helper function to check if a movement matches the query
    const matchesQuery = (movementName: string, query: string): boolean => {
        if (!query) {
            return true;
        }
        const words = splitIntoWords(movementName);
        return words.some(word => word.startsWith(query));
    };

    const movementSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'movement') {
            return [];
        }

        const query = firstInputValue.trim().toLowerCase();
        const normalizedCurrentTitle = lift.title.trim().toLowerCase();

        // Get all movements already in the current lift
        const existingNames = new Set<string>();
        lift.movements.forEach((movement) => {
            if (movement.name.trim()) {
                existingNames.add(movement.name.trim().toLowerCase());
            }
        });

        // Collect all movements from all lifts, categorized by priority
        const priority1: string[] = []; // Movements from name-matched lifts that haven't been used
        const priority2: string[] = []; // Movements from other-named lifts that haven't been used
        const priority3: string[] = []; // Defaults that haven't been used
        const priority4: string[] = []; // Movements already in current lift

        const seen = new Set<string>();

        // Process all lifts
        Object.values(allLifts).forEach((liftItem) => {
            if (liftItem.id === lift.id) {
                return; // Skip current lift
            }

            const isNameMatched = liftItem.title &&
                liftItem.title.trim().toLowerCase() === normalizedCurrentTitle;

            liftItem.movements.forEach((movement) => {
                const trimmed = movement.name.trim();
                if (!trimmed) {
                    return;
                }

                const key = trimmed.toLowerCase();
                if (seen.has(key)) {
                    return; // Already processed this movement
                }

                const isExisting = existingNames.has(key);
                const matches = matchesQuery(trimmed, query);

                if (!matches) {
                    return; // Doesn't match query
                }

                seen.add(key);

                if (isExisting) {
                    // Movements already in current lift go to lowest priority
                    priority4.push(trimmed);
                } else if (isNameMatched) {
                    // Priority 1: from name-matched lifts, not used in current lift
                    priority1.push(trimmed);
                } else {
                    // Priority 2: from other-named lifts, not used in current lift
                    priority2.push(trimmed);
                }
            });
        });

        // Add defaults to priority 3 (if not already in other priorities)
        DEFAULT_MOVEMENTS.forEach((defaultMovement) => {
            const trimmed = defaultMovement.trim();
            if (!trimmed) {
                return;
            }

            const key = trimmed.toLowerCase();
            if (seen.has(key)) {
                return; // Already in a higher priority
            }

            const matches = matchesQuery(trimmed, query);
            if (!matches) {
                return;
            }

            const isExisting = existingNames.has(key);
            seen.add(key);

            if (isExisting) {
                priority4.push(trimmed);
            } else {
                priority3.push(trimmed);
            }
        });

        // Sort each priority alphabetically
        priority1.sort((a, b) => a.localeCompare(b));
        priority2.sort((a, b) => a.localeCompare(b));
        priority3.sort((a, b) => a.localeCompare(b));
        priority4.sort((a, b) => a.localeCompare(b));

        // Combine priorities in order
        const allSuggestions = [
            ...priority1,
            ...priority2,
            ...priority3,
            ...priority4,
        ];

        // Take top 3
        const top3 = allSuggestions.slice(0, 3);

        // Reorder for display: 1st in middle, 2nd on left, 3rd on right
        // So we want: [2nd, 1st, 3rd] to display as: 2nd (left), 1st (middle), 3rd (right)
        if (top3.length === 0) {
            return [];
        } else if (top3.length === 1) {
            return [top3[0]];
        } else if (top3.length === 2) {
            return [top3[1], top3[0]]; // 2nd on left, 1st in middle
        } else {
            return [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
        }
    }, [
        suggestionContext,
        firstInputValue,
        allLifts,
        lift.id,
        lift.movements,
        lift.title,
        editingTarget,
        editingMovementIndex,
    ]);

    const weightSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'weight') {
            return [];
        }

        if (
            editingMovementIndex == null ||
            editingMovementIndex < 0 ||
            editingMovementIndex >= lift.movements.length
        ) {
            return [];
        }

        const currentMovement = lift.movements[editingMovementIndex];
        const movementName = currentMovement.name.trim();
        if (!movementName) {
            return [];
        }
        const normalizedName = movementName.toLowerCase();

        type WeightedSet = {
            weight: number;
            sortKey: number;
        };
        const weightedSets: WeightedSet[] = [];

        Object.values(allLifts).forEach((liftItem) => {
            const liftSortKey = getLiftSortKey(liftItem);
            liftItem.movements.forEach((movement) => {
                if (movement.name.trim().toLowerCase() !== normalizedName) {
                    return;
                }
                movement.sets.forEach((set, setIndex) => {
                    const w = parseFloat(set.weight);
                    if (!Number.isFinite(w) || w <= 0) {
                        return;
                    }
                    weightedSets.push({
                        weight: w,
                        // Add a small per-set offset so later sets in the same lift are treated as more recent
                        sortKey: liftSortKey * 1000 + setIndex,
                    });
                });
            });
        });

        if (weightedSets.length === 0) {
            return [];
        }

        // Exclude outliers (e.g., warmups or 1RMs) using a simple median-based band.
        const byWeight = [...weightedSets].sort((a, b) => a.weight - b.weight);
        const median = byWeight[Math.floor(byWeight.length / 2)].weight;
        const minAllowed = median * 0.8; // allow down to 80% of median (20% below)
        const maxAllowed = median * 1.2; // and up to 120% of median (20% above)

        const filtered = weightedSets.filter(
            (item) => item.weight >= minAllowed && item.weight <= maxAllowed
        );

        const candidates = (filtered.length > 0 ? filtered : weightedSets).sort(
            (a, b) => b.sortKey - a.sortKey
        );

        console.log('Weight suggestions debug', {
            movementName,
            allWeights: weightedSets.map(w => w.weight),
            median,
            band: { minAllowed, maxAllowed },
            filteredWeights: filtered.map(w => w.weight),
            candidateWeights: candidates.map(w => w.weight),
        });

        const best = candidates[0];
        return best ? [best.weight.toString()] : [];
    }, [allLifts, editingMovementIndex, lift.movements, suggestionContext]);

    const suggestionsForInput = React.useMemo(() => {
        if (suggestionContext === 'title') {
            return titleSuggestions;
        }
        if (suggestionContext === 'movement') {
            return movementSuggestions;
        }
        if (suggestionContext === 'weight') {
            return weightSuggestions;
        }
        return [];
    }, [movementSuggestions, suggestionContext, titleSuggestions, weightSuggestions]);

    const handleFirstValueChange = React.useCallback((value: string) => {
        setFirstInputValue(value);
    }, []);

    const handleFooterLayout = React.useCallback((event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout;
        setFooterHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
    }, []);

    const contentBottomPadding = footerHeight + keyboardHeight + 48;

    const activeMovement =
        editingMovementIndex !== null &&
            editingMovementIndex >= 0 &&
            editingMovementIndex < lift.movements.length
            ? lift.movements[editingMovementIndex]
            : null;

    const activeSet =
        activeMovement &&
            editingSetIndex !== null &&
            editingSetIndex < activeMovement.sets.length
            ? activeMovement.sets[editingSetIndex]
            : null;

    const scrollToEnd = React.useCallback(() => {
        if (!scrollViewRef.current) {
            return;
        }
        scrollViewRef.current.scrollToEnd({ animated: true });
    }, []);

    const handleEntryFooterFocus = React.useCallback(() => {
        console.log('LiftEditor handleEntryFooterFocus', {
            editingTarget,
            editingMovementIndex,
            editingSetIndex,
            entryMode,
            keyboardHeight,
        });

        // If user focuses on movement entry field, show the empty movement bubble
        // Check if we should be entering a movement name (when title exists and no movement is being added)
        const shouldShowMovementBubble =
            lift.title.trim().length > 0 &&
            (editingTarget === 'none' || (editingTarget === 'movementName' && !isAddingNewMovement));

        if (shouldShowMovementBubble && !isAddingNewMovement) {
            setIsAddingNewMovement(true);
            setEditingMovementIndex(NEW_MOVEMENT_INDEX);
            setEditingSetIndex(null);
            setEditingTarget('movementName');
            setEntryMode('single');
            setFirstInputValue('');
        }

        if (editingTarget === 'none') {
            // User is likely adding a brand new movement/set; ensure bottom content clears the footer.
            setTimeout(() => {
                console.log('LiftEditor handleEntryFooterFocus -> scrollToEnd fallback');
                scrollToEnd();
            }, 50);
        } else {
            attemptScrollToActiveTarget();
        }
    }, [
        attemptScrollToActiveTarget,
        editingMovementIndex,
        editingSetIndex,
        editingTarget,
        entryMode,
        keyboardHeight,
        scrollToEnd,
        isAddingNewMovement,
        lift.title,
    ]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
            <KeyboardAvoidingView
                behavior={undefined}
                style={styles.keyboardAvoidingView}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Image source={require('./assets/back.png')} style={styles.iconImage} />
                    </TouchableOpacity>

                    <View style={styles.headerCenter}>
                        <TouchableOpacity onPress={handleDatePress}>
                            <Text style={[styles.dateText, { color: '#333' }]}>
                                {new Date(lift.date.split('T')[0] + 'T12:00:00Z').toLocaleDateString()}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={handleDeleteLift}
                        style={styles.iconButton}
                    >
                        <Image source={require('./assets/trash.png')} style={styles.iconImage} />
                    </TouchableOpacity>
                </View>

                <View style={styles.content}>
                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.scrollView}
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: contentBottomPadding }
                        ]}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        onLayout={handleScrollViewLayout}
                    >
                        <View style={styles.notebookBackground}>
                            <RuledLines />
                            <View style={styles.contentContainer}>
                                <View
                                    collapsable={false}
                                    onLayout={(event) => registerTitleLayout(event.nativeEvent.layout)}
                                >
                                    <MessageBubble
                                        type="title"
                                        content={lift.title}
                                        onTitlePress={() => {
                                            setEntryMode('single');
                                            setEditingMovementIndex(null);
                                            setEditingSetIndex(null);
                                            setEditingTarget('title');
                                            setIsAddingNewMovement(false);
                                        }}
                                        isLast={lift.movements.length === 0}
                                        isTitleHighlighted={editingTarget === 'title'}
                                        showTitlePlaceholder={
                                            lift.title.trim().length === 0 &&
                                            (editingTarget === 'title' || keyboardHeight > 0)
                                        }
                                        titlePlaceholderText="Title"
                                    />
                                </View>

                                {lift.movements.map((movement, index) => (
                                    <View
                                        key={index}
                                        collapsable={false}
                                        onLayout={(event) => registerMovementLayout(index, event.nativeEvent.layout)}
                                        style={{ position: 'relative' }}
                                    >
                                        {DEBUG_OUTLINES_ENABLED && (
                                            <View style={styles.debugExistingMovementOverlay} pointerEvents="none" />
                                        )}
                                        <MessageBubble
                                            type="movement"
                                            content={movement}
                                            onMovementPress={() => {
                                                setIsAddingNewMovement(false);
                                                setEditingMovementIndex(index);
                                                setEditingSetIndex(null);
                                                setEditingTarget('movementName');
                                                setEntryMode('single');
                                            }}
                                            onMovementLongPress={() => handleMovementLongPress(index)}
                                            onSetPress={(setIdx) => {
                                                setIsAddingNewMovement(false);
                                                setEditingMovementIndex(index);
                                                setEditingSetIndex(setIdx);
                                                setEditingTarget('set');
                                                setEntryMode('double');
                                            }}
                                            onSetLongPress={(setIdx) => handleSetLongPress(index, setIdx)}
                                            onEmptyLinePress={() => {
                                                setIsAddingNewMovement(false);
                                                setEditingMovementIndex(index);
                                                setEditingSetIndex(lift.movements[index].sets.length);
                                                setEditingTarget('set');
                                                setEntryMode('double');
                                                setShouldFocusSetOnEmptyLineClick(true);
                                            }}
                                            onSetLayout={(setIdx, layout) => registerSetLayout(index, setIdx, layout)}
                                            onAddSetLayout={(layout) => registerAddSetLayout(index, layout)}
                                            isEditing={editingMovementIndex === index}
                                            isLast={index === lift.movements.length - 1}
                                            isMovementNameHighlighted={editingTarget === 'movementName' && editingMovementIndex === index}
                                            isMovementPendingDelete={pendingDeleteMovementIndex === index}
                                            showMovementPlaceholder={
                                                editingTarget === 'movementName' &&
                                                editingMovementIndex === index &&
                                                movement.name.trim().length === 0 &&
                                                keyboardHeight > 0
                                            }
                                            movementPlaceholderText="Movement"
                                            highlightedSetIndex={
                                                editingTarget === 'set' &&
                                                    editingMovementIndex === index &&
                                                    editingSetIndex != null &&
                                                    editingSetIndex < movement.sets.length
                                                    ? editingSetIndex
                                                    : null
                                            }
                                            pendingDeleteSetIndex={
                                                pendingDeleteSet &&
                                                    pendingDeleteSet.movementIndex === index
                                                    ? pendingDeleteSet.setIndex
                                                    : null
                                            }
                                            showSetPlaceholder={
                                                editingTarget === 'set' &&
                                                editingMovementIndex === index &&
                                                (editingSetIndex == null || editingSetIndex >= movement.sets.length)
                                            }
                                            setPlaceholderText="weight x reps"
                                        />
                                    </View>
                                ))}

                                {/* Empty line after all movements to tap and add a new movement, OR show the new movement bubble */}
                                {lift.title.trim().length > 0 && (
                                    <>
                                        {!isAddingNewMovement && (
                                            <Pressable
                                                onPress={() => {
                                                    setIsAddingNewMovement(true);
                                                    setEditingMovementIndex(NEW_MOVEMENT_INDEX);
                                                    setEditingSetIndex(null);
                                                    setEditingTarget('movementName');
                                                    setEntryMode('single');
                                                    setFirstInputValue('');
                                                }}
                                            >
                                                <View style={styles.emptyLine}>
                                                    {DEBUG_OUTLINES_ENABLED && (
                                                        <View style={styles.debugClickableAreaOverlay} />
                                                    )}
                                                </View>
                                            </Pressable>
                                        )}

                                        {isAddingNewMovement && (
                                            <View
                                                collapsable={false}
                                                onLayout={(event) => registerMovementLayout(NEW_MOVEMENT_INDEX, event.nativeEvent.layout)}
                                                style={{ position: 'relative' }}
                                            >
                                                {DEBUG_OUTLINES_ENABLED && (
                                                    <View style={styles.debugPlacementAreaOverlay} pointerEvents="none" />
                                                )}
                                                <MessageBubble
                                                    type="movement"
                                                    content={{ name: '', sets: [] }}
                                                    movementPlaceholderText="Movement"
                                                    showMovementPlaceholder={true}
                                                    isMovementNameHighlighted={isAddingNewMovement}
                                                    prependEmptyLine={false}
                                                    onMovementPress={() => {
                                                        setIsAddingNewMovement(true);
                                                        setEditingMovementIndex(NEW_MOVEMENT_INDEX);
                                                        setEditingSetIndex(null);
                                                        setEditingTarget('movementName');
                                                        setEntryMode('single');
                                                        setFirstInputValue('');
                                                    }}
                                                    onEmptyLinePress={() => {
                                                        setIsAddingNewMovement(true);
                                                        setEditingMovementIndex(NEW_MOVEMENT_INDEX);
                                                        setEditingSetIndex(null);
                                                        setEditingTarget('movementName');
                                                        setEntryMode('single');
                                                        setFirstInputValue('');
                                                    }}
                                                    isLast={true}
                                                    onAddSetLayout={(layout) => registerAddSetLayout(NEW_MOVEMENT_INDEX, layout)}
                                                />
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        </View>
                    </ScrollView>

                    {!isLoading && (
                        <View onLayout={handleFooterLayout}>
                            <EntryFooter
                                mode={entryMode}
                                onSubmit={handleEntrySubmit}
                                initialValues={
                                    editingTarget === 'title'
                                        ? { first: lift.title }
                                        : editingTarget === 'movementName' && activeMovement
                                            ? { first: activeMovement.name }
                                            : editingTarget === 'set' && activeSet
                                                ? {
                                                    first: activeSet.weight || '',
                                                    second: activeSet.reps || '',
                                                }
                                                : undefined
                                }
                                firstPlaceholder={
                                    lift.title === '' || editingTarget === 'title'
                                        ? 'Enter lift title...'
                                        : editingTarget === 'set'
                                            ? 'Enter weight...'
                                            : 'Enter movement name...'
                                }
                                secondPlaceholder="Enter reps..."
                                onKeyboardDismiss={handleKeyboardDismiss}
                                suggestions={suggestionsForInput}
                                onFirstValueChange={handleFirstValueChange}
                                onFirstFieldFocus={handleEntryFooterFocus}
                                forceFocus={
                                    (isAddingNewMovement && editingTarget === 'movementName' && !shouldAutoFocusOnLoad) ||
                                    shouldFocusSetAfterMovementSubmit ||
                                    shouldFocusSetOnEmptyLineClick
                                }
                                shouldAutoFocusOnLoad={shouldAutoFocusOnLoad}
                            />
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>

            {isDatePickerVisible && (
                <Modal
                    visible={isDatePickerVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setIsDatePickerVisible(false)}
                >
                    <View style={[styles.modalContainer]}>
                        <View style={[styles.modalContent, { backgroundColor: '#fff' }]}>
                            <View style={[styles.modalHeader]}>
                                <TouchableOpacity
                                    style={styles.modalButton}
                                    onPress={() => setIsDatePickerVisible(false)}
                                >
                                    <Text style={[styles.modalButtonText, { color: '#333' }]}>
                                        Done
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={selectedDate}
                                mode="date"
                                display="spinner"
                                onChange={handleDateChange}
                                textColor="#333"
                                style={styles.datePicker}
                            />
                        </View>
                    </View>
                </Modal>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
    },
    headerCenter: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    iconButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    iconImage: {
        width: 28,
        height: 28,
        resizeMode: 'contain',
    },
    dateText: {
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Schoolbell',
    },
    content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    scrollView: {
        flex: 1,
        backgroundColor: '#fff',
    },
    scrollContent: {
        flexGrow: 1,
    },
    notebookBackground: {
        flex: 1,
        backgroundColor: '#fff',
        position: 'relative',
        minHeight: '100%',
    },
    contentContainer: {
        paddingHorizontal: 16,
        paddingTop: 0, // Remove top padding
        paddingBottom: 16,
    },
    ruledLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: '#e0e0e0',
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e0e0e0',
    },
    modalButton: {
        padding: 8,
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Schoolbell',
    },
    datePicker: {
        height: 200,
    },
    emptyLine: {
        height: 24,
        position: 'relative',
    },
    debugClickableAreaOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Red tint for clickable area
        borderWidth: 2,
        borderColor: 'red',
        borderStyle: 'dashed',
    },
    debugPlacementAreaOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 255, 0, 0.2)', // Green tint for placement area
        borderWidth: 2,
        borderColor: 'green',
        borderStyle: 'dashed',
        zIndex: 1000,
    },
    debugExistingMovementOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(128, 0, 128, 0.2)', // Purple tint for existing movement bubbles
        borderWidth: 2,
        borderColor: 'purple',
        borderStyle: 'dashed',
        zIndex: 1000,
    },
});

export default LiftEditorScreen; 