import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';

const ChartsScreen: React.FC = () => {
    const colorScheme = useColorScheme() || 'dark';
    const isDark = colorScheme === 'dark';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? 'black' : 'white' }]}>
            <Text style={[styles.text, { color: isDark ? 'white' : 'black' }]}>
                Charts coming soon...
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 18,
    },
});

export default ChartsScreen; 