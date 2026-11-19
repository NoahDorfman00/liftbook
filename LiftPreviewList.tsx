import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Animated,
    Alert,
    Image,
    Dimensions,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { LiftPreview } from './types';
import { formatDisplayDate } from './utils';
import { liftCount } from './backup';
import { useTheme } from './theme';

interface LiftPreviewListProps {
    lifts: LiftPreview[];
    onSelectLift: (liftId: string) => void;
    onShareLift: (liftId: string) => void;
    onDeleteLift: (liftId: string) => void;
    onCreateNewLift: () => void;
    onOpenCharts: () => void;
    // Moving lifts between phones (backup.ts). Left out where the platform
    // can't do it, which hides both entry points.
    onBackUp?: () => void;       // footer under the list: export or import
    onImportBackup?: () => void; // empty state: straight to the file picker
}

const ACTION_WIDTH = 80;
// Share and Delete side by side behind the swipe
const ACTIONS_WIDTH = ACTION_WIDTH * 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const PLUS_ICON_WIDTH = 28;
const PLUS_BUTTON_HORIZONTAL_PADDING = 8;
const PLUS_EFFECTIVE_WIDTH = PLUS_ICON_WIDTH + PLUS_BUTTON_HORIZONTAL_PADDING * 2;
const ARROW_RIGHT_MARGIN = PLUS_EFFECTIVE_WIDTH / 2; // center of the plus button

const BACKUP_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const ChartIcon = ({ color }: { color: string }) => (
    <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path
            d="M4 20 Q8 18, 10 14 Q12 10, 15 12 Q18 14, 20 6 Q21 4, 22 3"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
        <Path
            d="M4 22 L4 4"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
        />
        <Path
            d="M4 22 L23 22"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
        />
    </Svg>
);

