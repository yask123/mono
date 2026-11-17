#!/bin/sh
# Points the Homebrew tap at a published release: updates the version and checksums
# in yask123/homebrew-tap's mono-safari cask and mono-chrome formula, then pushes.
#
#   scripts/bump-tap.sh 0.2.2
#
# Run it after `gh release create v<version> dist/Mono.dmg`, so both files it hashes exist.
set -eu
VERSION=${1:?usage: scripts/bump-tap.sh <version>}
TAP=$(brew --repository yask123/tap)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fetch() { curl -fsSL -o "$TMP/$2" "$1" && shasum -a 256 "$TMP/$2" | cut -c1-64; }
DMG_SHA=$(fetch "https://github.com/yask123/mono/releases/download/v$VERSION/Mono.dmg" Mono.dmg)
SRC_SHA=$(fetch "https://github.com/yask123/mono/archive/refs/tags/v$VERSION.tar.gz" source.tar.gz)

cd "$TAP"
git pull -q --ff-only
sed -i '' -E "s/^  version \".*\"/  version \"$VERSION\"/; s/^  sha256 \".*\"/  sha256 \"$DMG_SHA\"/" Casks/mono-safari.rb
sed -i '' -E "s#/v[0-9][^/]*\.tar\.gz\"#/v$VERSION.tar.gz\"#; s/^  sha256 \".*\"/  sha256 \"$SRC_SHA\"/" Formula/mono-chrome.rb
brew style Casks/mono-safari.rb Formula/mono-chrome.rb
git add Casks/mono-safari.rb Formula/mono-chrome.rb
git commit -q -m "mono-safari, mono-chrome $VERSION"
git push -q origin main
echo "Tap updated to Mono $VERSION. brew upgrade mono-safari mono-chrome picks it up."
