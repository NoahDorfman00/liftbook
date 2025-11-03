#!/bin/bash

echo "Setting up app icons for React Native CLI project..."
echo "=================================================="
echo ""

# Check if source icons exist
if [ ! -f "assets/icon.png" ]; then
    echo "❌ assets/icon.png not found!"
    echo "Please make sure you have your app icon in assets/icon.png"
    exit 1
fi

if [ ! -f "assets/adaptive-icon.png" ]; then
    echo "❌ assets/adaptive-icon.png not found!"
    echo "Please make sure you have your adaptive icon in assets/adaptive-icon.png"
    exit 1
fi

echo "✅ Found source icons"
echo ""

# Create backup of existing icons
echo "Creating backup of existing Android icons..."
mkdir -p backup/android
cp -r android/app/src/main/res/mipmap-* backup/android/ 2>/dev/null || echo "No existing Android icons to backup"

echo "Creating backup of existing iOS icons..."
mkdir -p backup/ios
cp -r ios/liftbook/Images.xcassets/AppIcon.appiconset/* backup/ios/ 2>/dev/null || echo "No existing iOS icons to backup"

echo "✅ Backups created in backup/ directory"
echo ""

echo "📱 Android Icon Setup"
echo "===================="
echo "For Android, you need to manually copy your icons to these locations:"
echo ""
echo "Copy assets/icon.png to:"
echo "  android/app/src/main/res/mipmap-mdpi/ic_launcher.png (48x48px)"
echo "  android/app/src/main/res/mipmap-hdpi/ic_launcher.png (72x72px)"
echo "  android/app/src/main/res/mipmap-xhdpi/ic_launcher.png (96x96px)"
echo "  android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png (144x144px)"
echo "  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png (192x192px)"
echo ""
echo "Copy assets/adaptive-icon.png to:"
echo "  android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png (48x48px)"
echo "  android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png (72x72px)"
echo "  android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png (96x96px)"
echo "  android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png (144x144px)"
echo "  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png (192x192px)"
echo ""

echo "🍎 iOS Icon Setup"
echo "================"
echo "For iOS, you need to copy your icons to:"
echo "  ios/liftbook/Images.xcassets/AppIcon.appiconset/"
echo ""
echo "Required files (you'll need to resize your icon.png to these sizes):"
echo "  20x20@2x.png (40x40px)"
echo "  20x20@3x.png (60x60px)"
echo "  29x29@2x.png (58x58px)"
echo "  29x29@3x.png (87x87px)"
echo "  40x40@2x.png (80x80px)"
echo "  40x40@3x.png (120x120px)"
echo "  60x60@2x.png (120x120px)"
echo "  60x60@3x.png (180x180px)"
echo "  1024x1024.png (1024x1024px)"
echo ""

echo "🚀 Next Steps"
echo "============="
echo "1. Use an online tool like https://appicon.co/ to generate all required sizes"
echo "2. Copy the generated icons to the directories listed above"
echo "3. Clean and rebuild your project:"
echo "   cd android && ./gradlew clean && cd .."
echo "   npx react-native run-android"
echo "   # For iOS: cd ios && xcodebuild clean && cd .."
echo "   # npx react-native run-ios"
echo "4. Test on a physical device (not simulator)"
echo ""

echo "💡 Pro Tips"
echo "==========="
echo "- Icons may not update in iOS simulator, test on a real device"
echo "- If icons don't show up, try uninstalling and reinstalling the app"
echo "- Make sure to clean the build cache after replacing icons"
echo "- For easier splash screen management, consider using react-native-bootsplash" 