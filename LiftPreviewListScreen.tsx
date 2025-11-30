import React, { useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiftPreviewList from './LiftPreviewList';
import { LiftPreview, RootStackParamList } from './types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_STORAGE_KEYS, retrieveLifts } from './utils';

type LiftPreviewListScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftList'>;

const LiftPreviewListScreen: React.FC = () => {
    const navigation = useNavigation<LiftPreviewListScreenNavigationProp>();

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
                        // Sort by date - newer dates first
                        // Defensive sort that handles missing dates
                        const dateA = a.date || '';
                        const dateB = b.date || '';
                        const dateCompare = dateB.localeCompare(dateA);
                        // If dates are the same, use timestamp (id) as tiebreaker for consistent ordering
                        if (dateCompare === 0) {
                            const idA = Number.isNaN(Number(a.id)) ? 0 : Number(a.id);
                            const idB = Number.isNaN(Number(b.id)) ? 0 : Number(b.id);
                            return idB - idA; // Newer timestamp first
                        }
                        return dateCompare;
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
});

export default LiftPreviewListScreen; 