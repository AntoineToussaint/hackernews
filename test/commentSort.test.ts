import { test, expect } from "bun:test";
import type { CommentNode } from "../src/sources/hn/api";
import {
  countAll,
  countDescendants,
  sortComments,
} from "../src/sources/hn/commentSort";

/** Tiny builder: node(id, time, ...children). */
function node(
  id: number,
  created_at_i: number,
  ...children: CommentNode[]
): CommentNode {
  return { id, author: `u${id}`, text: null, created_at_i, children };
}

const ids = (nodes: CommentNode[]) => nodes.map((n) => n.id);

// 1 (t=100) has two replies; 2 (t=300) is newest with none; 3 (t=200) has one.
const thread: CommentNode[] = [
  node(1, 100, node(11, 150), node(12, 400)),
  node(2, 300),
  node(3, 200, node(31, 250)),
];

test("best orders top-level comments by HN's ranking", () => {
  expect(ids(sortComments(thread, "best", [3, 1, 2]))).toEqual([3, 1, 2]);
});

test("best falls back to the API order when there's no ranking", () => {
  expect(sortComments(thread, "best")).toBe(thread);
  expect(sortComments(thread, "best", null)).toBe(thread);
  expect(sortComments(thread, "best", [])).toBe(thread);
});

test("best keeps unranked comments, in order, at the end", () => {
  // 3 is missing from the ranking (e.g. posted after we fetched it).
  expect(ids(sortComments(thread, "best", [2, 1]))).toEqual([2, 1, 3]);
  expect(ids(sortComments(thread, "best", [99]))).toEqual([1, 2, 3]);
});

test("best leaves replies in their chronological API order", () => {
  const out = sortComments(thread, "best", [3, 1, 2]);
  expect(ids(out[1].children)).toEqual([11, 12]);
});

test("newest and oldest sort by creation time", () => {
  expect(ids(sortComments(thread, "newest"))).toEqual([2, 3, 1]);
  expect(ids(sortComments(thread, "oldest"))).toEqual([1, 3, 2]);
});

test("sorting applies to replies too", () => {
  const newest = sortComments(thread, "newest");
  expect(ids(newest[2].children)).toEqual([12, 11]);
  expect(ids(sortComments(thread, "oldest")[0].children)).toEqual([11, 12]);
});

test("replies sorts by descendant count, oldest first on ties", () => {
  expect(ids(sortComments(thread, "replies"))).toEqual([1, 3, 2]);

  // Same reply count (zero) everywhere → pure oldest-first.
  const flat = [node(1, 300), node(2, 100), node(3, 200)];
  expect(ids(sortComments(flat, "replies"))).toEqual([2, 3, 1]);
});

test("replies counts whole subtrees, not just direct children", () => {
  const deep = node(1, 10, node(2, 20, node(3, 30, node(4, 40))));
  const wide = node(5, 10, node(6, 20), node(7, 30));
  expect(ids(sortComments([wide, deep], "replies"))).toEqual([1, 5]);
});

test("sorting never mutates the input", () => {
  const before = JSON.stringify(thread);
  sortComments(thread, "replies");
  sortComments(thread, "newest");
  expect(JSON.stringify(thread)).toBe(before);
});

test("counts cover the full tree", () => {
  expect(countDescendants(thread[0])).toBe(2);
  expect(countDescendants(thread[1])).toBe(0);
  expect(countAll(thread)).toBe(6);
  expect(countAll([])).toBe(0);
});

test("empty and single-node forests are stable", () => {
  expect(sortComments([], "newest")).toEqual([]);
  expect(ids(sortComments([node(1, 5)], "replies"))).toEqual([1]);
});
