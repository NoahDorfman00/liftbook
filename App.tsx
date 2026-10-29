import * as React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';
import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { parseShareLinkPayload } from './shareCard';
import LiftPreviewListScreen from './LiftPreviewListScreen';
import LiftEditorScreen from './LiftEditorScreen';
import ChartScreen from './ChartScreen';
import SharedLiftScreen from './SharedLiftScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
  // Share links carry the lift in the URL *fragment* (liftbookapp.com/l#v1=…),
  // which path matching ignores — so pull it out by hand and route to the
  // shared-lift preview, stacked over the list so dismissing lands home.
  getStateFromPath: (path, options) => {
    const payload = parseShareLinkPayload(path);
    if (payload) {
      return {
        routes: [
          { name: 'LiftList' as const },
          { name: 'SharedLift' as const, params: { payload } },
        ],
      };
    }
    return getStateFromPath(path, options);
  },
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
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
  const theme = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
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
                    backgroundColor: theme.paper,
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
                  name="SharedLift"
                  component={SharedLiftScreen}
                  options={{
                    headerShown: false,
                    presentation: 'modal',
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
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
