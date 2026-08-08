import * as React from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import LiftPreviewListScreen from './LiftPreviewListScreen';
import LiftEditorScreen from './LiftEditorScreen';
import ChartScreen from './ChartScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RNBootSplash from 'react-native-bootsplash';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['liftbook://', 'https://liftbookapp.com'],
  config: {
    screens: {
      LiftList: '',
      LiftEditor: 'editor',
      Charts: 'charts',
    },
  },
};

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

export default function App() {
  const colorScheme = useColorScheme() || 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NavigationContainer
            linking={linking}
            onReady={() => RNBootSplash.hide({ fade: true })}
          >
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
            </Stack.Navigator>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
