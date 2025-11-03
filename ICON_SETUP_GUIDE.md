# App Icon and Splash Screen Setup Guide

## Problem
You have a React Native CLI project but were trying to use Expo configuration (`app.json`). React Native CLI projects require manual configuration of app icons and splash screens in the native Android and iOS projects.

## Solution

### 1. App Icons

#### Android Icons
Your Android icons need to be placed in the following directories with specific sizes:

```
android/app/src/main/res/
├── mipmap-mdpi/ic_launcher.png (48x48px)
├── mipmap-hdpi/ic_launcher.png (72x72px)
├── mipmap-xhdpi/ic_launcher.png (96x96px)
├── mipmap-xxhdpi/ic_launcher.png (144x144px)
└── mipmap-xxxhdpi/ic_launcher.png (192x192px)
```

For adaptive icons (Android 8.0+), also add:
```
android/app/src/main/res/
├── mipmap-mdpi/ic_launcher_round.png (48x48px)
├── mipmap-hdpi/ic_launcher_round.png (72x72px)
├── mipmap-xhdpi/ic_launcher_round.png (96x96px)
├── mipmap-xxhdpi/ic_launcher_round.png (144x144px)
└── mipmap-xxxhdpi/ic_launcher_round.png (192x192px)
```

#### iOS Icons
Your iOS icons need to be placed in:
```
ios/liftbook/Images.xcassets/AppIcon.appiconset/
```

Required sizes:
- 20x20@2x.png (40x40px)
- 20x20@3x.png (60x60px)
- 29x29@2x.png (58x58px)
- 29x29@3x.png (87x87px)
- 40x40@2x.png (80x80px)
- 40x40@3x.png (120x120px)
- 60x60@2x.png (120x120px)
- 60x60@3x.png (180x180px)
- 1024x1024.png (1024x1024px)

### 2. Splash Screen

#### iOS Splash Screen
The iOS splash screen is configured in `ios/liftbook/LaunchScreen.storyboard`. You can:
1. Add an image view to display your splash image
2. Or modify the existing text labels

#### Android Splash Screen
For Android, you need to:
1. Create a splash screen drawable
2. Configure it in `android/app/src/main/res/values/styles.xml`

### 3. Quick Setup Steps

1. **Generate Icons**: Use online tools like https://appicon.co/ or https://makeappicon.com/
2. **Replace Icons**: Copy the generated icons to the appropriate directories
3. **Clean Build**: 
   ```bash
   # For Android
   cd android && ./gradlew clean && cd ..
   npx react-native run-android
   
   # For iOS
   cd ios && xcodebuild clean && cd ..
   npx react-native run-ios
   ```

### 4. Alternative: Use react-native-bootsplash

For easier splash screen management, consider using `react-native-bootsplash`:

```bash
npm install react-native-bootsplash
npx react-native-bootsplash init
```

This will automatically generate all the required splash screen assets and configurations.

### 5. Verification

After setup:
1. Clean your project
2. Rebuild for both platforms
3. Test on a physical device (not just simulator)
4. Check that icons appear in the app launcher
5. Verify splash screen shows during app launch

## Common Issues

1. **Icons not showing**: Make sure you've cleaned and rebuilt the project
2. **Wrong sizes**: Use exact pixel dimensions specified
3. **Cached icons**: Uninstall and reinstall the app on your device
4. **iOS simulator**: Icons may not update in simulator, test on device

## Files to Update

- `android/app/src/main/res/mipmap-*/ic_launcher.png`
- `android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- `ios/liftbook/Images.xcassets/AppIcon.appiconset/*.png`
- `ios/liftbook/LaunchScreen.storyboard` (for splash screen) 