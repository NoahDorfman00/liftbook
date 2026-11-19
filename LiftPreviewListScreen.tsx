import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActionSheetIOS, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiftPreviewList from './LiftPreviewList';
import { LiftPreview, RootStackParamList } from './types';
import { useStoryShare } from './useStoryShare';
import { deleteLiftLocally } from './liftStore';
import { useLifts } from './useLifts';
import { compareLiftsByDateDesc } from './utils';
import { useTheme } from './theme';
import { backupSupported, exportBackupFile, pickBackupFile } from './backup';

type LiftPreviewListScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LiftList'>;

const LiftPreviewListScreen: React.FC = () => {
    const theme = useTheme();
    const navigation = useNavigation<LiftPreviewListScreenNavigationProp>();

    const allLifts = useLifts();
    const story = useStoryShare(allLifts);

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

    // no-ops for lifts with nothing to graph
    const handleShareLift = (liftId: string) => story.shareLift(allLifts[liftId]);

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

    // Import: pick a backup file, then the import screen shows what's in it
    const handleImportBackup = async () => {
        try {
            const fileUrl = await pickBackupFile();
            if (fileUrl) {
                navigation.navigate('ImportBackup', { fileUrl });
            }
        } catch (error) {
            console.error('Error picking backup:', error);
            Alert.alert("Couldn't open the file picker");
        }
    };

    // Export: the whole history as one file in the share sheet
    const handleExportBackup = async () => {
        try {
            await exportBackupFile(allLifts);
        } catch (error) {
            console.error('Error exporting backup:', error);
            Alert.alert("Couldn't export your lifts");
        }
    };

    const handleBackUp = () => {
        ActionSheetIOS.showActionSheetWithOptions(
            {
                options: ['Export backup', 'Import backup', 'Cancel'],
                cancelButtonIndex: 2,
                userInterfaceStyle: theme.isDark ? 'dark' : 'light',
            },
            (index) => {
                if (index === 0) {
                    handleExportBackup();
                } else if (index === 1) {
                    handleImportBackup();
                }
            }
        );
    };

    const canBackUp = backupSupported();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
            <LiftPreviewList
                lifts={lifts}
                onSelectLift={handleSelectLift}
                onShareLift={handleShareLift}
                onDeleteLift={handleDeleteLift}
                onCreateNewLift={handleCreateNewLift}
                onOpenCharts={handleOpenCharts}
                onBackUp={canBackUp ? handleBackUp : undefined}
                onImportBackup={canBackUp ? handleImportBackup : undefined}
            />
            {story.element}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default LiftPreviewListScreen;
