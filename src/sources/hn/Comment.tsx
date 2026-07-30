import { useEffect, useState } from "react";
import type { CommentNode } from "./api";
import { Upvote } from "./voteContext";
import { CommentBox } from "./CommentBox";
import { getReplyForm } from "./auth";
import { isExtension } from "../../lib/runtime";
import { timeAgo } from "../../lib/format";
import { countDescendants } from "./commentSort";

const DEPTH_HUES = [
  "#ff5c1a",
  "#ff2d8a",
  "#a855f7",
  "#3b82f6",
  "#10b981",
  "#eab308",
];

type Props = {
  node: CommentNode;
  depth: number;
  /** The story's author, so we can badge their comments as OP. */
  op?: string | null;
  /** Bumped by "collapse all / expand all"; applies collapseTo when it changes. */
  collapseSignal?: number;
  collapseTo?: boolean;
  /** Called after a reply posts, so the story can reload the thread. */
  onReplyPosted?: () => void;
};

export function Comment({
  node,
  depth,
  op,
  collapseSignal,
  collapseTo,
  onReplyPosted,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const hue = DEPTH_HUES[depth % DEPTH_HUES.length];
  const isDeleted = !node.author && !node.text;
  const replyCount = countDescendants(node);
  const isOp = !!op && node.author === op;

  // Respond to a collapse-all / expand-all signal from the story view.
  useEffect(() => {
    if (collapseSignal && collapseSignal > 0) setCollapsed(!!collapseTo);
  }, [collapseSignal]);

  // Reveal-on-jump: when the AI digest (or anything) wants to scroll to a
  // comment that's buried under us, expand. We only need to react while
  // collapsed; expanding re-mounts descendants in their default (expanded)
  // state, so opening the top-most collapsed ancestor reveals the whole path.
  useEffect(() => {
    if (!collapsed) return;
    const onReveal = (e: Event) => {
      const d = (e as CustomEvent<{ id?: number; author?: string }>).detail ?? {};
      const hit = (n: CommentNode): boolean =>
        (d.id != null && n.id === d.id) ||
        (!!d.author && n.author === d.author) ||
        n.children.some(hit);
      if (hit(node)) setCollapsed(false);
    };
    window.addEventListener("hatch:reveal", onReveal as EventListener);
    return () => window.removeEventListener("hatch:reveal", onReveal as EventListener);
  }, [collapsed, node]);

  return (
    <div
      data-comment-id={node.id}
      data-author={node.author ?? ""}
      className={
        depth === 0
          ? "card p-4 sm:p-5"
          : "rounded-lg border border-[color:var(--color-border)]/60 bg-[color:var(--color-bg-elev)]/40 p-3"
      }
    >
      <div className="flex items-center gap-2 text-xs text-[color:var(--color-fg-muted)]">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid size-5 place-items-center rounded-md ring-1 ring-[color:var(--color-border)] transition hover:bg-[color:var(--color-bg)]"
          aria-label={collapsed ? "Expand thread" : "Collapse thread"}
        >
          <span className="font-mono text-[10px] leading-none">
            {collapsed ? "+" : "−"}
          </span>
        </button>
        <span className="font-medium text-[color:var(--color-fg)]">
          {node.author ?? "[deleted]"}
        </span>
        {isOp && (
          <span className="accent-bg rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white">
            OP
          </span>
        )}
        <span>·</span>
        <span>{timeAgo(node.created_at_i)}</span>
        <Upvote id={node.id} />
        {!collapsed && !isDeleted && isExtension() && (
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="font-medium text-[color:var(--color-fg-muted)] transition hover:text-[color:var(--color-accent)]"
          >
            {replying ? "cancel" : "reply"}
          </button>
        )}
        {collapsed && replyCount > 0 && (
          <>
            <span>·</span>
            <span>
              {replyCount} {replyCount === 1 ? "reply" : "replies"} hidden
            </span>
          </>
        )}
      </div>

      {!collapsed && (
        <>
          {isDeleted ? (
            <p className="mt-2 text-sm italic text-[color:var(--color-fg-muted)]">
              [comment removed]
            </p>
          ) : (
            <div
              className="comment-body mt-2 text-[14.5px]"
              dangerouslySetInnerHTML={{ __html: node.text ?? "" }}
            />
          )}

          {replying && (
            <div className="mt-3">
              <CommentBox
                parentId={String(node.id)}
                getForm={() => getReplyForm(node.id)}
                onPosted={() => {
                  setReplying(false);
                  onReplyPosted?.();
                }}
                autoFocus
                placeholder="Reply…"
              />
            </div>
          )}

          {node.children.length > 0 && (
            <div
              className="mt-3 space-y-2 border-l-2 pl-3 sm:pl-4"
              style={{ borderColor: `${hue}55` }}
            >
              {node.children.map((c) => (
                <Comment
                  key={c.id}
                  node={c}
                  depth={depth + 1}
                  op={op}
                  onReplyPosted={onReplyPosted}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
