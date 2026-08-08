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
import { Movement } from './types';
import { useTheme } from './theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
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
    const theme = useTheme();
    const pressableHitSlop = { top: 2, bottom: 2, left: 0, right: 0 }; // 28px container, 24px touch area

    const inkColor = { color: theme.textPrimary };
    const editingColor = { color: theme.editingText };
    const placeholderColor = { color: theme.placeholder };

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
                        android_ripple={null}
                    >
                        {({ pressed }) => (
                            <Text
                                style={[
                                    styles.titleText,
                                    inkColor,
                                    (isEditing || isTitleHighlighted || pressed) && editingColor,
                                    isPlaceholderActive && placeholderColor,
                                ]}
                            >
                                {displayTitle}
                            </Text>
                        )}
                    </Pressable>
                </View>
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
                android_ripple={null}
            >
                {({ pressed }) => (
                    <View style={styles.movementLineContainer}>
                        <Text
                            style={[
                                styles.movementText,
                                inkColor,
                                (isMovementNameHighlighted || isMovementPendingDelete || pressed) && editingColor,
                                isMovementPlaceholderActive && placeholderColor,
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
                        android_ripple={null}
                        unstable_pressDelay={0}
                    >
                        {({ pressed }) => (
                            <Text
                                style={[
                                    styles.text,
                                    styles.setText,
                                    inkColor,
                                    (
                                        highlightedSetIndex === idx ||
                                        pendingDeleteSetIndex === idx ||
                                        isMovementPendingDelete ||
                                        pressed
                                    ) && editingColor,
                                ]}
                            >
                                {set.weight} × {set.reps}
                            </Text>
                        )}
                    </Pressable>
                </View>
            ))}
            <Pressable
                onPress={onEmptyLinePress}
                android_ripple={null}
                // Measured here (not on the inner View) so the reported y is
                // relative to the movement row, which the scroll logic needs
                onLayout={(event) => onAddSetLayout?.(event.nativeEvent.layout)}
            >
                <View
                    style={[
                        styles.emptyLine,
                        showSetPlaceholder && styles.placeholderLine,
                    ]}
                >
                    {showSetPlaceholder && (
                        <Text style={[styles.text, styles.setText, placeholderColor]}>
                            {setPlaceholderText}
                        </Text>
                    )}
                </View>
            </Pressable>
            {/* Show extra line only when adding a set to maintain spacing with next movement */}
            {!isLast && showSetPlaceholder && <View style={styles.emptyLine} />}
        </>
    );
};

const styles = StyleSheet.create({
    lineContainer: {
        height: 24, // fits ruled line for sets
        justifyContent: 'flex-end',
    },
    titleLineContainer: {
        height: 72, // Three lines (one line taller)
        justifyContent: 'center',
        position: 'relative',
    },
    movementLineContainer: {
        height: 28, // allow descenders for movement name
        justifyContent: 'flex-end',
        marginBottom: -4, // shrink gap below movement name
        position: 'relative',
    },
    text: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
        padding: 0,
        margin: 0,
    },
    titleText: {
        fontSize: 32,
        fontFamily: 'Schoolbell',
        fontWeight: 'bold',
        textAlignVertical: 'center',
        textAlign: 'left',
    },
    movementText: {
        fontSize: 20,
        fontFamily: 'Schoolbell',
    },
    setText: {
        fontSize: 20,
        marginLeft: 8,
    },
    emptyLine: {
        height: 24,
        position: 'relative',
    },
    setLineContainer: {
        // no negative margin here
    },
    placeholderLine: {
        justifyContent: 'flex-end',
    },
});

export default MessageBubble; 