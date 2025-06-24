import React, { useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    Modal,
    View,
    StyleSheet,
    useColorScheme,
    Platform,
    TouchableOpacity,
    Text,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import LiftPreviewList from './LiftPreviewList';
import { LiftPreview, RootStackParamList } from './types';
import { getDatabase, ref, set } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_STORAGE_KEYS, retrieveLifts } from './utils';

const { height } = Dimensions.get('window');

type LiftPreviewListScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftList'>;

// Helper functions for date generation
const generateMonths = () => {
    return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(2000, i, 1);
        return {
            value: String(i),
            label: date.toLocaleString('default', { month: 'long' })
        };
    });
};

const generateDays = (year: number, month: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1).padStart(2, '0')
    }));
};

const generateYears = () => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => ({
        value: String(currentYear - i),
        label: String(currentYear - i)
    }));
};

const LiftPreviewListScreen: React.FC = () => {
    const navigation = useNavigation<LiftPreviewListScreenNavigationProp>();
    const colorScheme = useColorScheme() || 'dark';
    const isDark = colorScheme === 'dark';

    const [lifts, setLifts] = useState<LiftPreview[]>([]);

    useFocusEffect(
        React.useCallback(() => {
            loadLifts();
        }, [])
    );

    const loadLifts = async () => {
        try {
            console.log('Loading lifts...');
            const liftsData = await retrieveLifts();
            console.log('Retrieved lifts data:', JSON.stringify(liftsData, null, 2));

            if (liftsData && typeof liftsData === 'object') {
                const formattedLifts = Object.entries(liftsData)
                    .map(([id, data]: [string, any]) => {
                        console.log('Processing lift:', id, data);
                        if (!data) {
                            console.log('Invalid lift data for id:', id);
                            return null;
                        }
                        return {
                            id: id,
                            date: data.date || id, // Fallback to id if date is missing
                            title: data.title || 'Untitled Lift',
                        };
                    })
                    .filter((lift): lift is LiftPreview => lift !== null)
                    .sort((a, b) => {
                        // Defensive sort that handles missing dates
                        const dateA = a.date || '';
                        const dateB = b.date || '';
                        return dateB.localeCompare(dateA);
                    });

                console.log('Formatted lifts:', JSON.stringify(formattedLifts, null, 2));
                setLifts(formattedLifts);
            } else {
                console.log('No lifts data found or invalid format');
                setLifts([]);
            }
        } catch (error) {
            console.error('Error loading lifts:', error);
            setLifts([]);
        }
    };

    const handleSelectLift = (liftId: string) => {
        navigation.navigate('LiftEditor', { liftId });
    };

    const handleDeleteLift = async (liftId: string) => {
        try {
            // Delete from local storage
            const liftsData = await retrieveLifts();
            delete liftsData[liftId];
            await AsyncStorage.setItem(LOCAL_STORAGE_KEYS.LIFTS, JSON.stringify(liftsData));

            // Update the UI
            setLifts(prev => prev.filter(lift => lift.id !== liftId));
        } catch (error) {
            console.error('Error deleting lift:', error);
        }
    };

    const handleCreateNewLift = () => {
        navigation.navigate('LiftEditor', {});
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
            <LiftPreviewList
                lifts={lifts}
                onSelectLift={handleSelectLift}
                onDeleteLift={handleDeleteLift}
                onCreateNewLift={handleCreateNewLift}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333',
        width: '100%',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        fontSize: 16,
    },
    doneButton: {
        padding: 8,
    },
    doneButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    pickerContainer: {
        width: '80%',
        borderRadius: 15,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    datePicker: {
        height: 200,
    },
});

export default LiftPreviewListScreen; 