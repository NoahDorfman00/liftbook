import * as React from 'react';
import { View, Text, useColorScheme, Linking } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from './types';
import { LOCAL_STORAGE_KEYS } from './utils';
import LiftPreviewListScreen from './LiftPreviewListScreen';
import LiftEditorScreen from './LiftEditorScreen';
import ChartScreen from './ChartScreen';
import HeavyShareScreen from './HeavyShareScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RNBootSplash from 'react-native-bootsplash';

declare global {
  var selectedDate: string | undefined;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['liftbook://', 'https://liftbookapp.com'],
  config: {
    screens: {
      Heavy: 'heavy',
      LiftList: '',
      LiftEditor: 'editor',
      Charts: 'charts',
    },
  },
};

const initApp = async () => {
  try {
    // Initialize AsyncStorage
    try {
      await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LIFTS);
    } catch (storageError) {
      console.error('AsyncStorage error:', storageError);
    }

    // Set initial date
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateInCurrentTimezone = `${year}-${month}-${day}`;
    global.selectedDate = dateInCurrentTimezone;

    return true;
  } catch (error) {
    console.error('Critical initialization error:', error);
    return false;
  }
};

// Add this class near the top of the file
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000'
        }}>
          <Text style={{ color: 'white' }}>Something went wrong.</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// (Removed test and debug helpers for splash screen)

export default function App() {
  const colorScheme = useColorScheme() || 'dark';
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    const initialize = async () => {
      try {
        await initApp();
        RNBootSplash.hide({ fade: true });
        setIsInitialized(true);
      } catch (error) {
        console.error('App initialization failed:', error);
        // Still hide splash screen even if initialization fails
        RNBootSplash.hide({ fade: true });
        setIsInitialized(true);
      }
    };
    initialize();
  }, []);

  if (!isInitialized) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NavigationContainer linking={linking}>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: colorScheme === 'dark' ? 'black' : 'white',
                },
              }}
            >
              <Stack.Screen
                name="LiftList"
                component={LiftPreviewListScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="LiftEditor"
                component={LiftEditorScreen}
                options={{
                  headerShown: false,
                  presentation: 'card',
                  animation: 'slide_from_right',
                  gestureEnabled: true,
                  gestureDirection: 'horizontal',
                  fullScreenGestureEnabled: true,
                }}
              />
              <Stack.Screen
                name="Charts"
                component={ChartScreen}
                options={{
                  headerShown: false,
                  animation: 'slide_from_left',
                  animationMatchesGesture: true,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              />
              <Stack.Screen
                name="Heavy"
                component={HeavyShareScreen}
                options={{
                  headerShown: false,
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
