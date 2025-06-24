import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    useColorScheme,
    Keyboard,
    Dimensions
} from 'react-native';

interface SearchableDropdownProps {
    data: { key: string; value: string }[];
    selectedval?: string;
    setSelectedVal: (value: string) => void;
    boxStyles?: object;
    dropdownStyles?: object;
    dropdownItemStyles?: object;
    dropdownTextStyles?: object;
    inputStyles?: object;
    onFocus?: () => void;
    onBlur?: () => void;
    onClose?: () => void;
    isOpen?: boolean;
    autoFocus?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
    data,
    selectedval,
    setSelectedVal,
    boxStyles,
    dropdownStyles,
    dropdownItemStyles,
    dropdownTextStyles,
    inputStyles,
    onFocus,
    onBlur,
    onClose,
    isOpen,
    autoFocus,
}) => {
    const [searchText, setSearchText] = useState(selectedval || '');
    const colorScheme = useColorScheme() || 'dark';
    const inputRef = useRef<TextInput>(null);
    const [filteredData, setFilteredData] = useState(data);

    const styles = StyleSheet.create({
        container: {
            position: 'relative',
            zIndex: 9999,
            elevation: 5,
        },
        input: {
            height: 40,
            borderColor: 'gray',
            borderWidth: 1,
            borderRadius: 10,
            padding: 8,
            color: colorScheme === 'dark' ? 'white' : 'black',
            backgroundColor: colorScheme === 'dark' ? '#121212' : 'white',
            ...inputStyles,
        },
        dropdownContainer: {
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10000,
            elevation: 6,
        },
        dropdown: {
            maxHeight: 200,
            backgroundColor: colorScheme === 'dark' ? '#121212' : 'white',
            borderColor: 'gray',
            borderWidth: 1,
            borderRadius: 10,
            shadowColor: '#000',
            shadowOffset: {
                width: 0,
                height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
            ...dropdownStyles,
        },
        item: {
            padding: 10,
            borderBottomWidth: 1,
            borderBottomColor: 'gray',
            ...dropdownItemStyles,
        },
        itemText: {
            color: colorScheme === 'dark' ? 'white' : 'black',
            ...dropdownTextStyles,
        },
    });

    const handleSearch = (text: string) => {
        setSearchText(text);
        const filtered = data.filter(item =>
            item.value.toLowerCase().includes(text.toLowerCase())
        );
        setFilteredData(filtered);
    };

    const handleSelect = (item: { key: string; value: string }) => {
        setSearchText(item.value);
        setSelectedVal(item.value);
        Keyboard.dismiss();
        onClose?.();
    };

    const handleSubmit = () => {
        if (searchText.trim()) {
            setSelectedVal(searchText.trim());
            Keyboard.dismiss();
            onClose?.();
        }
    };

    React.useEffect(() => {
        if (autoFocus) {
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.focus();
            }, 100);
        }
    }, [autoFocus]);

    return (
        <View style={[styles.container, boxStyles]}>
            <TextInput
                ref={inputRef}
                value={searchText}
                onChangeText={handleSearch}
                onFocus={() => {
                    onFocus?.();
                }}
                onBlur={() => {
                    onBlur?.();
                }}
                onSubmitEditing={handleSubmit}
                style={styles.input}
                placeholderTextColor={colorScheme === 'dark' ? 'gray' : '#666'}
            />
            {isOpen && (
                <View style={styles.dropdownContainer}>
                    <View style={styles.dropdown}>
                        <ScrollView
                            keyboardShouldPersistTaps="always"
                            keyboardDismissMode="none"
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 200 }}
                            contentContainerStyle={{ flexGrow: 0 }}
                        >
                            {filteredData.map((item) => (
                                <TouchableOpacity
                                    key={item.key}
                                    style={styles.item}
                                    onPress={() => handleSelect(item)}
                                >
                                    <Text style={styles.itemText}>{item.value}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );
};

export default SearchableDropdown; 