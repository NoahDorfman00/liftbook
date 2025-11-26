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
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

interface LiftPreview {
    date: string;
    title: string;
    id: string;
}

interface LiftPreviewListProps {
    lifts: LiftPreview[];
    onSelectLift: (liftId: string) => void;
    onDeleteLift: (liftId: string) => void;
    onCreateNewLift: () => void;
}

const ACTION_WIDTH = 80;

const LiftPreviewList: React.FC<LiftPreviewListProps> = ({
    lifts,
    onSelectLift,
    onDeleteLift,
    onCreateNewLift,
}) => {
    const swipeableRefs = React.useRef<Map<string, Swipeable>>(new Map());

    const renderRightActions = (
        progress: Animated.AnimatedInterpolation<number>,
        _dragX: Animated.AnimatedInterpolation<number>,
        liftId: string,
        closeSwipeable: () => void
    ) => {
        const trans = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [ACTION_WIDTH, 0],
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
                    style={[styles.deleteButton]}
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
                    <Text style={styles.deleteButtonText}>Delete</Text>
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
                            backgroundColor: '#fff',
                        },
                    ]}
                    onPress={() => onSelectLift(item.id)}
                >
                    <Text style={[styles.date, { color: '#666' }]}>
                        {new Date(item.date.split('T')[0] + 'T12:00:00Z').toLocaleDateString()}
                    </Text>
                    <Text
                        style={[styles.title, { color: '#333' }]}
                        numberOfLines={1}
                    >
                        {item.title}
                    </Text>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: '#333' }]}>
                    Lifts
                </Text>
                <TouchableOpacity
                    style={styles.newButton}
                    onPress={onCreateNewLift}
                >
                    <Image
                        source={require('./assets/plus.png')}
                        style={styles.newButtonIcon}
                    />
                </TouchableOpacity>
            </View>
            <FlatList
                data={lifts}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#f5f5f5',
    },
    headerTitle: {
        fontSize: 32,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    newButton: {
        position: 'absolute',
        right: 16,
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
        backgroundColor: '#fff',
    },
    liftPreview: {
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e0e0e0',
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
        width: ACTION_WIDTH,
    },
    deleteButton: {
        flex: 1,
        backgroundColor: '#ff3b30',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: '600',
        fontFamily: 'Schoolbell',
        padding: 20,
    },
});

export default LiftPreviewList; 