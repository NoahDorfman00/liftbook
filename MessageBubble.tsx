import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Platform,
    UIManager,
    LayoutRectangle,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Set {
    weight: string;
    reps: string;
}

interface Movement {
    name: string;
    sets: Set[];
}

interface MessageBubbleProps {
    type: 'title' | 'movement';
    content: string | Movement;
    // Title handlers
    onTitlePress?: () => void;
    onTitleLongPress?: () => void;
    // Movement name handlers
    onMovementPress?: () => void;
    onMovementLongPress?: () => void;
    // Set row handlers (index provided)
    onSetPress?: (setIndex: number) => void;
    onSetLongPress?: (setIndex: number) => void;
    // Empty line under movement
    onEmptyLinePress?: () => void;
    isEditing?: boolean;
    isLast?: boolean;
    onTitleLayout?: (layout: LayoutRectangle) => void;
    onSetLayout?: (setIndex: number, layout: LayoutRectangle) => void;
    onAddSetLayout?: (layout: LayoutRectangle) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
    type,
    content,
    onTitlePress,
    onTitleLongPress,
    onMovementPress,
    onMovementLongPress,
    onSetPress,
    onSetLongPress,
    onEmptyLinePress,
    isEditing = false,
    isLast = false,
    onTitleLayout,
    onSetLayout,
    onAddSetLayout,
}) => {
    const pressableHitSlop = { top: 2, bottom: 2, left: 0, right: 0 }; // 28px container, 24px touch area

    if (type === 'title') {
        return (
            <>
                <View
                    style={styles.titleLineContainer}
                    onLayout={(event) => onTitleLayout?.(event.nativeEvent.layout)}
                >
                    <Pressable hitSlop={pressableHitSlop} onLongPress={onTitleLongPress} onPress={onTitlePress}>
                        <Text style={styles.titleText}>{content as string}</Text>
                    </Pressable>
                </View>
                {!isLast && <View style={styles.emptyLine} />}
            </>
        );
    }

    const movement = content as Movement;
    return (
        <>
            <View style={styles.movementLineContainer}>
                <Pressable hitSlop={pressableHitSlop} onLongPress={onMovementLongPress} onPress={onMovementPress}>
                    <Text style={styles.movementText}>{movement.name}</Text>
                </Pressable>
            </View>
            {movement.sets.map((set, idx) => (
                <View
                    style={styles.lineContainer}
                    key={idx}
                    onLayout={(event) => onSetLayout?.(idx, event.nativeEvent.layout)}
                >
                    <Pressable
                        hitSlop={pressableHitSlop}
                        onLongPress={() => onSetLongPress && onSetLongPress(idx)}
                        onPress={() => onSetPress && onSetPress(idx)}
                    >
                        <Text style={[styles.text, styles.setText]}>{set.weight} × {set.reps}</Text>
                    </Pressable>
                </View>
            ))}
            <Pressable onPress={onEmptyLinePress}>
                <View
                    style={styles.emptyLine}
                    onLayout={(event) => onAddSetLayout?.(event.nativeEvent.layout)}
                />
            </Pressable>
            {!isLast && <View style={styles.emptyLine} />}
        </>
    );
};

const styles = StyleSheet.create({
    lineContainer: {
        height: 24, // fits ruled line for sets
        justifyContent: 'flex-end',
    },
    titleLineContainer: {
        height: 48, // Two lines
        justifyContent: 'center',
    },
    movementLineContainer: {
        height: 28, // allow descenders for movement name
        justifyContent: 'flex-end',
        marginBottom: -4, // shrink gap below movement name
    },
    text: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        color: '#000',
        padding: 0,
        margin: 0,
    },
    titleText: {
        fontSize: 32,
        fontFamily: 'Schoolbell',
        color: '#000',
        fontWeight: 'bold',
        textAlignVertical: 'center',
        textAlign: 'left',
    },
    movementText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        color: '#000',
    },
    setText: {
        fontSize: 20,
        marginLeft: 8,
    },
    emptyLine: {
        height: 24,
    },
    setLineContainer: {
        // no negative margin here
    },
});

export default MessageBubble; 