const LiftPreviewList: React.FC<LiftPreviewListProps> = ({
    lifts,
    onSelectLift,
    onShareLift,
    onDeleteLift,
    onCreateNewLift,
    onOpenCharts,
    onBackUp,
    onImportBackup,
}) => {
    const theme = useTheme();
    const swipeableRefs = React.useRef<Map<string, Swipeable>>(new Map());

    const renderRightActions = (
        progress: Animated.AnimatedInterpolation<number>,
        _dragX: Animated.AnimatedInterpolation<number>,
        liftId: string,
        closeSwipeable: () => void
    ) => {
        const trans = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [ACTIONS_WIDTH, 0],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View
                style={[
                    styles.rightAction,
                    {
                        transform: [{ translateX: trans }],
                    },
                ]}
            >
                <TouchableOpacity
                    style={[styles.shareButton, { backgroundColor: theme.textMuted }]}
                    onPress={() => {
                        closeSwipeable();
                        onShareLift(liftId);
                    }}
                >
                    <Text style={styles.actionButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.deleteButton, { backgroundColor: theme.destructive }]}
                    onPress={() => {
                        Alert.alert(
                            'Delete lift?',
                            'This will permanently delete this lift.',
                            [
                                {
                                    text: 'Cancel',
                                    style: 'cancel',
                                    onPress: () => closeSwipeable()
                                },
                                { text: 'Delete', style: 'destructive', onPress: () => onDeleteLift(liftId) },
                            ]
                        );
                    }}
                >
                    <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }: { item: LiftPreview }) => {
        return (
            <Swipeable
                ref={(ref) => {
                    if (ref) {
                        swipeableRefs.current.set(item.id, ref);
                    } else {
                        swipeableRefs.current.delete(item.id);
                    }
                }}
                renderRightActions={(progress, dragX) => {
                    const closeSwipeable = () => {
                        const swipeable = swipeableRefs.current.get(item.id);
                        swipeable?.close();
                    };
                    return renderRightActions(progress, dragX, item.id, closeSwipeable);
                }}
                rightThreshold={ACTION_WIDTH / 2}
                overshootRight={false}
                friction={2}
            >
                <TouchableOpacity
                    style={[
                        styles.liftPreview,
                        {
                            backgroundColor: theme.paper,
                            borderBottomColor: theme.line,
                        },
                    ]}
                    onPress={() => onSelectLift(item.id)}
                >
                    <Text style={[styles.date, { color: theme.textSecondary }]}>
                        {formatDisplayDate(item.date)}
                    </Text>
                    <Text
                        style={[styles.title, { color: theme.textStrong }]}
                        numberOfLines={1}
                    >
                        {item.title}
                    </Text>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    const hasLifts = lifts.length > 0;

    // Only rendered under a non-empty list; with no lifts there is nothing
    // to back up, and the empty state offers import instead
    const listFooter = onBackUp ? (
        <View style={styles.backupFooter}>
            <Text style={[styles.backupFooterText, { color: theme.textTertiary }]}>
                {liftCount(lifts.length)} ·{' '}
            </Text>
            <TouchableOpacity
                onPress={onBackUp}
                hitSlop={BACKUP_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Back up lifts"
            >
                <Text style={[styles.backupFooterText, styles.backupFooterLink, { color: theme.textSecondary }]}>
                    Back up
                </Text>
            </TouchableOpacity>
        </View>
    ) : null;

    return (
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
            <View style={[styles.header, { borderBottomColor: theme.line, backgroundColor: theme.surface }]}>
                <TouchableOpacity
                    style={styles.chartButton}
                    onPress={onOpenCharts}
                >
                    <ChartIcon color={theme.icon} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: theme.textStrong }]}>
                        Lifts
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.newButton}
                    onPress={onCreateNewLift}
                >
                    <Image
                        source={require('./assets/plus.png')}
                        style={[styles.newButtonIcon, { tintColor: theme.icon }]}
                    />
                </TouchableOpacity>
            </View>

            {hasLifts ? (
                <FlatList
                    data={lifts}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={[styles.listContent, { backgroundColor: theme.paper }]}
                    ListFooterComponent={listFooter}
                />
            ) : (
                <View style={[styles.emptyStateContainer, { backgroundColor: theme.paper }]}>
                    <Image
                        source={require('./assets/start-here.png')}
                        style={[styles.emptyStateImage, { tintColor: theme.icon }]}
                    />
                    <Text style={[styles.emptyStateText, { color: theme.textStrong }]}>
                        log your first lift
                    </Text>
                    {!!onImportBackup && (
                        <TouchableOpacity
                            style={styles.emptyStateImport}
                            onPress={onImportBackup}
                            hitSlop={BACKUP_HIT_SLOP}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.emptyStateImportText, { color: theme.textSecondary }]}>
                                or import a backup
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerCenter: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 32,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    chartButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    newButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    newButtonIcon: {
        width: 28,
        height: 28,
        resizeMode: 'contain',
    },
    listContent: {
        paddingVertical: 0,
    },
    liftPreview: {
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    date: {
        fontSize: 16,
        fontFamily: 'Schoolbell',
        marginBottom: 4,
    },
    title: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        fontWeight: '500',
    },
    rightAction: {
        marginVertical: 8,
        width: ACTIONS_WIDTH,
        flexDirection: 'row',
    },
    shareButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonText: {
        color: 'white',
        fontWeight: '600',
        fontFamily: 'Schoolbell',
        padding: 20,
    },
    emptyStateContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        alignItems: 'stretch',
    },
    emptyStateImage: {
        width: SCREEN_WIDTH / 2 - ARROW_RIGHT_MARGIN,
        height: 180,
        resizeMode: 'contain',
        marginBottom: 4,
        alignSelf: 'flex-end',
        marginRight: ARROW_RIGHT_MARGIN,
    },
    backupFooter: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 20,
        paddingBottom: 28,
    },
    backupFooterText: {
        fontSize: 16,
        fontFamily: 'Schoolbell',
    },
    backupFooterLink: {
        textDecorationLine: 'underline',
    },
    emptyStateImport: {
        alignSelf: 'center',
        marginTop: 12,
    },
    emptyStateImportText: {
        fontSize: 18,
        fontFamily: 'Schoolbell',
        textDecorationLine: 'underline',
    },
    emptyStateText: {
        fontSize: 24,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 0,
    },
});

export default LiftPreviewList; 