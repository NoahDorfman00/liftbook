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
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import EntryFooter, { EntryMode } from './EntryFooter';
import MessageBubble from './MessageBubble';
import { RootStackParamList, Lift, Movement } from './types';
import {
    retrieveLift,
    retrieveLifts,
    saveLiftLocally,
    deleteLiftLocally,
    todayISO,
    formatDisplayDate,
    matchesQuery,
} from './utils';
import { DEFAULT_LIFT_TITLES, DEFAULT_MOVEMENTS } from './suggestions';

type LiftEditorScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftEditor'>;
type LiftEditorScreenRouteProp = RouteProp<RootStackParamList, 'LiftEditor'>;

const NEW_MOVEMENT_INDEX = -1;

// The single source of truth for what is being edited. Everything the old
// implementation tracked in parallel flags (entryMode, editingTarget,
// editingMovementIndex, editingSetIndex, isAddingNewMovement) derives
// from this one value.
type EditingState =
    | { target: 'none' }
    | { target: 'title' }
    | { target: 'movementName'; movementIndex: number }
    | { target: 'set'; movementIndex: number; setIndex: number };

type SetEditingFn = (
    next: EditingState,
    opts?: { focus?: boolean; first?: string; second?: string; dismissKeyboard?: boolean }
) => void;

interface MovementRowProps {
    index: number;
    movement: Movement;
    isLast: boolean;
    isEditing: boolean;
    isMovementNameHighlighted: boolean;
    isMovementPendingDelete: boolean;
    showMovementPlaceholder: boolean;
    highlightedSetIndex: number | null;
    pendingDeleteSetIndex: number | null;
    showSetPlaceholder: boolean;
    setEditing: SetEditingFn;
    onMovementLongPress: (index: number) => void;
    onSetLongPress: (movementIndex: number, setIndex: number) => void;
    registerMovementLayout: (index: number, layout: LayoutRectangle) => void;
    registerSetLayout: (movementIndex: number, setIndex: number, layout: LayoutRectangle) => void;
    registerAddSetLayout: (index: number, layout: LayoutRectangle) => void;
}

// Memoized so typing in the footer (which re-renders the screen on every
// keystroke) does not re-render every movement bubble. All function props
// are referentially stable; the rest are primitives or the movement object,
// whose identity only changes when that movement's data changes.
const MovementRow = React.memo<MovementRowProps>(({
    index,
    movement,
    isLast,
    isEditing,
    isMovementNameHighlighted,
    isMovementPendingDelete,
    showMovementPlaceholder,
    highlightedSetIndex,
    pendingDeleteSetIndex,
    showSetPlaceholder,
    setEditing,
    onMovementLongPress,
    onSetLongPress,
    registerMovementLayout,
    registerSetLayout,
    registerAddSetLayout,
}) => (
    <View
        collapsable={false}
        onLayout={(event) => registerMovementLayout(index, event.nativeEvent.layout)}
        style={{ position: 'relative' }}
    >
        <MessageBubble
            type="movement"
            content={movement}
            onMovementPress={() => {
                setEditing({ target: 'movementName', movementIndex: index }, { focus: true });
            }}
            onMovementLongPress={() => onMovementLongPress(index)}
            onSetPress={(setIdx) => {
                setEditing({ target: 'set', movementIndex: index, setIndex: setIdx }, { focus: true });
            }}
            onSetLongPress={(setIdx) => onSetLongPress(index, setIdx)}
            onEmptyLinePress={() => {
                setEditing(
                    { target: 'set', movementIndex: index, setIndex: movement.sets.length },
                    { focus: true, first: '', second: '' }
                );
            }}
            onSetLayout={(setIdx, layout) => registerSetLayout(index, setIdx, layout)}
            onAddSetLayout={(layout) => registerAddSetLayout(index, layout)}
            isEditing={isEditing}
            isLast={isLast}
            isMovementNameHighlighted={isMovementNameHighlighted}
            isMovementPendingDelete={isMovementPendingDelete}
            showMovementPlaceholder={showMovementPlaceholder}
            movementPlaceholderText="Movement"
            highlightedSetIndex={highlightedSetIndex}
            pendingDeleteSetIndex={pendingDeleteSetIndex}
            showSetPlaceholder={showSetPlaceholder}
            setPlaceholderText="weight x reps"
        />
    </View>
));

