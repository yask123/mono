#!/bin/sh
# Builds the Safari app that wraps extension/, signed with your developer team,
# and registers it so Safari lists Mono under Settings > Extensions.
#
#   DEVELOPMENT_TEAM=YOURTEAMID scripts/build-safari.sh
set -eu

if [ -z "${DEVELOPMENT_TEAM:-}" ]; then
  echo "Set DEVELOPMENT_TEAM to your Apple developer team ID, for example:" >&2
  echo "  DEVELOPMENT_TEAM=ABCDE12345 scripts/build-safari.sh" >&2
  echo "Without a team, open safari/Mono/Mono.xcodeproj in Xcode instead (see README)." >&2
  exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd)
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$root/extension/manifest.json")

xcodebuild \
  -project "$root/safari/Mono/Mono.xcodeproj" \
  -scheme Mono \
  -configuration Release \
  -derivedDataPath "$root/build" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  MARKETING_VERSION="$version" \
  build

app="$root/build/Build/Products/Release/Mono.app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"
pluginkit -a "$app/Contents/PlugIns/Mono Extension.appex"

echo
echo "Built Mono $version: $app"
echo "Now open Safari > Settings > Extensions, tick Mono, and allow it on x.com."
