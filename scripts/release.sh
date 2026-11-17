#!/bin/zsh
# Release: Safari app with a Developer ID signature (hardened runtime) → notarize + staple → DMG → notarize + staple.
#
#   MONO_SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
#   MONO_NOTARY_PROFILE=your-notarytool-profile \
#   scripts/release.sh <build-number>
#
# The version comes from extension/manifest.json. The notary profile is one you saved with:
#   xcrun notarytool store-credentials <profile> --apple-id … --team-id …
# The result is dist/Mono.dmg, ready to attach to a GitHub release.
set -euo pipefail
cd "${0:A:h}/.."
BUILD=${1:?usage: scripts/release.sh <build-number>}
ID=${MONO_SIGN_ID:?set MONO_SIGN_ID to a "Developer ID Application" identity}
PROFILE=${MONO_NOTARY_PROFILE:?set MONO_NOTARY_PROFILE to a notarytool keychain profile}
TEAM=${${ID##*\(}%\)}
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)
D=dist
rm -rf $D && mkdir -p $D/tmp

echo "→ building Mono $VERSION ($BUILD), arm64 + x86_64"
xcodebuild -project safari/Mono/Mono.xcodeproj -scheme Mono -configuration Release \
  -derivedDataPath $D/tmp/derived -destination "generic/platform=macOS" \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$ID" DEVELOPMENT_TEAM=$TEAM PROVISIONING_PROFILE_SPECIFIER= \
  MARKETING_VERSION=$VERSION CURRENT_PROJECT_VERSION=$BUILD \
  build > $D/tmp/build.log 2>&1 || { tail -30 $D/tmp/build.log; exit 1; }
BUILT=$D/tmp/derived/Build/Products/Release/Mono.app
APPEX="Contents/PlugIns/Mono Extension.appex"
ditto $BUILT $D/Mono.app

# Sign again, inside out, with exactly the entitlements a release needs. Xcode's own
# pass either adds a debug entitlement (which fails notarization) or, with that turned
# off, drops the App Sandbox (without which Safari will not load the extension).
ENT=safari/Mono/Release.entitlements
codesign --force --options runtime --timestamp --entitlements $ENT --sign "$ID" "$D/Mono.app/$APPEX"
codesign --force --options runtime --timestamp --entitlements $ENT --sign "$ID" $D/Mono.app
codesign --verify --strict --deep $D/Mono.app
for bundle in $D/Mono.app "$D/Mono.app/$APPEX"; do
  held=$(codesign -d --entitlements - "$bundle" 2>/dev/null)
  if [[ $held == *get-task-allow* ]]; then echo "✗ $bundle carries get-task-allow"; exit 1; fi
  if [[ $held != *com.apple.security.app-sandbox* ]]; then echo "✗ $bundle is not sandboxed"; exit 1; fi
done
for binary in $D/Mono.app/Contents/MacOS/Mono "$D/Mono.app/$APPEX/Contents/MacOS/Mono Extension"; do
  [[ $(lipo -archs "$binary") == *x86_64* && $(lipo -archs "$binary") == *arm64* ]] || { echo "✗ $binary is not universal"; exit 1; }
done

echo "→ notarizing the app"
ditto -c -k --keepParent $D/Mono.app $D/tmp/Mono.zip
xcrun notarytool submit $D/tmp/Mono.zip --keychain-profile $PROFILE --wait
xcrun stapler staple $D/Mono.app

echo "→ building the DMG"
STAGE=$D/tmp/stage && mkdir -p $STAGE
ditto $D/Mono.app $STAGE/Mono.app
ln -s /Applications $STAGE/Applications
hdiutil create -volname Mono -srcfolder $STAGE -fs HFS+ -format UDRW -ov $D/tmp/rw.dmg >/dev/null
MNT=$(hdiutil attach -readwrite -noverify -noautoopen $D/tmp/rw.dmg | awk -F'\t' '/\/Volumes\//{print $NF}')
sleep 1
# No background picture: Finder's own window keeps the labels readable in light and dark mode.
osascript <<OSA || echo "  (Finder couldn't lay out the window; the DMG works, just unarranged)"
tell application "Finder"
  tell disk "Mono"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 760, 480}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 112
    set text size of opts to 13
    set position of item "Mono.app" of container window to {150, 165}
    set position of item "Applications" of container window to {410, 165}
    update without registering applications
    delay 1
    close
  end tell
end tell
OSA
sync; hdiutil detach "$MNT" >/dev/null
hdiutil convert $D/tmp/rw.dmg -format ULFO -o $D/Mono-$VERSION.dmg >/dev/null
codesign --force --timestamp --sign "$ID" $D/Mono-$VERSION.dmg

echo "→ notarizing the DMG"
xcrun notarytool submit $D/Mono-$VERSION.dmg --keychain-profile $PROFILE --wait
xcrun stapler staple $D/Mono-$VERSION.dmg
spctl -a -t open --context context:primary-signature -v $D/Mono-$VERSION.dmg
spctl -a -t exec -v $D/Mono.app
cp $D/Mono-$VERSION.dmg $D/Mono.dmg

# Xcode registers what it builds with Launch Services. Drop these copies so Safari
# keeps using the Mono you already have installed rather than one inside dist/.
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
for app in $BUILT $D/Mono.app $STAGE/Mono.app; do
  pluginkit -r "$app/$APPEX" 2>/dev/null || true
  $LSREGISTER -u $app 2>/dev/null || true
done
rm -rf $D/tmp

shasum -a 256 $D/Mono.dmg
ls -lh $D/Mono.dmg