// One SVG with a repeating 24px pattern instead of hundreds of 1px Views
const RuledLines = React.memo(({ minHeight = 10000 }: { minHeight?: number }) => {
    const height = Math.ceil(minHeight / 24) * 24 + 1200;
    return (
        <Svg
            height={height}
            width="100%"
            style={styles.ruledLinesSvg}
            pointerEvents="none"
        >
            <Defs>
                <Pattern id="ruled" width={4000} height={24} patternUnits="userSpaceOnUse">
                    <Rect x={0} y={0} width={4000} height={1} fill="#e0e0e0" />
                </Pattern>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#ruled)" />
        </Svg>
    );
});

const LiftEditorScreen: React.FC = () => {
    const navigation = useNavigation<LiftEditorScreenNavigationProp>();
    const route = useRoute<LiftEditorScreenRouteProp>();
    const [isLoading, setIsLoading] = useState(!!route.params?.liftId);

    const [lift, setLift] = useState<Lift>({
        id: route.params?.liftId || Date.now().toString(),
        date: route.params?.date || todayISO(),
        title: '',
        movements: [],
    });

    const [editing, setEditingState] = useState<EditingState>({ target: 'none' });
    const editingRef = useRef<EditingState>(editing);
    const liftRef = useRef<Lift>(lift);
    // Ignore keyboard-hide resets briefly after an intentional transition
    const dismissGuardUntilRef = useRef(0);

    const [allLifts, setAllLifts] = useState<{ [id: string]: Lift }>({});
    const [firstInputValue, setFirstInputValue] = useState('');
    const [secondInputValue, setSecondInputValue] = useState('');
    const [focusRequest, setFocusRequest] = useState(0);
    const [pendingDeleteMovementIndex, setPendingDeleteMovementIndex] = useState<number | null>(null);
    const [pendingDeleteSet, setPendingDeleteSet] = useState<{ movementIndex: number; setIndex: number } | null>(null);

    const editingTarget = editing.target === 'movementName' ? 'movementName' : editing.target;
    const editingMovementIndex =
        editing.target === 'movementName' || editing.target === 'set' ? editing.movementIndex : null;
    const editingSetIndex = editing.target === 'set' ? editing.setIndex : null;
    const isAddingNewMovement = editing.target === 'movementName' && editing.movementIndex === NEW_MOVEMENT_INDEX;
    const entryMode: EntryMode = editing.target === 'set' ? 'double' : 'single';

    // Update the lift in state and keep liftRef in sync for stable callbacks
    const updateLift = React.useCallback((next: Lift) => {
        liftRef.current = next;
        setLift(next);
    }, []);

    // Field values that belong to an editing state (existing title/name/set)
    const valuesFor = (next: EditingState): { first: string; second: string } => {
        const l = liftRef.current;
        switch (next.target) {
            case 'title':
                return { first: l.title, second: '' };
            case 'movementName':
                return {
                    first: next.movementIndex >= 0 ? (l.movements[next.movementIndex]?.name ?? '') : '',
                    second: '',
                };
            case 'set': {
                const set = next.movementIndex >= 0
                    ? l.movements[next.movementIndex]?.sets[next.setIndex]
                    : undefined;
                return { first: set?.weight ?? '', second: set?.reps ?? '' };
            }
            default:
                return { first: '', second: '' };
        }
    };

    // Atomically switch editing target: updates the ref synchronously (so
    // focus/dismiss handlers never see stale state), seeds the footer's
    // field values, and optionally requests focus or dismisses the keyboard.
    const setEditing = React.useCallback((
        next: EditingState,
        opts?: { focus?: boolean; first?: string; second?: string; dismissKeyboard?: boolean }
    ) => {
        editingRef.current = next;
        dismissGuardUntilRef.current = Date.now() + 400;
        setEditingState(next);
        const values = valuesFor(next);
        setFirstInputValue(opts?.first !== undefined ? opts.first : values.first);
        setSecondInputValue(opts?.second !== undefined ? opts.second : values.second);
        if (opts?.focus) {
            setFocusRequest(c => c + 1);
        }
        if (opts?.dismissKeyboard) {
            Keyboard.dismiss();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scrollViewRef = useRef<ScrollView>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(10000);
    const titleLayoutRef = useRef<LayoutRectangle | null>(null);
    const movementLayoutsRef = useRef<Record<number, LayoutRectangle>>({});
    const setLayoutsRef = useRef<Record<string, LayoutRectangle>>({});
    const addSetLayoutsRef = useRef<Record<number, LayoutRectangle>>({});
    const scrollRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
        const [year, month, day] = lift.date.split('-').map(Number);
        return new Date(year, month - 1, day);
    });

    useEffect(() => {
        const loadAllLifts = async () => {
            const liftsMap = await retrieveLifts();
            setAllLifts(liftsMap);
        };

        loadAllLifts();
    }, []);

    useEffect(() => {
        if (route.params?.liftId) {
            // Load existing lift data
            loadLift(route.params.liftId);
        } else {
            // New lift - focus the title input
            setEditing({ target: 'title' }, { focus: true });
        }
    }, [route.params?.liftId]);

    useEffect(() => {
        const keyboardWillShow = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                setKeyboardHeight(e.endCoordinates.height);
            }
        );

        const keyboardWillHide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => {
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

    // Reads editingRef/liftRef so the callback (and everything derived from
    // it) stays referentially stable across renders.
    const scrollToActiveEditingTarget = React.useCallback(() => {
        if (!scrollViewRef.current) {
            return false;
        }

        const current = editingRef.current;
        let targetY: number | null = null;

        if (current.target === 'title') {
            targetY = titleLayoutRef.current?.y ?? 0;
        } else if (current.target === 'movementName') {
            const movementLayout = movementLayoutsRef.current[current.movementIndex];
            if (movementLayout) {
                targetY = movementLayout.y;
            }
        } else if (current.target === 'set') {
            const { movementIndex, setIndex } = current;
            const movementLayout = movementLayoutsRef.current[movementIndex];
            const movement = movementIndex >= 0 ? liftRef.current.movements[movementIndex] : undefined;
            if (movementLayout) {
                if (movement && setIndex < movement.sets.length) {
                    const setLayout = setLayoutsRef.current[`${movementIndex}-${setIndex}`];
                    if (setLayout) {
                        targetY = movementLayout.y + setLayout.y;
                    }
                } else {
                    const addSetLayout = addSetLayoutsRef.current[movementIndex];
                    if (addSetLayout) {
                        targetY = movementLayout.y + addSetLayout.y;
                    } else {
                        targetY = movementLayout.y + movementLayout.height;
                    }
                }
            }
        }

        if (targetY == null) {
            return false;
        }

        const SCROLL_MARGIN = 128;
        const scrollY = Math.max(0, targetY - SCROLL_MARGIN);
        scrollViewRef.current.scrollTo({ y: scrollY, animated: true });
        return true;
    }, []);

    const attemptScrollToActiveTarget = React.useCallback(() => {
        if (scrollRetryTimeoutRef.current) {
            clearTimeout(scrollRetryTimeoutRef.current);
            scrollRetryTimeoutRef.current = null;
        }

        const success = scrollToActiveEditingTarget();

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

    const scheduleScrollToActiveTarget = React.useCallback(() => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => attemptScrollToActiveTarget());
        } else {
            attemptScrollToActiveTarget();
        }
    }, [attemptScrollToActiveTarget]);

    const registerTitleLayout = React.useCallback((layout: LayoutRectangle) => {
        titleLayoutRef.current = layout;
        if (editingRef.current.target === 'title') {
            scheduleScrollToActiveTarget();
        }
    }, [scheduleScrollToActiveTarget]);

    const registerMovementLayout = React.useCallback((movementIndex: number, layout: LayoutRectangle) => {
        movementLayoutsRef.current[movementIndex] = layout;
        const current = editingRef.current;
        if (
            (current.target === 'movementName' || current.target === 'set') &&
            current.movementIndex === movementIndex
        ) {
            scheduleScrollToActiveTarget();
        }
    }, [scheduleScrollToActiveTarget]);

    const registerSetLayout = React.useCallback((
        movementIndex: number,
        setIndex: number,
        layout: LayoutRectangle
    ) => {
        setLayoutsRef.current[`${movementIndex}-${setIndex}`] = layout;
        const current = editingRef.current;
        if (current.target === 'set' && current.movementIndex === movementIndex) {
            scheduleScrollToActiveTarget();
        }
    }, [scheduleScrollToActiveTarget]);

    const registerAddSetLayout = React.useCallback((movementIndex: number, layout: LayoutRectangle) => {
        addSetLayoutsRef.current[movementIndex] = layout;
        const current = editingRef.current;
        if (current.target === 'set' && current.movementIndex === movementIndex) {
            scheduleScrollToActiveTarget();
        }
    }, [scheduleScrollToActiveTarget]);

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

    const loadLift = async (liftId: string) => {
        try {
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
                date: liftData.date || (liftId.match(/^\d{4}-\d{2}-\d{2}$/) ? liftId : todayISO())
            };

            updateLift(updatedLiftData);

            // Determine auto-focus behavior based on lift state
            const hasTitle = updatedLiftData.title.trim().length > 0;
            const hasMovements = updatedLiftData.movements.length > 0;
            const lastMovement = hasMovements ? updatedLiftData.movements[updatedLiftData.movements.length - 1] : null;
            const lastMovementHasSets = lastMovement && lastMovement.sets.length > 0;

            if (!hasTitle) {
                // New lift: focus on title
                setEditing({ target: 'title' }, { focus: true });
            } else if (!hasMovements) {
                // Lift with only title: focus on movement
                setEditing({ target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX }, { focus: true });
            } else if (!lastMovementHasSets) {
                // Lift with movement at bottom with no sets: focus on set weight
                setEditing(
                    { target: 'set', movementIndex: updatedLiftData.movements.length - 1, setIndex: 0 },
                    { focus: true }
                );
            } else {
                // Other cases: no auto-focus
                setEditing({ target: 'none' });
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
                date: liftToSave.date || todayISO(),
                // Clean up movements with no sets
                movements: liftToSave.movements.filter(movement => movement.sets.length > 0)
            };

            // Save locally using the existing utility function
            await saveLiftLocally(liftWithDate);
            setAllLifts(prev => ({ ...prev, [liftWithDate.id]: liftWithDate }));
        } catch (error) {
            console.error('Error saving lift:', error);
        }
    };

    const handleEntrySubmit = ({ first, second }: { first: string; second?: string }) => {
        const current = editingRef.current;

        if (entryMode === 'single') {
            if (current.target === 'title' || lift.title === '') {
                const newLift = { ...lift, title: first };
                updateLift(newLift);
                saveLift(newLift);

                if (route.params?.liftId && newLift.movements.length > 0) {
                    // Edited an existing title on a lift that has movements - dismiss
                    setEditing({ target: 'none' }, { dismissKeyboard: true });
                } else {
                    // Otherwise transition straight to adding the first movement
                    setEditing(
                        { target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX },
                        { first: '', focus: true }
                    );
                }
            } else {
                const isExistingMovement =
                    current.target === 'movementName' &&
                    current.movementIndex >= 0 &&
                    current.movementIndex < lift.movements.length;

                if (isExistingMovement) {
                    const movementIndex = current.movementIndex;
                    const newLift = {
                        ...lift,
                        movements: lift.movements.map((m, idx) =>
                            idx === movementIndex ? { ...m, name: first } : m
                        )
                    };
                    updateLift(newLift);
                    saveLift(newLift);

                    if (newLift.movements[movementIndex].sets.length === 0) {
                        // Renamed movement has no sets yet - start set entry
                        setEditing({ target: 'set', movementIndex, setIndex: 0 }, { focus: true });
                    } else {
                        // Movement has sets - dismiss footer but keep it visible
                        setEditing({ target: 'none' }, { dismissKeyboard: true });
                    }
                } else {
                    // Adding a new movement; move on to entering its first set
                    const newLift = {
                        ...lift,
                        movements: [...lift.movements, { name: first, sets: [] }],
                    };
                    updateLift(newLift);
                    setEditing(
                        { target: 'set', movementIndex: newLift.movements.length - 1, setIndex: 0 },
                        { focus: true }
                    );
                }
            }
        } else if (entryMode === 'double' && second && current.target === 'set') {
            const { movementIndex, setIndex } = current;
            const isExistingSet =
                movementIndex >= 0 &&
                movementIndex < lift.movements.length &&
                !!lift.movements[movementIndex].sets[setIndex];

            const newLift = {
                ...lift,
                movements: lift.movements.map((m, idx) => {
                    if (idx !== movementIndex) return m;
                    if (isExistingSet) {
                        // Editing an existing set - update it
                        const newSets = m.sets.slice();
                        newSets[setIndex] = { weight: first, reps: second };
                        return { ...m, sets: newSets };
                    }
                    // Adding a new set
                    return { ...m, sets: [...m.sets, { weight: first, reps: second }] };
                })
            };

            updateLift(newLift);
            saveLift(newLift);

            const isLastSet = setIndex === newLift.movements[movementIndex]?.sets.length - 1;
            if (isExistingSet && !isLastSet) {
                // After editing a set in the middle, dismiss the footer but keep it visible
                setEditing({ target: 'none' }, { dismissKeyboard: true });
            } else {
                // After adding a set (or editing the last one), line up the next set entry
                setEditing(
                    { target: 'set', movementIndex, setIndex: newLift.movements[movementIndex].sets.length },
                    { focus: true, first: '', second: '' }
                );
                setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 100);
            }
        }
    };

    const handleMovementLongPress = React.useCallback((index: number) => {
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
                        const currentLift = liftRef.current;
                        const newLift = {
                            ...currentLift,
                            movements: currentLift.movements.filter((_, i) => i !== index),
                        };
                        updateLift(newLift);
                        saveLift(newLift);
                        setEditing({ target: 'none' }, { dismissKeyboard: true });
                        setPendingDeleteMovementIndex(null);
                        setAllLifts(prev => ({ ...prev, [newLift.id]: newLift }));
                    },
                },
            ]
        );
    }, [setEditing, updateLift]);

    const handleSetLongPress = React.useCallback((movementIndex: number, setIndex: number) => {
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
                        const currentLift = liftRef.current;
                        const newLift = {
                            ...currentLift,
                            movements: currentLift.movements.map((m, mi) => {
                                if (mi !== movementIndex) return m;
                                return { ...m, sets: m.sets.filter((_, si) => si !== setIndex) };
                            })
                        };
                        updateLift(newLift);
                        saveLift(newLift);
                        setEditing({ target: 'none' }, { dismissKeyboard: true });
                        setPendingDeleteSet(null);
                        setAllLifts(prev => ({ ...prev, [newLift.id]: newLift }));
                    },
                },
            ]
        );
    }, [setEditing, updateLift]);

    const handleKeyboardDismiss = React.useCallback(() => {
        // Ignore hide events that are part of an intentional transition
        if (Date.now() < dismissGuardUntilRef.current) {
            return;
        }
        if (editingRef.current.target !== 'none') {
            setEditing({ target: 'none' });
        }
    }, [setEditing]);

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

        // Update local state and persist so the list screen sees the new date
        const updatedLift: Lift = {
            ...lift,
            date: dateString,
        };

        updateLift(updatedLift);
        saveLift(updatedLift);
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

    const cycleSuggestions = React.useMemo(() => {
        const liftsArray = Object.values(allLifts);
        const sorted = liftsArray
            .filter(l => l?.title?.trim())
            .sort((a, b) => getLiftSortKey(a) - getLiftSortKey(b));

        const mostRecentIdx = [...sorted]
            .reverse()
            .findIndex(l => l.id !== lift.id);
        if (mostRecentIdx === -1) return [];
        const lastIdx = sorted.length - 1 - mostRecentIdx;

        const lastTitle = sorted[lastIdx].title.trim().toLowerCase();

        // Find the previous occurrence of the same title
        let prevIdx = -1;
        for (let i = lastIdx - 1; i >= 0; i--) {
            if (sorted[i].title.trim().toLowerCase() === lastTitle) {
                prevIdx = i;
                break;
            }
        }

        // Slice between previous occurrence and most recent (exclusive on both ends),
        // or take everything before if the title only appears once
        const sliceStart = prevIdx === -1 ? 0 : prevIdx + 1;
        const between = sorted.slice(sliceStart, lastIdx);

        const seen = new Set<string>();
        const titles: string[] = [];
        between.forEach(l => {
            const trimmed = l.title.trim();
            const key = trimmed.toLowerCase();
            if (key === lastTitle) return;
            if (seen.has(key)) return;
            seen.add(key);
            titles.push(trimmed);
        });

        return titles;
    }, [allLifts, lift.id]);

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

    // Ordered, deduped title candidates. Rebuilt only when the underlying data
    // changes; the per-keystroke query filter below works on this small list.
    const titleCandidates = React.useMemo(() => {
        const seen = new Set<string>();
        const candidates: string[] = [];
        const push = (title: string) => {
            const trimmed = title.trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            candidates.push(trimmed);
        };

        // Priority 0: cycle-predicted next titles (what historically follows the most recent lift)
        cycleSuggestions.forEach(push);
        // Priority 1: user saved lift titles (most recent first)
        orderedLiftTitles.forEach(push);
        // Priority 2: default lift titles (alphabetical)
        [...DEFAULT_LIFT_TITLES].sort((a, b) => a.localeCompare(b)).forEach(push);

        return candidates;
    }, [cycleSuggestions, orderedLiftTitles]);

    const titleSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'title') {
            return [];
        }
        const query = firstInputValue.trim().toLowerCase();
        return titleCandidates
            .filter(title => matchesQuery(title, query))
            .slice(0, 3);
    }, [suggestionContext, firstInputValue, titleCandidates]);

    // Ordered, deduped movement candidates. Rebuilt only when the underlying
    // data changes; the per-keystroke query filter below works on this list.
    const movementCandidates = React.useMemo(() => {
        const normalizedCurrentTitle = lift.title.trim().toLowerCase();

        // Movements already in the current lift sort to the back (priority 4)
        const existingNames = new Set<string>();
        lift.movements.forEach((movement) => {
            if (movement.name.trim()) {
                existingNames.add(movement.name.trim().toLowerCase());
            }
        });

        const priority1: string[] = []; // From same-titled lifts, recency + position order
        const priority2: string[] = []; // From other lifts
        const priority3: string[] = []; // Defaults
        const priority4: string[] = []; // Already in current lift

        const seen = new Set<string>();
        const push = (name: string, bucket: string[]) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            (existingNames.has(key) ? priority4 : bucket).push(trimmed);
        };

        const nameMatchedLifts: Lift[] = [];
        const otherLifts: Lift[] = [];
        Object.values(allLifts).forEach((liftItem) => {
            if (liftItem.id === lift.id) {
                return; // Skip current lift
            }
            const isNameMatched = liftItem.title &&
                liftItem.title.trim().toLowerCase() === normalizedCurrentTitle;
            (isNameMatched ? nameMatchedLifts : otherLifts).push(liftItem);
        });

        // Walk same-titled lifts most-recent-first, movements top-to-bottom
        nameMatchedLifts.sort((a, b) => b.date.localeCompare(a.date));
        nameMatchedLifts.forEach((liftItem) => {
            liftItem.movements.forEach((movement) => push(movement.name, priority1));
        });
        otherLifts.forEach((liftItem) => {
            liftItem.movements.forEach((movement) => push(movement.name, priority2));
        });
        DEFAULT_MOVEMENTS.forEach((name) => push(name, priority3));

        // priority1 keeps recency + position order — do not sort it
        priority2.sort((a, b) => a.localeCompare(b));
        priority3.sort((a, b) => a.localeCompare(b));
        priority4.sort((a, b) => a.localeCompare(b));

        return [...priority1, ...priority2, ...priority3, ...priority4];
    }, [allLifts, lift.id, lift.movements, lift.title]);

    const movementSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'movement') {
            return [];
        }
        const query = firstInputValue.trim().toLowerCase();
        return movementCandidates
            .filter(name => matchesQuery(name, query))
            .slice(0, 3);
    }, [suggestionContext, firstInputValue, movementCandidates]);

    const lastTimeNote = React.useMemo<string | null>(() => {
        if (
            editingTarget !== 'set' ||
            editingMovementIndex == null ||
            editingMovementIndex < 0 ||
            editingMovementIndex >= lift.movements.length
        ) {
            return null;
        }

        const currentMovement = lift.movements[editingMovementIndex];
        const movementName = currentMovement.name.trim();
        if (!movementName) {
            return null;
        }
        const normalizedName = movementName.toLowerCase();

        const currentLiftSortKey = getLiftSortKey(lift);
        let previousLift: Lift | null = null;
        let previousLiftSortKey = -1;

        const allLiftsArray = Object.values(allLifts);
        for (const liftItem of allLiftsArray) {
            if (liftItem.id === lift.id) {
                continue;
            }

            const liftSortKey = getLiftSortKey(liftItem);
            if (liftSortKey >= currentLiftSortKey) {
                continue;
            }

            const hasMovement = liftItem.movements.some(
                (movement: Movement) => movement.name.trim().toLowerCase() === normalizedName
            );

            if (hasMovement && liftSortKey > previousLiftSortKey) {
                previousLiftSortKey = liftSortKey;
                previousLift = liftItem;
            }
        }

        if (!previousLift) {
            return null;
        }

        const setParts: string[] = [];
        for (const movement of previousLift.movements) {
            if (movement.name.trim().toLowerCase() !== normalizedName) {
                continue;
            }
            for (const set of movement.sets) {
                const w = parseFloat(set.weight);
                const r = parseFloat(set.reps);
                if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) {
                    setParts.push(`${set.weight}x${set.reps}`);
                }
            }
        }

        if (setParts.length === 0) {
            return null;
        }

        return `last time: ${setParts.join(', ')}`;
    }, [allLifts, editingMovementIndex, editingTarget, lift]);

    const suggestionsForInput = React.useMemo(() => {
        if (suggestionContext === 'title') {
            return titleSuggestions;
        }
        if (suggestionContext === 'movement') {
            return movementSuggestions;
        }
        return [];
    }, [movementSuggestions, suggestionContext, titleSuggestions]);

    const handleFirstValueChange = React.useCallback((value: string) => {
        setFirstInputValue(value);
    }, []);

    const handleFooterLayout = React.useCallback((event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout;
        setFooterHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
    }, []);

    const contentBottomPadding = footerHeight + keyboardHeight + 48;

    const handleEntryFooterFocus = React.useCallback(() => {
        // If the footer was dismissed and the lift has a title, focusing the
        // field means the user wants to add a new movement.
        if (editingRef.current.target === 'none' && liftRef.current.title.trim().length > 0) {
            setEditing({ target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX }, { first: '' });
        }
        attemptScrollToActiveTarget();
    }, [attemptScrollToActiveTarget, setEditing]);

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
                                {formatDisplayDate(lift.date)}
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
                    >
                        <View
                            style={styles.notebookBackground}
                            onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // Add buffer to ensure lines extend beyond content
                                setContentHeight(Math.max(height + 2000, 10000));
                            }}
                        >
                            <RuledLines minHeight={contentHeight} />
                            <View style={styles.contentContainer}>
                                <View
                                    collapsable={false}
                                    onLayout={(event) => registerTitleLayout(event.nativeEvent.layout)}
                                >
                                    <MessageBubble
                                        type="title"
                                        content={lift.title}
                                        onTitlePress={() => {
                                            setEditing({ target: 'title' }, { focus: true });
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
                                    <MovementRow
                                        key={index}
                                        index={index}
                                        movement={movement}
                                        isLast={index === lift.movements.length - 1}
                                        isEditing={editingMovementIndex === index}
                                        isMovementNameHighlighted={editingTarget === 'movementName' && editingMovementIndex === index}
                                        isMovementPendingDelete={pendingDeleteMovementIndex === index}
                                        showMovementPlaceholder={
                                            editingTarget === 'movementName' &&
                                            editingMovementIndex === index &&
                                            movement.name.trim().length === 0 &&
                                            keyboardHeight > 0
                                        }
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
                                        setEditing={setEditing}
                                        onMovementLongPress={handleMovementLongPress}
                                        onSetLongPress={handleSetLongPress}
                                        registerMovementLayout={registerMovementLayout}
                                        registerSetLayout={registerSetLayout}
                                        registerAddSetLayout={registerAddSetLayout}
                                    />
                                ))}

                                {/* Empty line after all movements to tap and add a new movement, OR show the new movement bubble */}
                                {lift.title.trim().length > 0 && (
                                    <>
                                        {!isAddingNewMovement && (
                                            <Pressable
                                                onPress={() => {
                                                    setEditing(
                                                        { target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX },
                                                        { first: '', focus: true }
                                                    );
                                                }}
                                                android_ripple={null}
                                            >
                                                <View style={styles.emptyLine} />
                                            </Pressable>
                                        )}

                                        {isAddingNewMovement && (
                                            <View
                                                collapsable={false}
                                                onLayout={(event) => registerMovementLayout(NEW_MOVEMENT_INDEX, event.nativeEvent.layout)}
                                                style={{ position: 'relative' }}
                                            >
                                                <MessageBubble
                                                    type="movement"
                                                    content={{ name: '', sets: [] }}
                                                    movementPlaceholderText="Movement"
                                                    showMovementPlaceholder={true}
                                                    isMovementNameHighlighted={isAddingNewMovement}
                                                    prependEmptyLine={false}
                                                    onMovementPress={() => {
                                                        setEditing(
                                                            { target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX },
                                                            { first: '', focus: true }
                                                        );
                                                    }}
                                                    onEmptyLinePress={() => {
                                                        setEditing(
                                                            { target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX },
                                                            { first: '', focus: true }
                                                        );
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
                                firstValue={firstInputValue}
                                secondValue={secondInputValue}
                                onFirstValueChange={handleFirstValueChange}
                                onSecondValueChange={setSecondInputValue}
                                onSubmit={handleEntrySubmit}
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
                                lastTimeNote={lastTimeNote}
                                onFirstFieldFocus={handleEntryFooterFocus}
                                focusRequest={focusRequest}
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
    ruledLinesSvg: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
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
});

export default LiftEditorScreen; 