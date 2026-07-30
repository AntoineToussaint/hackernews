import { useCallback, useEffect, useState } from "react";
import type { CommentNode } from "./api";

export type CommentSort = "best" | "newest" | "oldest" | "replies";

export const COMMENT_SORTS: { id: CommentSort; label: string; title: string }[] =
  [
    { id: "best", label: "Best", title: "Hacker News' own ranking" },
    { id: "newest", label: "Newest", title: "Most recent first" },
    { id: "oldest", label: "Oldest", title: "Earliest first" },
    { id: "replies", label: "Replies", title: "Most replies first" },
  ];

const DEFAULT_SORT: CommentSort = "best";

function isCommentSort(v: unknown): v is CommentSort {
  return COMMENT_SORTS.some((s) => s.id === v);
}

/** Total number of descendants under a node (replies, replies-to-replies, …). */
export function countDescendants(node: CommentNode): number {
  let n = 0;
  for (const c of node.children) {
    n++;
    n += countDescendants(c);
  }
  return n;
}

/** Same count over a forest — i.e. every comment in a story. */
export function countAll(nodes: CommentNode[]): number {
  let n = 0;
  for (const c of nodes) {
    n++;
    n += countDescendants(c);
  }
  return n;
}

/**
 * Reorder a comment forest, without mutating the input.
 *
 * Time-based and reply-count modes recurse, so a thread reads consistently all
 * the way down. "best" can't: HN only exposes its ranking for a story's direct
 * children (`rankedIds`), so replies stay in the chronological order the API
 * gave us — which is exactly how HN renders them under a ranked parent anyway.
 * With no ranking available, "best" is a no-op.
 */
export function sortComments(
  nodes: CommentNode[],
  sort: CommentSort,
  rankedIds?: number[] | null,
): CommentNode[] {
  if (sort === "best") return applyRanking(nodes, rankedIds);
  const sorted = [...nodes].sort(comparatorFor(sort));
  return sorted.map((n) =>
    n.children.length === 0
      ? n
      : { ...n, children: sortComments(n.children, sort) },
  );
}

/**
 * Order top-level comments to match HN's ranking. Ids we weren't given a rank
 * for — a comment posted between the two fetches, say — keep their relative
 * order at the end rather than disappearing.
 */
function applyRanking(
  nodes: CommentNode[],
  rankedIds?: number[] | null,
): CommentNode[] {
  if (!rankedIds || rankedIds.length === 0) return nodes;
  const rank = new Map(rankedIds.map((id, i) => [id, i]));
  const unranked = rankedIds.length;
  return [...nodes].sort(
    (a, b) => (rank.get(a.id) ?? unranked) - (rank.get(b.id) ?? unranked),
  );
}

function comparatorFor(sort: CommentSort) {
  return (a: CommentNode, b: CommentNode): number => {
    switch (sort) {
      case "newest":
        return b.created_at_i - a.created_at_i || a.id - b.id;
      case "oldest":
        return a.created_at_i - b.created_at_i || a.id - b.id;
      case "replies":
        // Ties (very common — most comments have no replies at all) fall back
        // to oldest-first, which is how a flat thread naturally reads.
        return (
          countDescendants(b) - countDescendants(a) ||
          a.created_at_i - b.created_at_i ||
          a.id - b.id
        );
      default:
        return 0;
    }
  };
}

type LocalStore = {
  get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>) => void;
};
const store: LocalStore | null =
  (globalThis as unknown as { chrome?: { storage?: { local?: LocalStore } } })
    .chrome?.storage?.local ?? null;

const KEY = "commentSort";

/**
 * The reader's comment ordering, remembered across stories and sessions.
 * Uses extension storage when we have it and falls back to localStorage so the
 * standalone web app keeps the preference too.
 */
export function useCommentSort(): [CommentSort, (s: CommentSort) => void] {
  const [sort, setSort] = useState<CommentSort>(DEFAULT_SORT);

  useEffect(() => {
    if (store) {
      store.get([KEY], (r) => {
        if (isCommentSort(r[KEY])) setSort(r[KEY]);
      });
      return;
    }
    try {
      const v = globalThis.localStorage?.getItem(KEY);
      if (isCommentSort(v)) setSort(v);
    } catch {
      // Storage can be blocked (private mode, third-party cookie rules) —
      // the default ordering is a fine outcome.
    }
  }, []);

  const update = useCallback((next: CommentSort) => {
    setSort(next);
    if (store) {
      store.set({ [KEY]: next });
      return;
    }
    try {
      globalThis.localStorage?.setItem(KEY, next);
    } catch {
      // Same as above: not being able to persist shouldn't break sorting.
    }
  }, []);

  return [sort, update];
}
