import { describe, expect, it } from "vitest";
import { parseIssuePathIdFromPath, parseIssueReferenceFromHref } from "./issue-reference";

describe("issue-reference", () => {
  it("extracts issue ids from company-scoped issue paths", () => {
    expect(parseIssuePathIdFromPath("/PAP/issues/PAP-1271")).toBe("PAP-1271");
    expect(parseIssuePathIdFromPath("/issues/PAP-1179")).toBe("PAP-1179");
  });

  it("does not treat full issue URLs as internal issue paths", () => {
    expect(parseIssuePathIdFromPath("http://localhost:3100/PAP/issues/PAP-1179")).toBeNull();
    expect(parseIssuePathIdFromPath("http://remote.example.test:3103/PAPA/issues/PAPA-115#comment-850083f3-24de-43e7-a8cd-bc01f7cc9f0d")).toBeNull();
  });

  it("normalizes bare identifiers and relative issue paths into internal links", () => {
    expect(parseIssueReferenceFromHref("pap-1271")).toEqual({
      issuePathId: "PAP-1271",
      href: "/issues/PAP-1271",
    });
    expect(parseIssueReferenceFromHref("/PAP/issues/pap-1180")).toEqual({
      issuePathId: "PAP-1180",
      href: "/issues/PAP-1180",
    });
  });

  it("preserves absolute Paperclip issue URLs so origin, port, and hash are not lost", () => {
    expect(parseIssueReferenceFromHref("http://localhost:3100/PAP/issues/PAP-1179")).toBeNull();
    expect(parseIssueReferenceFromHref("http://remote.example.test:3103/PAPA/issues/PAPA-115#comment-850083f3-24de-43e7-a8cd-bc01f7cc9f0d")).toBeNull();
  });

  it("normalizes exact inline-code-like issue identifiers", () => {
    expect(parseIssueReferenceFromHref("PAP-1271")).toEqual({
      issuePathId: "PAP-1271",
      href: "/issues/PAP-1271",
    });
  });
});
