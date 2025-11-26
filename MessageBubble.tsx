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
    isTitleHighlighted?: boolean;
    showTitlePlaceholder?: boolean;
    titlePlaceholderText?: string;
    isMovementNameHighlighted?: boolean;
    showMovementPlaceholder?: boolean;
    movementPlaceholderText?: string;
    highlightedSetIndex?: number | null;
    showSetPlaceholder?: boolean;
    setPlaceholderText?: string;
    prependEmptyLine?: boolean;
    isMovementPendingDelete?: boolean;
    pendingDeleteSetIndex?: number | null;
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
    isTitleHighlighted = false,
    showTitlePlaceholder = false,
    titlePlaceholderText = '',
    isMovementNameHighlighted = false,
    showMovementPlaceholder = false,
    movementPlaceholderText = '',
    highlightedSetIndex = null,
    showSetPlaceholder = false,
    setPlaceholderText = '',
    prependEmptyLine = false,
    isMovementPendingDelete = false,
    pendingDeleteSetIndex = null,
}) => {
    const pressableHitSlop = { top: 2, bottom: 2, left: 0, right: 0 }; // 28px container, 24px touch area

    if (type === 'title') {
        const titleContent = (content as string) ?? '';
        const isPlaceholderActive = showTitlePlaceholder && titleContent.trim().length === 0;
        const displayTitle = isPlaceholderActive ? titlePlaceholderText : titleContent;

        return (
            <>
                <View
                    style={styles.titleLineContainer}
                    onLayout={(event) => onTitleLayout?.(event.nativeEvent.layout)}
                >
                    <Pressable
                        hitSlop={pressableHitSlop}
                        onPress={onTitlePress}
                        onLongPress={onTitleLongPress}
                    >
                        {({ pressed }) => (
                            <Text
                                style={[
                                    styles.titleText,
                                    (isEditing || isTitleHighlighted || pressed) && styles.editingText,
                                    isPlaceholderActive && styles.placeholderText,
                                ]}
                            >
                                {displayTitle}
                            </Text>
                        )}
                    </Pressable>
                </View>
                {!isLast && <View style={styles.emptyLine} />}
            </>
        );
    }

    const movement = content as Movement;
    const movementName = movement?.name ?? '';
    const isMovementPlaceholderActive = showMovementPlaceholder && movementName.trim().length === 0;
    const displayMovementName = isMovementPlaceholderActive ? movementPlaceholderText : movementName;

    return (
        <>
            {prependEmptyLine && <View style={styles.emptyLine} />}
            <Pressable
                onPress={onMovementPress}
                onLongPress={onMovementLongPress}
                hitSlop={pressableHitSlop}
            >
                {({ pressed }) => (
                    <View style={styles.movementLineContainer}>
                        <Text
                            style={[
                                styles.movementText,
                                (isMovementNameHighlighted || isMovementPendingDelete || pressed) && styles.editingText,
                                isMovementPlaceholderActive && styles.placeholderText,
                            ]}
                        >
                            {displayMovementName}
                        </Text>
                    </View>
                )}
            </Pressable>
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
                        {({ pressed }) => (
                            <Text
                                style={[
                                    styles.text,
                                    styles.setText,
                                    (
                                        highlightedSetIndex === idx ||
                                        pendingDeleteSetIndex === idx ||
                                        isMovementPendingDelete ||
                                        pressed
                                    ) && styles.editingText,
                                ]}
                            >
                                {set.weight} × {set.reps}
                            </Text>
                        )}
                    </Pressable>
                </View>
            ))}
            <Pressable onPress={onEmptyLinePress}>
                <View
                    style={[
                        styles.emptyLine,
                        showSetPlaceholder && styles.placeholderLine,
                    ]}
                    onLayout={(event) => onAddSetLayout?.(event.nativeEvent.layout)}
                >
                    {showSetPlaceholder && (
                        <Text style={[styles.text, styles.setText, styles.placeholderText]}>
                            {setPlaceholderText}
                        </Text>
                    )}
                </View>
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
    editingText: {
        color: '#6d6d6d',
    },
    placeholderText: {
        color: '#9e9e9e',
    },
    placeholderLine: {
        justifyContent: 'flex-end',
    },
});

export default MessageBubble; 