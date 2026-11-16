import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DESCRIPTION, parseAshby, parseGreenhouse, parseLever, parseUsajobs, stripEscapedHtml, stripHtml } from "./opportunityParseCore.js";

test("stripHtml decodes entities, drops script/style, turns blocks into newlines", () => {
  const out = stripHtml("<style>p{color:red}</style><p>Fish &amp; Chips&nbsp;&#169; &#x41;</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul>  a   b");
  assert.equal(out, "Fish & Chips © A\nOne\nTwo\na b");
  assert(!out.includes("alert") && !out.includes("color"));
  assert.equal(stripHtml(""), "");
});

test("stripEscapedHtml decodes the Greenhouse double encoding", () => {
  assert.equal(stripEscapedHtml("&lt;p&gt;Build &amp;amp; test&lt;/p&gt;&lt;script&gt;x()&lt;/script&gt;"), "Build & test");
});

test("USAJOBS: happy path, malformed + non-http(s) skipped", () => {
  const json = { SearchResult: { SearchResultItems: [
    { MatchedObjectId: "123", MatchedObjectDescriptor: { PositionTitle: " Pathways Intern ", PositionURI: "https://www.usajobs.gov/job/123", OrganizationName: "NASA", PositionLocationDisplay: "Houston, TX", PublicationStartDate: "2026-11-01", ApplicationCloseDate: "2026-12-01T00:00:00", PositionSchedule: [{ Name: "Full-time" }], UserArea: { Details: { JobSummary: "<p>Help &amp; learn</p>" } } } },
    { MatchedObjectId: "124", MatchedObjectDescriptor: { PositionTitle: "Bad", PositionURI: "javascript:alert(1)", OrganizationName: "X" } },
    { MatchedObjectId: "125", MatchedObjectDescriptor: { PositionTitle: "Bad ftp", PositionURI: "ftp://x.gov/a", OrganizationName: "X" } },
    { MatchedObjectDescriptor: null },
    null, 7,
  ] } };
  const r = parseUsajobs(json);
  assert.equal(r.length, 1);
  assert.equal(r[0].externalId, "123");
  assert.equal(r[0].title, "Pathways Intern");
  assert.equal(r[0].company, "NASA");
  assert.equal(r[0].location, "Houston, TX");
  assert.equal(r[0].employmentType, "Full-time");
  assert.equal(r[0].postedAt?.toISOString().slice(0, 10), "2026-11-01");
  assert(r[0].closesAt instanceof Date);
  assert.equal(r[0].description, "Help & learn");
});

test("Greenhouse: escaped content stripped, bad items skipped", () => {
  const json = { jobs: [
    { id: 4001, title: "Software Engineer Intern", absolute_url: "https://boards.greenhouse.io/acme/jobs/4001", location: { name: "Remote" }, updated_at: "2026-11-02T10:00:00-05:00", content: "&lt;p&gt;Write &lt;b&gt;C++&lt;/b&gt; &amp;amp; Python&lt;/p&gt;" },
    { id: 4002, title: "No URL", location: { name: "x" } },
    { id: 4003, title: "File url", absolute_url: "file:///etc/passwd" },
    { title: "No id", absolute_url: "https://a.example/x" },
  ] };
  const r = parseGreenhouse(json, "Acme");
  assert.equal(r.length, 1);
  assert.equal(r[0].externalId, "4001");
  assert.equal(r[0].company, "Acme");
  assert.equal(r[0].description, "Write C++ & Python");
  assert(r[0].postedAt instanceof Date);
});

test("Lever: epoch createdAt, commitment, lists", () => {
  const json = [
    { id: "abc-1", text: "Avionics Engineer", hostedUrl: "https://jobs.lever.co/acme/abc-1", categories: { location: "Denver", commitment: "Intern" }, createdAt: 1762000000000, descriptionPlain: "Build boards", lists: [{ text: "Requirements", content: "<li>KiCad</li>" }] },
    { id: "abc-2", text: "Bad", hostedUrl: "http://[bad" },
    "junk",
  ];
  const r = parseLever(json, "Acme");
  assert.equal(r.length, 1);
  assert.equal(r[0].employmentType, "Intern");
  assert.equal(r[0].postedAt?.getTime(), 1762000000000);
  assert.match(r[0].description, /Build boards[\s\S]*Requirements[\s\S]*KiCad/);
});

test("Ashby: skips unlisted, falls back to html", () => {
  const json = { jobs: [
    { id: "a1", title: "Data Analyst", jobUrl: "https://jobs.ashbyhq.com/acme/a1", location: "NYC", publishedAt: "2026-11-03T00:00:00Z", employmentType: "FullTime", descriptionHtml: "<p>SQL</p>", isListed: true },
    { id: "a2", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/a2", isListed: false },
  ] };
  const r = parseAshby(json, "Acme");
  assert.equal(r.length, 1);
  assert.equal(r[0].description, "SQL");
  assert.equal(r[0].employmentType, "FullTime");
});

test("fully malformed input returns []; never throws", () => {
  for (const bad of [null, undefined, 5, "x", [], {}, { jobs: "no" }, { SearchResult: 3 }]) {
    assert.deepEqual(parseUsajobs(bad), []);
    assert.deepEqual(parseGreenhouse(bad, "A"), []);
    assert.deepEqual(parseAshby(bad, "A"), []);
    assert.deepEqual(parseLever(bad, "A"), []);
  }
});

test("caps: description 20,000, title 300, location 200", () => {
  const json = { jobs: [{ id: 1, title: "t".repeat(500), absolute_url: "https://a.example/1", location: { name: "l".repeat(500) }, content: "x".repeat(50_000) }] };
  const [r] = parseGreenhouse(json, "A");
  assert.equal(r.description.length, MAX_DESCRIPTION);
  assert.equal(r.title.length, 300);
  assert.equal(r.location?.length, 200);
});
