import * as React from 'react';
import { View, Text, Linking } from 'react-native';
import { useTheme } from './theme';
import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { parseShareLinkPayload } from './shareCard';
import { parseImportPath, wrapIncomingUrl } from './backup';
import LiftPreviewListScreen from './LiftPreviewListScreen';
import LiftEditorScreen from './LiftEditorScreen';
import ChartScreen from './ChartScreen';
import SharedLiftScreen from './SharedLiftScreen';
import ImportBackupScreen from './ImportBackupScreen';
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
    // A backup file opened from outside (see getInitialURL/subscribe below)
    const fileUrl = parseImportPath(path);
    if (fileUrl) {
      return {
        routes: [
          { name: 'LiftList' as const },
          { name: 'ImportBackup' as const, params: { fileUrl } },
        ],
      };
    }
    return getStateFromPath(path, options);
  },
  // Same as React Navigation's defaults, except that a backup file handed to
  // the app (AirDrop, "Open in Liftbook") arrives as a file:// URL, which
  // isn't under any prefix — wrap it in a liftbook:// link so it routes.
  getInitialURL: () =>
    Promise.race([
      Linking.getInitialURL().then(wrapIncomingUrl),
      // React Native can leave getInitialURL pending; don't hold up launch
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 150)),
    ]),
  subscribe: (listener) => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const wrapped = wrapIncomingUrl(url);
      if (wrapped) {
        listener(wrapped);
      }
    });
    return () => subscription.remove();
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
                  name="ImportBackup"
                  component={ImportBackupScreen}
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
