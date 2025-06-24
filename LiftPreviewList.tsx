import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    useColorScheme,
    Animated,
    Dimensions,
    Button,
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

const { width } = Dimensions.get('window');

const LiftPreviewList: React.FC<LiftPreviewListProps> = ({
    lifts,
    onSelectLift,
    onDeleteLift,
    onCreateNewLift,
}) => {
    const colorScheme = useColorScheme() || 'dark';
    const isDark = colorScheme === 'dark';

    const renderRightActions = (
        progress: Animated.AnimatedInterpolation<number>,
        _dragX: Animated.AnimatedInterpolation<number>,
        liftId: string
    ) => {
        const trans = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [width, 0],
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
                    onPress={() => onDeleteLift(liftId)}
                >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }: { item: LiftPreview }) => (
        <Swipeable
            renderRightActions={(progress, dragX) =>
                renderRightActions(progress, dragX, item.id)
            }
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

    return (
        <View style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: '#333' }]}>
                    Lifts
                </Text>
                <TouchableOpacity
                    style={[styles.newButton, { backgroundColor: '#e0e0e0' }]}
                    onPress={onCreateNewLift}
                >
                    <Text style={[styles.newButtonText, { color: '#333' }]}>
                        New Lift
                    </Text>
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
        justifyContent: 'space-between',
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
    },
    newButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    newButtonText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        fontWeight: '500',
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
        width: 80,
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