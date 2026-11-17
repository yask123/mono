# Mono

A quiet way to read X. Mono is a small browser extension for Safari and Chrome that reduces x.com to text, one colour and a hairline around the page.

**[yask.dev/mono](https://yask.dev/mono)**

![An X timeline in Mono's phosphor look](site/mono/assets/timeline-phosphor.webp)

## What it does

- Removes the right column (trends, news, live, who to follow), promoted posts, the floating Grok and chat drawers, and the nudges to load more.
- Hides reply, repost, like and view counts until you point at a post.
- Reduces the nav to six words: home, explore, notifications, chat, profile, more.
- Turns the composer into a blank page: one monospaced column and a block cursor.
- Draws one hairline around the page and a status line at the bottom, where you switch looks.

"Off" is always the untouched site.

## Looks

| Look | Type | Colour | Pictures |
|---|---|---|---|
| `phosphor` | Monospace throughout | Near-black, one green | No avatars; media folds to a `▸ image` line you click to open |
| `neon` | System sans with monospace details | Blue-black, cyan-to-magenta edge | Grey until you point at them |
| `paper` | Monospace throughout | Warm paper, ink, one vermilion | Grey until you point at them |

## Keys

| Key | Does |
|---|---|
| `⌥⇧M` | Mono on or off |
| `⌥⇧L` | Next look |
| Click `▸ image` | Open a folded picture; click the line again to fold it |

You can also click `MONO` or a look name in the status line, or use the toolbar button.

## Install

### Safari

```sh
brew install --cask yask123/tap/mono-safari
```

Or download **[Mono.dmg](https://github.com/yask123/mono/releases/latest/download/Mono.dmg)** (macOS 14 or later, signed and notarized) and drag Mono to Applications. Open Mono once, then:

1. In Safari → Settings → Extensions, tick **Mono**.
2. On x.com, click the Mono button in the toolbar and choose **Always Allow on This Website**.

### Chrome, Arc, Brave, Edge

```sh
brew install yask123/tap/mono-chrome
mono-chrome
```

`mono-chrome` opens `chrome://extensions` with the extension's folder on your clipboard. Turn on **Developer mode**, click **Load unpacked**, press ⌘⇧G, paste and choose **Open**. For another browser: `mono-chrome arc`, `mono-chrome brave` or `mono-chrome edge`. After `brew upgrade mono-chrome`, click the reload arrow on Mono in the extensions page.

Without Homebrew, clone this repository and load its `extension` folder the same way.

### Build it yourself

Safari only loads an extension that is wrapped in a Mac app. To build that app from source you need Xcode.

With an Apple developer team:

```sh
git clone https://github.com/yask123/mono
cd mono
DEVELOPMENT_TEAM=YOURTEAMID scripts/build-safari.sh
```

Without a team, open `safari/Mono/Mono.xcodeproj` in Xcode and press Run. Safari will only load that build after you turn on **Allow unsigned extensions** in Settings → Developer, and it asks again each time Safari restarts.

`scripts/release.sh` makes the signed, notarized `Mono.dmg` that is attached to each release, and `scripts/bump-tap.sh <version>` then points the Homebrew tap at it.

## How it is put together

```
extension/
  looks.css      a look is a set of --m-* variables on <html data-mono="…">, plus the frame and status line
  sites/x.css    the recipe for x.com; it reads only those variables
  content.js     sets the look, draws the status line, tags media so a look can fold it
  popup.html     the toolbar button
safari/Mono/     the Xcode project that wraps extension/ for Safari
site/            the page at yask.dev/mono
```

A recipe hooks onto `data-testid`, `role` and `aria-*` attributes, which X keeps fairly stable. When X changes its markup a rule can stop matching; the fix is usually one selector in `sites/x.css`.

Adding a look means adding one block of variables to `looks.css` and its name to `LOOKS` in `content.js` and `popup.html`. Adding a site means a new file in `sites/` and an entry under `content_scripts` in `manifest.json`.

## Limits

- Only x.com has a recipe.
- Messages, settings and profile headers get the colours and type but no dedicated cleanup.
- Safari cannot draw a block text cursor, so Mono draws one for the composer. Chrome uses its own.
- Labels in the nav are matched by their English names.

## Licence

MIT. Mono is not affiliated with X Corp. The pictures on the page and in this README show NASA's public timeline.
