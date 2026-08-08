import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiftPreviewList from './LiftPreviewList';
import { LiftPreview, RootStackParamList } from './types';
import { deleteLiftLocally } from './liftStore';
import { useLifts } from './useLifts';
import { compareLiftsByDateDesc } from './utils';
import { useTheme } from './theme';

type LiftPreviewListScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftList'>;

const LiftPreviewListScreen: React.FC = () => {
    const theme = useTheme();
    const navigation = useNavigation<LiftPreviewListScreenNavigationProp>();

    const allLifts = useLifts();

    const lifts = useMemo(() => {
        return Object.entries(allLifts)
            .map(([id, data]: [string, any]) => {
                if (!data) {
                    return null;
                }
                return {
                    id: id,
                    date: data.date || id, // Fallback to id if date is missing
                    title: data.title || 'Untitled Lift',
                };
            })
            .filter((lift): lift is LiftPreview => lift !== null)
            .sort(compareLiftsByDateDesc);
    }, [allLifts]);

    const handleSelectLift = (liftId: string) => {
        navigation.navigate('LiftEditor', { liftId });
    };

    const handleDeleteLift = async (liftId: string) => {
        try {
            await deleteLiftLocally(liftId);
        } catch (error) {
            console.error('Error deleting lift:', error);
        }
    };

    const handleCreateNewLift = () => {
        navigation.navigate('LiftEditor', {});
    };

    const handleOpenCharts = () => {
        navigation.navigate('Charts');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
            <LiftPreviewList
                lifts={lifts}
                onSelectLift={handleSelectLift}
                onDeleteLift={handleDeleteLift}
                onCreateNewLift={handleCreateNewLift}
                onOpenCharts={handleOpenCharts}
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
