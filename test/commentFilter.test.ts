import { test, expect } from "bun:test";
import type { CommentNode } from "../src/sources/hn/api";
import {
  filterParticipated,
  hasParticipated,
} from "../src/sources/hn/commentFilter";

function node(
  id: number,
  author: string | null,
  ...children: CommentNode[]
): CommentNode {
  return { id, author, text: null, created_at_i: id, children };
}

const ids = (nodes: CommentNode[]) => nodes.map((n) => n.id);

//  1 pg
//    11 me            <- mine, buried one level down
//      111 dang       <- a reply to me
//  2 pg               <- no involvement anywhere below
//    21 dang
//  3 me               <- mine, at top level
//    31 pg
//      311 dang
const thread: CommentNode[] = [
  node(1, "pg", node(11, "me", node(111, "dang"))),
  node(2, "pg", node(21, "dang")),
  node(3, "me", node(31, "pg", node(311, "dang"))),
];

test("keeps only branches leading to the user", () => {
  const out = filterParticipated(thread, "me");
  expect(ids(out)).toEqual([1, 3]);
});

test("keeps the ancestors above a comment, for context", () => {
  const out = filterParticipated(thread, "me");
  expect(out[0].author).toBe("pg");
  expect(ids(out[0].children)).toEqual([11]);
});

test("keeps the user's whole subtree, including replies to them", () => {
  const out = filterParticipated(thread, "me");
  expect(ids(out[0].children[0].children)).toEqual([111]);
  // Node 3 is theirs, so everything under it survives untouched.
  expect(out[1]).toBe(thread[2]);
});

test("drops sibling branches the user never touched", () => {
  const out = filterParticipated(thread, "me");
  expect(ids(out)).not.toContain(2);
});

test("no user, or a user who never commented, changes nothing", () => {
  expect(filterParticipated(thread, null)).toBe(thread);
  expect(filterParticipated(thread, "nobody")).toEqual([]);
});

test("never mutates the input", () => {
  const before = JSON.stringify(thread);
  filterParticipated(thread, "me");
  expect(JSON.stringify(thread)).toBe(before);
});

test("hasParticipated finds the user at any depth", () => {
  expect(hasParticipated(thread, "me")).toBe(true);
  expect(hasParticipated(thread, "dang")).toBe(true);
  expect(hasParticipated(thread, "nobody")).toBe(false);
  expect(hasParticipated(thread, null)).toBe(false);
  expect(hasParticipated([], "me")).toBe(false);
});

test("deleted comments (null author) never match", () => {
  const deleted = [node(1, null, node(11, null))];
  expect(hasParticipated(deleted, null)).toBe(false);
  expect(filterParticipated(deleted, "me")).toEqual([]);
});
