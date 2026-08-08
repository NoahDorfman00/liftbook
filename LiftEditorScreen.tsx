import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Text,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    Image,
    LayoutChangeEvent,
    LayoutRectangle,
    Pressable,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import ReAnimated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import EntryFooter, { EntryMode } from './EntryFooter';
import MessageBubble from './MessageBubble';
import { useDrawer } from './useDrawer';
import { useKeyboardEvents } from './useKeyboardEvents';
import { RootStackParamList, Lift, Movement } from './types';
import { retrieveLift, saveLiftLocally, deleteLiftLocally } from './liftStore';
import { useLifts } from './useLifts';
import { todayISO, isoToDate, dateToISO, formatDisplayDate, matchesQuery } from './utils';
import { useTheme } from './theme';
import { buildTitleCandidates, buildMovementCandidates, getLastTimeNote } from './suggestionEngine';

type LiftEditorScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftEditor'>;
type LiftEditorScreenRouteProp = RouteProp<RootStackParamList, 'LiftEditor'>;

const NEW_MOVEMENT_INDEX = -1;

// Spinner (200) plus breathing room for the date dropdown under the header
const DATE_DRAWER_HEIGHT = 232;

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
    const theme = useTheme();
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
                    <Rect x={0} y={0} width={4000} height={1} fill={theme.line} />
                </Pattern>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#ruled)" />
        </Svg>
    );
});

