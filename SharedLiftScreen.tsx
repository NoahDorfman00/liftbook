import React, { useEffect, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MessageBubble from './MessageBubble';
import { RootStackParamList } from './types';
import { decodeSharePayload, importedLiftFromPayload, SharedLiftPayload } from './shareCard';
import { saveLiftLocally } from './liftStore';
import { todayISO, formatDisplayDate } from './utils';
import { useTheme } from './theme';

type SharedLiftNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SharedLift'>;
type SharedLiftRouteProp = RouteProp<RootStackParamList, 'SharedLift'>;

// Preview of a lift someone shared via a liftbook link. Read-only render of
// the sharer's workout; "Try this lift" creates the recipient's own copy
// (movement names, empty sets) and opens it in the editor with the sharer's
// numbers riding along as ephemeral hints. Dismissing saves nothing — the
// link is the data, so it can always be re-tapped.
const SharedLiftScreen: React.FC = () => {
    const theme = useTheme();
    const navigation = useNavigation<SharedLiftNavigationProp>();
    const route = useRoute<SharedLiftRouteProp>();

    const shared = useMemo<SharedLiftPayload | null>(() => {
        try {
            const decoded = decodeSharePayload(route.params.payload);
            return decoded.movements.length > 0 ? decoded : null;
        } catch {
            return null;
        }
    }, [route.params.payload]);

    useEffect(() => {
        if (!shared) {
            Alert.alert(
                "Couldn't open shared lift",
                'This link could not be read. It may come from a newer version of Liftbook.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        }
    }, [shared, navigation]);

    const handleTryIt = async () => {
        if (!shared) {
            return;
        }
        const lift = importedLiftFromPayload(shared, Date.now().toString(), todayISO());
        await saveLiftLocally(lift);
        navigation.replace('LiftEditor', {
            liftId: lift.id,
            sharedTargets: shared.movements,
        });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]} edges={['top', 'bottom']}>
            <View style={[styles.header, { borderBottomColor: theme.line, backgroundColor: theme.surface }]}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Text style={[styles.closeText, { color: theme.icon }]}>✕</Text>
                </TouchableOpacity>
                <View style={styles.headerCenter} pointerEvents="none">
                    <Text style={[styles.headerTitle, { color: theme.textStrong }]}>
                        Shared lift
                    </Text>
                    {!!shared && (
                        <Text style={[styles.headerDate, { color: theme.textSecondary }]}>
                            {formatDisplayDate(shared.date)}
                        </Text>
                    )}
                </View>
                {/* spacer to keep the title centered */}
                <View style={styles.closeButton} />
            </View>

            {!!shared && (
                <>
                    <ScrollView
                        style={[styles.scroll, { backgroundColor: theme.paper }]}
                        contentContainerStyle={styles.scrollContent}
                    >
                        <MessageBubble type="title" content={shared.title} isLast={false} />
                        {shared.movements.map((movement, index) => (
                            <MessageBubble
                                key={index}
                                type="movement"
                                content={movement}
                                isLast={index === shared.movements.length - 1}
                            />
                        ))}
                    </ScrollView>

                    <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.line }]}>
                        <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
                            Their numbers stay as targets — you log your own.
                        </Text>
                        <TouchableOpacity
                            style={[styles.tryButton, { borderColor: theme.textStrong }]}
                            onPress={handleTryIt}
                        >
                            <Text style={[styles.tryButtonText, { color: theme.textStrong }]}>
                                Try this lift
                            </Text>
                        </TouchableOpacity>
                    </View>
                </>
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
    headerDate: {
        fontSize: 14,
        fontFamily: 'Schoolbell',
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
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
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
    tryButton: {
        borderWidth: 2,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 40,
        alignSelf: 'stretch',
        alignItems: 'center',
    },
    tryButtonText: {
        fontSize: 24,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
    },
});

export default SharedLiftScreen;
