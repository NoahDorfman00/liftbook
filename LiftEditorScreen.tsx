import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    useColorScheme,
    TouchableOpacity,
    Text,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import EntryFooter, { EntryMode } from './EntryFooter';
import MessageBubble from './MessageBubble';
import { RootStackParamList } from './types';
import { getDatabase, ref, set } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_STORAGE_KEYS, retrieveLift, saveLiftLocally } from './utils';

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
    const colorScheme = useColorScheme() || 'dark';
    const isDark = colorScheme === 'dark';
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
    const [editingMovementIndex, setEditingMovementIndex] = useState<number | null>(null);
    const [editingSetIndex, setEditingSetIndex] = useState<number | null>(null);

    const scrollViewRef = useRef<ScrollView>(null);

    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
        const [year, month, day] = lift.date.split('-').map(Number);
        return new Date(year, month - 1, day);
    });

    const isSubmitting = useRef<boolean>(false);

    useEffect(() => {
        console.log('EntryMode changed:', {
            mode: entryMode,
            hasLiftId: !!route.params?.liftId,
            title: lift.title,
            editingMovementIndex,
            editingSetIndex
        });
    }, [entryMode, route.params?.liftId, lift.title, editingMovementIndex, editingSetIndex]);

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
            }
        );

        const keyboardWillHide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => {
                console.log('LiftEditor - Keyboard hiding, timestamp:', Date.now());
            }
        );

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
        };
    }, []);

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
            setEntryMode('single');
            setEditingMovementIndex(null);
            setEditingSetIndex(null);
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
        } catch (error) {
            console.error('Error saving lift:', error);
        }
    };

    const handleEntrySubmit = ({ first, second }: { first: string; second?: string }) => {
        if (entryMode === 'single') {
            if (lift.title === '') {
                // Setting title
                const newLift = { ...lift, title: first };
                setLift(newLift);
                saveLift(newLift);
                // After setting title, immediately prompt for movement name
                console.log('Title set, prompting for movement name');
                setEntryMode('single');
            } else {
                console.log('Adding new movement:', first);
                // Adding new movement
                const newLift = {
                    ...lift,
                    movements: [...lift.movements, { name: first, sets: [] }],
                };
                setLift(newLift);
                // After adding movement, immediately switch to weight/reps entry
                setEditingMovementIndex(lift.movements.length);
                setEditingSetIndex(0);
                setEntryMode('double');
            }
        } else if (entryMode === 'double' && second) {
            console.log('Adding set:', { weight: first, reps: second });
            console.log('Current movement index:', editingMovementIndex);
            console.log('Current movement:', lift.movements[editingMovementIndex!]);

            // Create a deep copy of the lift to ensure state updates properly
            const newLift = {
                ...lift,
                movements: lift.movements.map((m, idx) => {
                    if (idx === editingMovementIndex) {
                        return {
                            ...m,
                            sets: [...m.sets, { weight: first, reps: second }]
                        };
                    }
                    return m;
                })
            };

            console.log('Updated lift:', newLift);
            setLift(newLift);
            saveLift(newLift);

            // Prepare for the next set entry
            setEditingSetIndex(newLift.movements[editingMovementIndex!].sets.length);

            // Keep keyboard open and entry mode as double for next set
            setEntryMode('double');

            // Scroll to the bottom to show the new set
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    };

    const handleMovementLongPress = (index: number) => {
        Alert.alert(
            'Edit Movement',
            'What would you like to do?',
            [
                {
                    text: 'Edit Name',
                    onPress: () => {
                        setEditingMovementIndex(index);
                        setEditingSetIndex(null);
                        setEntryMode('single');
                    },
                },
                {
                    text: 'Edit Sets',
                    onPress: () => {
                        setEditingMovementIndex(index);
                        setEditingSetIndex(0);
                        setEntryMode('double');
                    },
                },
                {
                    text: 'Delete',
                    onPress: () => {
                        setLift(prev => ({
                            ...prev,
                            movements: prev.movements.filter((_, i) => i !== index),
                        }));
                    },
                    style: 'destructive',
                },
                {
                    text: 'Cancel',
                    style: 'cancel',
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
        }
    };

    const handleDatePress = () => {
        setIsDatePickerVisible(true);
    };

    const handleDateChange = (_: any, date?: Date) => {
        if (date) {
            setSelectedDate(date);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;
            setLift(prev => ({ ...prev, date: dateString }));
        }
    };

    const handleScrollViewLayout = (event: any) => {
        console.log('ScrollView layout:', {
            height: event.nativeEvent.layout.height,
            y: event.nativeEvent.layout.y
        });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardAvoidingView}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={[styles.backButtonText, { color: '#333' }]}>
                            Back
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDatePress}>
                        <Text style={[styles.dateText, { color: '#333' }]}>
                            {new Date(lift.date.split('T')[0] + 'T12:00:00Z').toLocaleDateString()}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.content}>
                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        onLayout={handleScrollViewLayout}
                    >
                        <View style={styles.notebookBackground}>
                            <RuledLines />
                            <View style={styles.contentContainer}>
                                {lift.title && (
                                    <MessageBubble
                                        type="title"
                                        content={lift.title}
                                        onLongPress={() => {
                                            setEntryMode('single');
                                            setEditingMovementIndex(null);
                                            setEditingSetIndex(null);
                                        }}
                                        isLast={lift.movements.length === 0}
                                    />
                                )}

                                {lift.movements.map((movement, index) => (
                                    <MessageBubble
                                        key={index}
                                        type="movement"
                                        content={movement}
                                        onLongPress={() => handleMovementLongPress(index)}
                                        isEditing={editingMovementIndex === index}
                                        isLast={index === lift.movements.length - 1}
                                    />
                                ))}
                            </View>
                        </View>
                    </ScrollView>

                    {!isLoading && (
                        <EntryFooter
                            mode={entryMode}
                            onSubmit={handleEntrySubmit}
                            initialValues={
                                editingMovementIndex !== null && editingSetIndex !== null
                                    ? {
                                        first: lift.movements[editingMovementIndex].sets[editingSetIndex]?.weight || '',
                                        second: lift.movements[editingMovementIndex].sets[editingSetIndex]?.reps || '',
                                    }
                                    : undefined
                            }
                            firstPlaceholder={
                                lift.title === ''
                                    ? 'Enter lift title...'
                                    : editingMovementIndex !== null && editingSetIndex !== null
                                        ? 'Enter weight...'
                                        : 'Enter movement name...'
                            }
                            secondPlaceholder="Enter reps..."
                            onKeyboardDismiss={handleKeyboardDismiss}
                        />
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
    },
    backButton: {
        marginRight: 16,
    },
    backButtonText: {
        fontSize: 16,
        fontWeight: '500',
        fontFamily: 'Schoolbell',
    },
    dateText: {
        fontSize: 16,
        fontWeight: '500',
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
});

export default LiftEditorScreen; 