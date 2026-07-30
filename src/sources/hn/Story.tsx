import { useEffect, useMemo, useState } from "react";
import type { ItemViewProps } from "../types";
import { fetchStory, type StoryItem } from "./api";
import {
  countAll,
  sortComments,
  useCommentSort,
  COMMENT_SORTS,
  type CommentSort,
} from "./commentSort";
import { filterParticipated, hasParticipated } from "./commentFilter";
import { useHnUsername } from "./useHnUser";
import { Upvote } from "./voteContext";
import { getCommentForm } from "./auth";
import { hostname, timeAgo } from "../../lib/format";
import { isExtension } from "../../lib/runtime";
import { SiteIcon } from "./SiteIcon";
import { ArticlePeek } from "./ArticlePeek";
import { Comment } from "./Comment";
import { CommentBox } from "./CommentBox";
import { Digest } from "./Digest";
import { StoryViewSkeleton } from "./Skeleton";

// Vote context is provided by the caller (the in-place content script wraps the
// whole reader in a VoteProvider populated from HN's DOM). With no provider —
// e.g. the standalone web app — <Upvote> simply renders nothing.
export function Story({ itemId, onBack }: ItemViewProps) {
  const [story, setStory] = useState<StoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapseNonce, setCollapseNonce] = useState(0);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useCommentSort();
  const [mineOnly, setMineOnly] = useState(false);
  const me = useHnUsername();

  const canFilterMine = useMemo(
    () => (story ? hasParticipated(story.children, me) : false),
    [story, me],
  );

  // Filter, then sort — both pure, and done once here rather than per
  // <Comment>, so replies stay in step with their parents.
  const comments = useMemo(() => {
    if (!story) return [];
    const visible =
      mineOnly && canFilterMine
        ? filterParticipated(story.children, me)
        : story.children;
    return sortComments(visible, sort, story.rankedIds);
  }, [story, sort, mineOnly, canFilterMine, me]);

  const total = useMemo(
    () => (story ? countAll(story.children) : 0),
    [story],
  );
  const shown = useMemo(() => countAll(comments), [comments]);

  const toggleCollapseAll = () => {
    setAllCollapsed((v) => !v);
    setCollapseNonce((n) => n + 1);
  };

  // The sort is a lasting preference; "Mine" is about one thread, and leaving
  // it on would make the next story look almost empty. Reset per story — but
  // not on reloadKey, so posting a reply doesn't drop you out of your filter.
  useEffect(() => {
    setMineOnly(false);
  }, [itemId]);

  useEffect(() => {
    let cancelled = false;
    setStory(null);
    setError(null);
    setCollapseNonce(0);
    setAllCollapsed(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    fetchStory(itemId)
      .then((data) => {
        if (!cancelled) setStory(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, reloadKey]);

  return (
    <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-fg-muted)] transition hover:text-[color:var(--color-fg)]"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {error && (
          <div className="card p-6 text-sm text-[color:var(--color-fg-muted)]">
            Couldn't load story: {error}
          </div>
        )}

        {!story && !error && <StoryViewSkeleton />}

        {story && (
          <>
            <StoryHeader story={story} />
            {story.url && isExtension() && (
              <ArticlePeek url={story.url} variant="card" />
            )}
            <Digest story={story} />
            <CommentBox
              parentId={String(story.id)}
              getForm={() => getCommentForm(String(story.id))}
              onPosted={() => setReloadKey((k) => k + 1)}
            />
            <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-fg-muted)]">
                {mineOnly && canFilterMine
                  ? `${shown} of ${total} comments`
                  : `${total} comments`}
              </h3>
              {story.children.length > 0 && (
                <div className="flex items-center gap-3">
                  {canFilterMine && (
                    <MineToggle
                      on={mineOnly}
                      onChange={setMineOnly}
                      username={me}
                    />
                  )}
                  <SortTabs value={sort} onChange={setSort} />
                  <button
                    type="button"
                    onClick={toggleCollapseAll}
                    className="text-xs font-medium text-[color:var(--color-fg-muted)] transition hover:text-[color:var(--color-accent)]"
                  >
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                </div>
              )}
            </div>
            {story.children.length === 0 ? (
              <div className="card p-6 text-center text-sm text-[color:var(--color-fg-muted)]">
                No comments yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {comments.map((c, i) => (
                  <li
                    key={c.id}
                    className="fade-in-up"
                    style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
                  >
                    <Comment
                      node={c}
                      depth={0}
                      op={story.author}
                      me={me}
                      collapseSignal={collapseNonce}
                      collapseTo={allCollapsed}
                      onReplyPosted={() => setReloadKey((k) => k + 1)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StoryHeader({ story }: { story: StoryItem }) {
  const host = hostname(story.url);
  return (
    <article className="card overflow-hidden p-5 sm:p-6">
      <div className="flex items-start gap-4">
        {host && (
          <SiteIcon host={host} className="hidden size-12 text-base sm:grid" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            {story.url ? (
              <a
                href={story.url}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-[color:var(--color-accent)]"
              >
                {story.title}
              </a>
            ) : (
              story.title
            )}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[color:var(--color-fg-muted)]">
            {host && (
              <a
                href={story.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 ring-1 ring-[color:var(--color-border)] transition hover:text-[color:var(--color-fg)]"
              >
                {host}
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <Upvote id={story.id} />
              <span className="accent-text font-mono tabular-nums">
                {story.points ?? 0}
              </span>{" "}
              points
            </span>
            <span>by {story.author}</span>
            <span>·</span>
            <span>{timeAgo(story.created_at_i)}</span>
            <span>·</span>
            <a
              href={`https://news.ycombinator.com/item?id=${story.id}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              on HN
            </a>
          </div>
          {story.text && (
            <div
              className="comment-body mt-4 text-[15px] text-[color:var(--color-fg)]"
              dangerouslySetInnerHTML={{ __html: story.text }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * "Mine" filter — only rendered when the signed-in user actually commented on
 * this story, so it never appears as a toggle that does nothing.
 */
function MineToggle({
  on,
  onChange,
  username,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  username: string | null;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={
        on
          ? "Showing only threads you took part in"
          : `Show only threads ${username ?? "you"} took part in`
      }
      onClick={() => onChange(!on)}
      className={
        "relative whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition " +
        (on
          ? "text-[color:var(--color-fg)]"
          : "text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)]")
      }
    >
      {on && (
        <span className="accent-bg absolute inset-0 -z-10 rounded-full opacity-15" />
      )}
      <span
        className={
          "absolute inset-0 -z-10 rounded-full ring-1 " +
          (on
            ? "ring-[color:var(--color-accent)]/60"
            : "ring-[color:var(--color-border)]")
        }
      />
      Mine
    </button>
  );
}

/** Pill row for reordering the thread; mirrors the feed tabs in the header. */
function SortTabs({
  value,
  onChange,
}: {
  value: CommentSort;
  onChange: (s: CommentSort) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sort comments"
      className="flex items-center gap-0.5"
    >
      {COMMENT_SORTS.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            title={s.title}
            aria-pressed={active}
            onClick={() => onChange(s.id)}
            className={
              "relative whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition " +
              (active
                ? "text-[color:var(--color-fg)]"
                : "text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)]")
            }
          >
            {active && (
              <span className="absolute inset-0 -z-10 rounded-full bg-[color:var(--color-bg-elev)] ring-1 ring-[color:var(--color-border)]" />
            )}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
