import type { CommentNode } from "./api";

/**
 * Prune a comment forest down to the branches a given user took part in.
 *
 * A branch is kept when it leads to one of their comments, so the ancestors
 * above it stay for context. Their own comments keep their whole subtree —
 * replies to you are the part you most want to see — while sibling branches
 * they never touched are dropped. Returns the input untouched with no user.
 */
export function filterParticipated(
  nodes: CommentNode[],
  username: string | null,
): CommentNode[] {
  if (!username) return nodes;
  const out: CommentNode[] = [];
  for (const n of nodes) {
    if (n.author === username) {
      out.push(n);
      continue;
    }
    const children = filterParticipated(n.children, username);
    if (children.length > 0) out.push({ ...n, children });
  }
  return out;
}

/** Whether the user has any comment in this forest — i.e. is the filter worth offering. */
export function hasParticipated(
  nodes: CommentNode[],
  username: string | null,
): boolean {
  if (!username) return false;
  return nodes.some(
    (n) => n.author === username || hasParticipated(n.children, username),
  );
}
