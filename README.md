# Pretty Hacker News

A calmer, modern reader for [Hacker News](https://news.ycombinator.com/) — that
runs **in place on the real site**.

Pretty Hacker News is a browser extension that takes over news.ycombinator.com's feed and
item pages and renders its own clean UI over HN's data: dark-by-default with a
warm accent, threaded comments with depth-coloured guides, and a single reading
column. Same URLs, same links, your existing HN login — so you can upvote,
comment, and reply on your own account without leaving. There's also a
standalone web build of the same reader.

## Features

- Renders in place on news.ycombinator.com (feed + item pages; other HN pages
  stay native)
- Named themes including a faithful, dense **Classic** look as the default,
  switched from an in-page settings modal
- Instant client-side navigation — no full reloads; back/forward work
- Keyboard nav — `j`/`k` move, `o`/`Enter` open, `u` upvote
- **Upvote, comment, and reply** on your real HN account (no passwords stored)
- Read/seen dimming, velocity 🔥 badges, "OP" badges on submitter comments
- Save/bookmark, mute domains, collapse threads, default feed
- **Reorder any comment thread** — HN's own ranking, newest, oldest, or most
  replies; your choice is remembered across stories
- Optional **inline article previews** — read the linked page (clean text +
  image) without leaving HN
- Optional **AI brief** (off by default, bring your own key) — summarizes the
  linked article (thesis + bullets) and the comment thread, and points you to
  the comments worth reading. Reading-only — see *Privacy & trust*.
- Local-first: no servers of our own, no analytics; preferences live in
  `chrome.storage`

## Stack

- [Plasmo](https://www.plasmo.com/) (MV3 extension) — content script, background
  worker, popup
- React 19 + TypeScript, [Tailwind CSS v4](https://tailwindcss.com/)
- [@mozilla/readability](https://github.com/mozilla/readability) +
  [DOMPurify](https://github.com/cure53/DOMPurify) for inline previews
- [Vite](https://vitejs.dev/) for the standalone web build

## Prerequisites

- [Bun](https://bun.sh) 1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- Google Chrome (or any Chromium browser)

## Run the extension (dev)

```sh
bun install
bun run plasmo:dev   # compiles Tailwind, watches it, and starts Plasmo (hot reload)
```

That single command handles everything — no second terminal needed. Then load
it once:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `build/chrome-mv3-dev`
4. Open **https://news.ycombinator.com**

Edits hot-reload. (`plasmo:dev` also runs the Tailwind watcher: Tailwind is
decoupled from Plasmo's bundler and regenerates `src/compiled.css`, which the
content script injects into its Shadow DOM. See *How it works*.)

## Build / package the extension

```sh
bun run plasmo:build   # → build/chrome-mv3-prod
bun run plasmo:zip     # → build/chrome-mv3-prod.zip  (upload to the Web Store)
```

See [`STORE_LISTING.md`](./STORE_LISTING.md) for listing copy + permission
justifications, and [`TESTING.md`](./TESTING.md) for sharing a test build.

## Tests

```sh
bun test   # trust guarantees + unit tests (also run in CI on every push/PR)
```

## Run the standalone web reader

```sh
bun run dev      # http://localhost:5173/
bun run build    # static SPA in dist/ (GitHub Pages)
```

The web build is the same reader as a normal SPA (no in-page voting/commenting —
that needs the extension's same-origin session). It also serves
`public/privacy.html`.

## How it works

- **In place, not a separate tab.** A Plasmo content script (`src/contents/hn.tsx`)
  mounts the React reader as a full-screen Shadow-DOM overlay on HN's feed/item
  pages and hides HN's own markup. Shadow DOM isolates our styles from HN's CSS.
- **Same session.** Because it runs on news.ycombinator.com, voting and
  commenting reuse your real login via same-origin requests — vote tokens and
  comment-form `hmac` tokens are read from HN's DOM / fetched same-origin
  (`src/sources/hn/auth.ts`). No CORS, no credentials handled by the extension.
- **Background worker** (`src/background.ts`) strips HN's `Content-Security-Policy`
  on the pages we render (via `declarativeNetRequest`) so the bundled Inter font
  and article preview images can load — and fetches article HTML for previews
  (cross-origin fetches must run in the worker under MV3). Site icons are local
  monogram tiles (no favicon requests).
- **Inline previews** (`src/sources/hn/article.ts`, `ArticlePeek.tsx`) fetch the
  linked page, extract it with Readability, sanitize with DOMPurify, and render
  it inline. The broad host permission is **optional** and requested just-in-time
  from the toolbar **popup** (`src/popup.tsx`).
- **Data:** feeds from the official
  [HN Firebase API](https://github.com/HackerNews/API); comment trees from the
  [HN Algolia API](https://hn.algolia.com/api). Algolia returns a thread
  strictly chronologically, so opening a story also pulls the story's `kids`
  from Firebase — that array is HN's ranking, and it's what the "Best" comment
  sort restores.

## Project layout

The reader is built around pluggable **sources** — each owns both its data
adapter and its own presentation ("skin"). Today there's one: Hacker News.

```
src/
  contents/hn.tsx       # the in-place reader (Plasmo content script)
  background.ts         # CSP strip + article fetch (Plasmo background)
  popup.tsx             # toolbar popup: opt-in to article previews
  App.tsx               # standalone web entry (source-aware router + theme)
  components/           # shared chrome: Header, SettingsModal, AiProfileForm…
  sources/
    types.ts            # the Source contract every skin implements
    registry.ts         # installed sources
    hn/                 # the Hacker News skin
      index.ts          # hnSource: Source
      api.ts            # Firebase + Algolia clients
      commentSort.ts    # thread reordering (best/newest/oldest/replies)
      auth.ts           # vote / comment / reply via the user's session
      article.ts        # fetch + Readability + DOMPurify for previews
      Feed.tsx Story.tsx StoryCard.tsx Comment.tsx ArticlePeek.tsx CommentBox.tsx
      Digest.tsx SiteIcon.tsx   # AI digest/summary UI; local monogram icons
      voteContext / seenContext / prefsContext  # state, persisted to chrome.storage
  lib/
    themes.ts format.ts runtime.ts
  index.css             # design tokens, themes, gradient backdrop
```

## Permissions

- **news.ycombinator.com** — render the reader; vote/comment with your session.
- **api.anthropic.com / api.openai.com** — used only if you enable AI and
  trigger it, to call the provider you chose with your own key.
- **storage** — save preferences (and, if you use AI, your key) locally.
- **declarativeNetRequest** — relax HN's CSP on the pages we render so the
  bundled font and preview images load (no requests blocked or redirected; site
  icons are drawn locally). Also strips the `Origin`
  header on the extension's *own* calls to api.anthropic.com (scoped via
  `tabIds:[-1]`) so keys on zero-data-retention orgs work — never touches other
  sites' requests.
- **broad host access (optional)** — requested only if you enable Article
  previews; used solely to fetch a page you click "Preview" on.

## Privacy & trust

Pretty Hacker News is local-first: it runs **no servers of its own** and **no analytics**.
The complete list of network calls it makes — and exactly what triggers each —
is in [`public/privacy.html`](./public/privacy.html). The trust guarantees are
also enforced mechanically in [`test/trust.test.ts`](./test/trust.test.ts),
which runs in CI: it asserts the code never reads `document.cookie`, only sends
your logged-in session to Hacker News, fetches previews without cookies, and
contacts no host outside a documented allowlist.

**AI is opt-in.** With no API key, Pretty Hacker News makes no AI calls of any kind. When you
do enable it, requests go directly from your browser to the provider you chose
(Anthropic or OpenAI) with **your** key — through no server of ours.

**AI is for reading, never for speaking.** The AI features exist only to help
you read: summarizing threads and matching stories to your interests. Pretty Hacker News does
**not**, and per the project covenant in the [LICENSE](./LICENSE) **must never
be updated to**, use AI to generate, draft, or post comments, replies, or
submissions, or to vote, on anyone's behalf. Automating participation would
erode the signal that makes HN worth reading.

## Licence

MIT, plus a project covenant that AI must never be used to write comments/posts
or vote — see [LICENSE](./LICENSE). Not affiliated with Y Combinator.
