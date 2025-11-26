import * as React from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_KEY } from '@env';
import { RootStackParamList } from './types';
import { LOCAL_STORAGE_KEYS, syncFromDatabase } from './utils';
import LiftPreviewListScreen from './LiftPreviewListScreen';
import LiftEditorScreen from './LiftEditorScreen';
import ChartsScreen from './ChartsScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RNBootSplash from 'react-native-bootsplash';

declare global {
  var selectedDate: string | undefined;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

// Initialize Firebase first, before any React components
const firebaseConfig = {
  apiKey: FIREBASE_KEY,
  authDomain: "jackedtracker.firebaseapp.com",
  databaseURL: "https://jackedtracker-default-rtdb.firebaseio.com",
  projectId: "jackedtracker",
  storageBucket: "jackedtracker.firebasestorage.app",
  messagingSenderId: "801417628220",
  appId: "1:801417628220:web:5e1d79d8ec2422d6211139",
  measurementId: "G-Q5C63J4TRW"
};

// Move Firebase initialization inside a try-catch
const initFirebase = () => {
  try {
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
    return app;
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return null;
  }
};

const initApp = async () => {
  console.log('Starting app initialization...');
  try {
    // Initialize Firebase first
    const firebaseApp = initFirebase();
    if (!firebaseApp) {
      console.error('Failed to initialize Firebase, continuing with local storage only');
    }

    // Initialize AsyncStorage
    try {
      console.log('Checking local storage for lifts data...');
      const liftsData = await AsyncStorage.getItem(LOCAL_STORAGE_KEYS.LIFTS);
      console.log('Lifts data from storage:', liftsData);
      if (!liftsData) {
        await syncFromDatabase();
      }
    } catch (storageError) {
      console.error('AsyncStorage error:', storageError);
    }

    // Set initial date (this doesn't depend on storage)
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateInCurrentTimezone = `${year}-${month}-${day}`;
    global.selectedDate = dateInCurrentTimezone;
    console.log('Initial date set to:', dateInCurrentTimezone);

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
        console.error('❌ App initialization failed with error:', error);
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
          <NavigationContainer>
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
                component={ChartsScreen}
                options={{
                  headerShown: false,
                  presentation: 'modal',
                }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
