import DOMPurify from "dompurify";

export type Feed = "top" | "new" | "best" | "ask" | "show" | "jobs";

// Comment/story bodies come from the Algolia mirror and are injected with
// dangerouslySetInnerHTML into the reader — which runs in the
// news.ycombinator.com origin with HN's CSP stripped. Sanitize them down to the
// small tag set HN itself renders so nothing executable can slip through.
const ALLOWED_TAGS = ["a", "i", "em", "b", "strong", "code", "pre", "p", "blockquote", "br"];
function sanitizeHtml(html: string | null): string | null {
  if (html == null) return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "rel", "title"],
    // Only safe link schemes; blocks javascript:, data:, etc.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });
}

export type StoryHit = {
  objectID: string;
  title: string;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  author: string;
  created_at_i: number;
};

export type CommentNode = {
  id: number;
  author: string | null;
  text: string | null;
  created_at_i: number;
  children: CommentNode[];
};

export type StoryItem = {
  id: number;
  title: string;
  url: string | null;
  points: number | null;
  author: string;
  text: string | null;
  created_at_i: number;
  children: CommentNode[];
  /**
   * Top-level comment ids in HN's own ranked order. The Algolia mirror only
   * ever hands back children in chronological order, so this comes from
   * Firebase; null when that call fails, and the reader falls back to
   * chronological.
   */
  rankedIds: number[] | null;
};

const FIREBASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA = "https://hn.algolia.com/api/v1";

const FEED_ENDPOINT: Record<Feed, string> = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  jobs: "jobstories",
};

type FirebaseItem = {
  id: number;
  type?: "story" | "comment" | "job" | "poll" | "pollopt";
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function toHit(item: FirebaseItem): StoryHit {
  return {
    objectID: String(item.id),
    title: item.title ?? "(untitled)",
    url: item.url ?? null,
    points: item.score ?? null,
    num_comments: item.descendants ?? 0,
    author: item.by ?? "—",
    created_at_i: item.time ?? 0,
  };
}

export async function fetchFeed(
  feed: Feed,
  limit = 30,
): Promise<StoryHit[]> {
  const ids = await fetchJson<number[]>(
    `${FIREBASE}/${FEED_ENDPOINT[feed]}.json`,
  );
  const slice = ids.slice(0, limit);
  const items = await Promise.all(
    slice.map((id) => fetchJson<FirebaseItem>(`${FIREBASE}/item/${id}.json`)),
  );
  return items.filter((it) => it && !it.dead && !it.deleted).map(toHit);
}

type AlgoliaItem = {
  id: number;
  title: string | null;
  url: string | null;
  points: number | null;
  author: string;
  text: string | null;
  created_at_i: number;
  children: AlgoliaItem[];
};

function normalizeComments(node: AlgoliaItem): CommentNode {
  return {
    id: node.id,
    author: node.author ?? null,
    text: sanitizeHtml(node.text),
    created_at_i: node.created_at_i,
    children: (node.children ?? []).map(normalizeComments),
  };
}

export async function fetchStory(id: string | number): Promise<StoryItem> {
  // Two mirrors, in parallel: Algolia for the whole comment tree in one shot,
  // Firebase purely for HN's ranking of the top-level comments. The ranking is
  // a nice-to-have, so a failure there must not fail the story.
  const [data, ranked] = await Promise.all([
    fetchJson<AlgoliaItem>(`${ALGOLIA}/items/${id}`),
    fetchJson<FirebaseItem>(`${FIREBASE}/item/${id}.json`)
      .then((it) => it?.kids ?? null)
      .catch(() => null),
  ]);
  return {
    rankedIds: ranked,
    id: data.id,
    title: data.title ?? "(untitled)",
    url: data.url,
    points: data.points,
    author: data.author,
    text: sanitizeHtml(data.text),
    created_at_i: data.created_at_i,
    children: (data.children ?? []).map(normalizeComments),
  };
}