const LiftEditorScreen: React.FC = () => {
    const theme = useTheme();
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

    const allLifts = useLifts();
    const [firstInputValue, setFirstInputValue] = useState('');
    const [secondInputValue, setSecondInputValue] = useState('');
    const [focusRequest, setFocusRequest] = useState(0);
    const [pendingDeleteMovementIndex, setPendingDeleteMovementIndex] = useState<number | null>(null);
    const [pendingDeleteSet, setPendingDeleteSet] = useState<{ movementIndex: number; setIndex: number } | null>(null);

    const editingTarget = editing.target;
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
    const scrollViewHeightRef = useRef(0);
    const keyboardHeightRef = useRef(0);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(10000);
    const titleLayoutRef = useRef<LayoutRectangle | null>(null);
    const movementLayoutsRef = useRef<Record<number, LayoutRectangle>>({});
    const setLayoutsRef = useRef<Record<string, LayoutRectangle>>({});
    const addSetLayoutsRef = useRef<Record<number, LayoutRectangle>>({});

    // The date picker drops down from under the header, mirroring the
    // charts screen's bottom sheet in reverse; spinner changes persist
    // immediately, so dismissing it is the only "confirm"
    const dateDrawer = useDrawer(DATE_DRAWER_HEIGHT, 'top', Keyboard.dismiss);
    // The picker's Date is derived from lift.date — one source of truth
    const pickerDate = React.useMemo(() => isoToDate(lift.date), [lift.date]);

    useEffect(() => {
        if (route.params?.liftId) {
            // Load existing lift data
            loadLift(route.params.liftId);
        } else {
            // New lift - focus the title input
            setEditing({ target: 'title' }, { focus: true });
        }
    }, [route.params?.liftId]);

    useKeyboardEvents(
        (e) => {
            keyboardHeightRef.current = e.endCoordinates.height;
            setKeyboardHeight(e.endCoordinates.height);
        },
        () => {
            keyboardHeightRef.current = 0;
            setKeyboardHeight(0);
        }
    );

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

        // Center the active row in the area that stays visible above the
        // keyboard, rather than pinning it a fixed margin from the top.
        const viewportHeight = scrollViewHeightRef.current || 600;
        const visibleHeight = Math.max(160, viewportHeight - keyboardHeightRef.current);
        const margin = Math.max(96, visibleHeight * 0.4);
        const scrollY = Math.max(0, targetY - margin);
        scrollViewRef.current.scrollTo({ y: scrollY, animated: true });
        return true;
    }, []);

    // No retry loop: if the target's layout isn't measured yet, the row's
    // onLayout callback below triggers the scroll as soon as it lands.
    const scheduleScrollToActiveTarget = React.useCallback(() => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => scrollToActiveEditingTarget());
        } else {
            scrollToActiveEditingTarget();
        }
    }, [scrollToActiveEditingTarget]);

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

    // Scroll whenever the editing target or the visible area changes
    useEffect(() => {
        if (editingTarget !== 'none') {
            scrollToActiveEditingTarget();
        }
    }, [
        scrollToActiveEditingTarget,
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
                // After adding a set (or editing the last one), line up the next
                // set entry. The editing-change effect and the row's onLayout
                // callbacks handle scrolling to keep it in view.
                setEditing(
                    { target: 'set', movementIndex, setIndex: newLift.movements[movementIndex].sets.length },
                    { focus: true, first: '', second: '' }
                );
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
                        navigation.navigate('LiftList');
                    }
                }
            ]
        );
    };

    const handleDateChange = (_: any, date?: Date) => {
        if (!date) {
            return;
        }

        // Persist so the list screen sees the new date
        const updatedLift: Lift = {
            ...lift,
            date: dateToISO(date),
        };

        updateLift(updatedLift);
        saveLift(updatedLift);
    };


    // No suggestions while entering sets — the "last time" note covers that
    const suggestionContext = React.useMemo<'title' | 'movement' | null>(() => {
        if (entryMode !== 'single') {
            return null;
        }
        if (editingTarget === 'title' || lift.title === '') {
            return 'title';
        }
        return 'movement';
    }, [entryMode, editingTarget, lift.title]);

    // Candidate lists are rebuilt only when the underlying data changes; the
    // per-keystroke query filters below work on these small lists.
    const titleCandidates = React.useMemo(
        () => buildTitleCandidates(allLifts, lift.id),
        [allLifts, lift.id]
    );

    const titleSuggestions = React.useMemo(() => {
        if (suggestionContext !== 'title') {
            return [];
        }
        const query = firstInputValue.trim().toLowerCase();
        return titleCandidates
            .filter(title => matchesQuery(title, query))
            .slice(0, 3);
    }, [suggestionContext, firstInputValue, titleCandidates]);

    const movementCandidates = React.useMemo(
        () => buildMovementCandidates(allLifts, lift),
        [allLifts, lift]
    );

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
        return getLastTimeNote(allLifts, lift, lift.movements[editingMovementIndex].name);
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


    const handleFooterLayout = React.useCallback((event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout;
        setFooterHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
    }, []);

    const contentBottomPadding = footerHeight + keyboardHeight + 48;

    const startNewMovement = React.useCallback(() => {
        setEditing(
            { target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX },
            { first: '', focus: true }
        );
    }, [setEditing]);

    const handleEntryFooterFocus = React.useCallback(() => {
        // If the footer was dismissed and the lift has a title, focusing the
        // field means the user wants to add a new movement.
        if (editingRef.current.target === 'none' && liftRef.current.title.trim().length > 0) {
            setEditing({ target: 'movementName', movementIndex: NEW_MOVEMENT_INDEX }, { first: '' });
        }
        scrollToActiveEditingTarget();
    }, [scrollToActiveEditingTarget, setEditing]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
            <KeyboardAvoidingView
                behavior={undefined}
                style={styles.keyboardAvoidingView}
            >
                <View style={[styles.header, { borderBottomColor: theme.line, backgroundColor: theme.surface }]}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Image source={require('./assets/back.png')} style={[styles.iconImage, { tintColor: theme.icon }]} />
                    </TouchableOpacity>

                    <View style={styles.headerCenter}>
                        <GestureDetector gesture={dateDrawer.handleGesture}>
                            <ReAnimated.View style={[styles.dateRow, dateDrawer.pressedStyle]}>
                                <Text style={[styles.dateText, { color: theme.textStrong }]}>
                                    {formatDisplayDate(lift.date)}
                                </Text>
                                <Animated.View style={{ transform: [{ rotate: dateDrawer.chevronRotate }] }}>
                                    <Svg width={20} height={14} viewBox="0 0 20 14">
                                        {/* Hand-drawn chevron pointing down; flips up while the picker is open */}
                                        <Path
                                            d="M2.5 2.2 Q6 6.5 9.8 10.6 Q10.3 11 10.9 10.4 Q14.5 6.8 17.8 2.8"
                                            fill="none"
                                            stroke={theme.textStrong}
                                            strokeWidth={2.3}
                                            strokeLinecap="round"
                                        />
                                    </Svg>
                                </Animated.View>
                            </ReAnimated.View>
                        </GestureDetector>
                    </View>

                    <TouchableOpacity
                        onPress={handleDeleteLift}
                        style={styles.iconButton}
                    >
                        <Image source={require('./assets/trash.png')} style={[styles.iconImage, { tintColor: theme.icon }]} />
                    </TouchableOpacity>
                </View>

                {/* Always mounted; the animated height clips it closed so the
                    drag can reveal it progressively. Content is anchored to
                    the bottom so it slides down with the drawer's edge. */}
                <ReAnimated.View style={[styles.dateDrawer, dateDrawer.drawerStyle, { backgroundColor: theme.surface }]}>
                    <View style={[styles.dateDrawerContent, { borderBottomColor: theme.line }]}>
                        <DateTimePicker
                            value={pickerDate}
                            mode="date"
                            display="spinner"
                            onChange={handleDateChange}
                            textColor={theme.textStrong}
                            themeVariant={theme.isDark ? 'dark' : 'light'}
                            style={styles.datePicker}
                        />
                        {/* The empty strip right of the wheels swipes the
                            drawer closed like the handle does; it sits beside
                            the spinner so the wheels stay untouched */}
                        <GestureDetector gesture={dateDrawer.panelSwipeGesture}>
                            <View style={styles.dateSwipeRight} />
                        </GestureDetector>
                    </View>
                </ReAnimated.View>

                {/* With the date picker open, touching anything below it —
                    inputs and footer included — dismisses it. Capture phase
                    observes the touch without claiming it, so the touched
                    control still gets its tap. */}
                <View
                    style={styles.content}
                    onStartShouldSetResponderCapture={() => {
                        if (dateDrawer.isOpen) {
                            dateDrawer.setOpen(false);
                        }
                        return false;
                    }}
                >
                    <ScrollView
                        ref={scrollViewRef}
                        style={[styles.scrollView, { backgroundColor: theme.paper }]}
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: contentBottomPadding }
                        ]}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        onLayout={(event) => {
                            scrollViewHeightRef.current = event.nativeEvent.layout.height;
                        }}
                    >
                        <View
                            style={[styles.notebookBackground, { backgroundColor: theme.paper }]}
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
                                    !isAddingNewMovement ? (
                                        <Pressable onPress={startNewMovement} android_ripple={null}>
                                            <View style={styles.emptyLine} />
                                        </Pressable>
                                    ) : (
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
                                                onMovementPress={startNewMovement}
                                                onEmptyLinePress={startNewMovement}
                                                isLast={true}
                                                onAddSetLayout={(layout) => registerAddSetLayout(NEW_MOVEMENT_INDEX, layout)}
                                            />
                                        </View>
                                    )
                                )}
                            </View>
                        </View>
                    </ScrollView>

                    {!isLoading && (
                        <View onLayout={handleFooterLayout}>
                            <EntryFooter
                                mode={entryMode}
                                keyboardHeight={keyboardHeight}
                                firstValue={firstInputValue}
                                secondValue={secondInputValue}
                                onFirstValueChange={setFirstInputValue}
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
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dateText: {
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Schoolbell',
    },
    dateDrawer: {
        overflow: 'hidden',
    },
    dateDrawerContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: DATE_DRAWER_HEIGHT,
        justifyContent: 'center',
        borderBottomWidth: 1,
    },
    // The spinner wheels span roughly the left 320pt; everything beyond
    // them is fair game for swiping the drawer closed
    dateSwipeRight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 76,
    },
    content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    notebookBackground: {
        flex: 1,
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
    datePicker: {
        height: 200,
    },
    emptyLine: {
        height: 24,
        position: 'relative',
    },
});

export default LiftEditorScreen; 