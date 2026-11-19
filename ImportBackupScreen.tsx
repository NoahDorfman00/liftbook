import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Lift, RootStackParamList } from './types';
import { BackupError, liftCount, parseBackup, planImport, readBackupFile } from './backup';
import { importLifts } from './liftStore';
import { useLifts } from './useLifts';
import { formatDisplayDate } from './utils';
import { useTheme } from './theme';

type ImportBackupNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImportBackup'>;
type ImportBackupRouteProp = RouteProp<RootStackParamList, 'ImportBackup'>;

// What's in a backup file, and one button to bring it in. Import only adds
// lifts this phone doesn't have (see backup.ts); dismissing saves nothing.
const ImportBackupScreen: React.FC = () => {
    const theme = useTheme();
    const navigation = useNavigation<ImportBackupNavigationProp>();
    const route = useRoute<ImportBackupRouteProp>();
    const { fileUrl } = route.params;

    const existing = useLifts();
    // undefined while the file is being read, null once it has failed
    const [incoming, setIncoming] = useState<Lift[] | null | undefined>(undefined);
    const [importing, setImporting] = useState(false);

    // Read once: the native side deletes the app's copy of the file after
    // handing over its contents
    useEffect(() => {
        let cancelled = false;
        const fail = (title: string, message: string) => {
            if (cancelled) {
                return;
            }
            setIncoming(null);
            Alert.alert(title, message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
        };
        readBackupFile(fileUrl)
            .then(text => {
                const lifts = parseBackup(text);
                if (!cancelled) {
                    setIncoming(lifts);
                }
            })
            .catch(error => {
                if (error instanceof BackupError && error.reason === 'newer') {
                    fail(
                        "Couldn't open backup",
                        'This backup comes from a newer version of Liftbook. Update the app and try again.'
                    );
                } else {
                    fail("Couldn't open backup", "This file isn't a Liftbook backup, or it couldn't be read.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [fileUrl, navigation]);

    const plan = useMemo(() => (incoming ? planImport(existing, incoming) : null), [existing, incoming]);

    const handleImport = async () => {
        if (!plan || importing) {
            return;
        }
        setImporting(true);
        try {
            await importLifts(plan.toAdd);
            navigation.goBack();
        } catch {
            setImporting(false);
            Alert.alert("Couldn't import", 'Nothing was changed. Try again.');
        }
    };

    const dateRange = plan && plan.firstDate && plan.lastDate
        ? plan.firstDate === plan.lastDate
            ? formatDisplayDate(plan.firstDate)
            : `${formatDisplayDate(plan.firstDate)} – ${formatDisplayDate(plan.lastDate)}`
        : null;
    const nothingToAdd = !!plan && plan.toAdd.length === 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]} edges={['top', 'bottom']}>
            <View style={[styles.header, { borderBottomColor: theme.line, backgroundColor: theme.surface }]}>
                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => navigation.goBack()}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                >
                    <Text style={[styles.closeText, { color: theme.icon }]}>✕</Text>
                </TouchableOpacity>
                <View style={styles.headerCenter} pointerEvents="none">
                    <Text style={[styles.headerTitle, { color: theme.textStrong }]}>
                        Import backup
                    </Text>
                </View>
                {/* spacer to keep the title centered */}
                <View style={styles.closeButton} />
            </View>

            <View style={[styles.body, { backgroundColor: theme.paper }]}>
                {!!plan && (
                    <>
                        <Text style={[styles.count, { color: theme.textStrong }]}>
                            {liftCount(plan.total)}
                        </Text>
                        {!!dateRange && (
                            <Text style={[styles.detail, { color: theme.textSecondary }]}>
                                {dateRange}
                            </Text>
                        )}
                        {plan.total === 0 ? (
                            <Text style={[styles.detail, { color: theme.textSecondary }]}>
                                This backup is empty.
                            </Text>
                        ) : nothingToAdd ? (
                            <Text style={[styles.detail, { color: theme.textSecondary }]}>
                                All of them are already on this phone.
                            </Text>
                        ) : plan.alreadyHere > 0 ? (
                            <Text style={[styles.detail, { color: theme.textSecondary }]}>
                                {plan.alreadyHere === 1
                                    ? '1 is already on this phone'
                                    : `${plan.alreadyHere} are already on this phone`}
                            </Text>
                        ) : null}
                    </>
                )}
            </View>

            {!!plan && (
                <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.line }]}>
                    {!nothingToAdd && (
                        <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
                            Lifts already on this phone stay as they are.
                        </Text>
                    )}
                    <TouchableOpacity
                        style={[styles.importButton, { borderColor: theme.textStrong }, importing && styles.busy]}
                        onPress={nothingToAdd ? () => navigation.goBack() : handleImport}
                        disabled={importing}
                    >
                        <Text style={[styles.importButtonText, { color: theme.textStrong }]}>
                            {nothingToAdd ? 'Done' : `Import ${liftCount(plan.toAdd.length)}`}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
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
    headerTitle: {
        fontSize: 26,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
    },
    closeButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        minWidth: 36,
    },
    closeText: {
        fontSize: 26,
        fontFamily: 'Schoolbell',
    },
    body: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 8,
    },
    count: {
        fontSize: 40,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    detail: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
        textAlign: 'center',
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        gap: 10,
    },
    footerHint: {
        fontSize: 15,
        fontFamily: 'Schoolbell',
        textAlign: 'center',
    },
    importButton: {
        borderWidth: 2,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 40,
        alignSelf: 'stretch',
        alignItems: 'center',
    },
    importButtonText: {
        fontSize: 24,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
    },
    busy: {
        opacity: 0.5,
    },
});

export default ImportBackupScreen;
