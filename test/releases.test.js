import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  SECURITY_HEADERS,
  escapeHtml,
  parseReleaseNotes,
  renderFallbackPage,
  renderReleasesPage,
  serveReleases,
} from "../src/releases.js";

const NOTES = `# Release notes

The release workflow takes the section for the version it builds.
- Not a release line: this is the intro.

## 1.0.1

- Screenshots follow macOS's Save to setting.
- Device › Switch Emulator… (⌘E) opens the switcher
- Ends with an ellipsis...

## 1.0.2

- Newest <script>alert("x")</script> & co

## Not a version

- Ignored
`;

describe("parseReleaseNotes", () => {
  it("reads each version's lines, newest first, without the intro", () => {
    assert.deepEqual(parseReleaseNotes(NOTES), [
      { version: "1.0.2", lines: ['Newest <script>alert("x")</script> & co'] },
      {
        version: "1.0.1",
        lines: [
          "Screenshots follow macOS's Save to setting",
          "Device › Switch Emulator… (⌘E) opens the switcher",
          "Ends with an ellipsis...",
        ],
      },
    ]);
  });

  it("orders versions numerically", () => {
    const md = "## 1.0.9\n- a\n## 1.0.10\n- b\n## 1.0.10-beta.1\n- c\n";
    assert.deepEqual(
      parseReleaseNotes(md).map((r) => r.version),
      ["1.0.10", "1.0.10-beta.1", "1.0.9"],
    );
  });

  it("handles CRLF and an empty file", () => {
    assert.deepEqual(parseReleaseNotes("## 2.0.0\r\n- One.\r\n"), [
      { version: "2.0.0", lines: ["One"] },
    ]);
    assert.deepEqual(parseReleaseNotes(""), []);
  });
});

describe("renderReleasesPage", () => {
  const html = renderReleasesPage("pane", "v1.0.2", parseReleaseNotes(NOTES));

  it("escapes the notes", () => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("Newest &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co"));
  });

  it("has its own title, description and canonical URL", () => {
    assert.ok(html.includes("<title>Pane release notes · Nidus Labs</title>"));
    assert.ok(
      html.includes(
        '<meta name="description" content="Every version of Pane, newest first, with what changed in each.">',
      ),
    );
    assert.ok(html.includes('<link rel="canonical" href="https://niduslabs.dev/pane/releases">'));
    assert.ok(html.includes('<link rel="stylesheet" href="/releases.css">'));
  });

  it("marks the tag's version Latest and offers its download", () => {
    assert.ok(html.includes('<h2 id="v1-0-2">1.0.2 <span class="pill">Latest</span></h2>'));
    assert.ok(html.includes('<h2 id="v1-0-1">1.0.1</h2>'));
    assert.ok(
      html.includes(
        'href="https://github.com/niduslabs-dev/pane/releases/latest/download/Pane.dmg">Download 1.0.2</a>',
      ),
    );
    assert.ok(html.indexOf("v1-0-2") < html.indexOf("v1-0-1"));
  });

  it("has the app bar with Release notes current, the skip link and its target", () => {
    for (const page of [html, renderFallbackPage("pane")]) {
      assert.ok(page.includes('<a class="skip" href="#content">Skip to content</a>'));
      assert.ok(page.includes('<main id="content">'));
      assert.ok(page.includes('<nav class="appbar" aria-label="Pane">'));
      assert.ok(page.includes('<a href="/pane">Overview</a><a href="/pane/releases" aria-current="page">Release notes</a>'));
      assert.ok(page.includes('popovertarget="app-pages"><span class="vh">Pane pages, </span>Release notes'));
      assert.ok(page.includes('id="app-pages" popover>'));
      assert.ok(!page.includes('class="crumb"'));
      assert.equal((page.match(/<nav /g) ?? []).length, 2);
    }
  });

  it("ends with the app's support address", () => {
    assert.ok(html.includes('<a href="mailto:support@niduslabs.dev">support@niduslabs.dev</a>\n</footer>'));
  });

  it("has no inline styles or scripts", () => {
    for (const page of [html, renderFallbackPage("drop")]) {
      assert.ok(!/<script|<style|\sstyle=/i.test(page));
    }
  });
});

describe("SECURITY_HEADERS", () => {
  it("matches the default policy in public/_headers", () => {
    const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
    const defaults = headers.split(/\n\S/)[0];
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.ok(defaults.includes(`  ${name}: ${value}\n`), `${name} differs from public/_headers`);
    }
  });
});

/** A Cache API stand-in that honours max-age against a fake clock. */
function fakeCache(clock) {
  const entries = new Map();
  return {
    entries,
    async match(request) {
      const entry = entries.get(request.url);
      if (!entry || entry.expires <= clock.now) return undefined;
      return new Response(entry.body, { headers: entry.headers });
    },
    async put(request, response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control"))[1]);
      entries.set(request.url, {
        body: await response.text(),
        headers: response.headers,
        expires: clock.now + maxAge * 1000,
      });
    },
  };
}

/** GitHub as seen by the Worker: the releases/latest redirect and raw files by tag. */
function fakeGitHub({ tag, files = {}, down = false }) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    if (down) throw new TypeError("fetch failed");
    if (url === "https://github.com/niduslabs-dev/drop/releases/latest") {
      assert.equal(init.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { location: `https://github.com/niduslabs-dev/drop/releases/tag/${tag}` },
      });
    }
    const raw =
      /^https:\/\/raw\.githubusercontent\.com\/niduslabs-dev\/drop\/([^/]+)\/RELEASE_NOTES\.md$/.exec(
        url,
      );
    if (raw && files[raw[1]]) return new Response(files[raw[1]]);
    return new Response("Not found", { status: 404 });
  };
  return { fetch, calls };
}

describe("serveReleases", () => {
  /** One Worker location: a cache and a clock that persist across requests, and a GitHub that can change. */
  function location(github) {
    const clock = { now: 0 };
    const cache = fakeCache(clock);
    const state = { github };
    const serve = async (method = "GET") => {
      const pending = [];
      const response = await serveReleases("drop", {
        method,
        build: "b1",
        fetch: (url, init) => state.github.fetch(url, init),
        cache,
        waitUntil: (p) => pending.push(p),
      });
      await Promise.all(pending);
      return response;
    };
    return { clock, state, serve };
  }

  const v105 = "## 1.0.5\n- Rolls.\n## 1.0.4\n- Less memory\n";
  const v106 = "## 1.0.6\n- New\n" + v105;

  it("renders the latest tag's notes, checking the tag at most once a minute", async () => {
    const github = fakeGitHub({ tag: "v1.0.5", files: { "v1.0.5": v105 } });
    const { clock, serve } = location(github);

    const first = await serve();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), "public, max-age=60");
    assert.equal(first.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(
      first.headers.get("Content-Security-Policy"),
      SECURITY_HEADERS["Content-Security-Policy"],
    );
    const html = await first.text();
    assert.ok(html.includes('1.0.5 <span class="pill">Latest</span>'));
    assert.ok(html.includes("<li>Rolls</li>"));
    assert.deepEqual(github.calls, [
      "HEAD https://github.com/niduslabs-dev/drop/releases/latest",
      "GET https://raw.githubusercontent.com/niduslabs-dev/drop/v1.0.5/RELEASE_NOTES.md",
    ]);

    clock.now += 30_000;
    assert.equal(await (await serve()).text(), html);
    assert.equal(github.calls.length, 2, "no GitHub request within the minute");

    clock.now += 31_000;
    assert.equal(await (await serve()).text(), html);
    assert.deepEqual(github.calls.slice(2), [
      "HEAD https://github.com/niduslabs-dev/drop/releases/latest",
    ]);
  });

  it("shows a new release once the tag check expires", async () => {
    const files = { "v1.0.5": v105, "v1.0.6": v106 };
    const { clock, state, serve } = location(fakeGitHub({ tag: "v1.0.5", files }));
    await serve();
    state.github = fakeGitHub({ tag: "v1.0.6", files });

    clock.now += 30_000;
    assert.ok(!(await (await serve()).text()).includes("1.0.6"));

    clock.now += 31_000;
    const html = await (await serve()).text();
    assert.ok(html.includes('1.0.6 <span class="pill">Latest</span>'));
    assert.ok(html.includes("Download 1.0.6"));
  });

  it("serves the last page rendered when GitHub is unreachable", async () => {
    const { clock, state, serve } = location(
      fakeGitHub({ tag: "v1.0.5", files: { "v1.0.5": v105 } }),
    );
    const html = await (await serve()).text();
    state.github = fakeGitHub({ down: true });
    clock.now += 61_000;
    const response = await serve();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
  });

  it("serves the last page when the notes at a new tag can't be fetched", async () => {
    const { clock, state, serve } = location(
      fakeGitHub({ tag: "v1.0.5", files: { "v1.0.5": v105 } }),
    );
    const html = await (await serve()).text();
    state.github = fakeGitHub({ tag: "v1.0.6", files: {} });
    clock.now += 61_000;
    assert.equal(await (await serve()).text(), html);
  });

  it("ignores a redirect to something that isn't a release tag", async () => {
    const { serve } = location(fakeGitHub({ tag: "../../evil", files: {} }));
    assert.equal((await serve()).status, 503);
  });

  it("serves a page linking to GitHub when unreachable and nothing is cached", async () => {
    const { serve } = location(fakeGitHub({ down: true }));
    const response = await serve();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(
      response.headers.get("Content-Security-Policy"),
      SECURITY_HEADERS["Content-Security-Policy"],
    );
    assert.ok(
      (await response.text()).includes('href="https://github.com/niduslabs-dev/drop/releases"'),
    );
  });

  it("answers HEAD without a body", async () => {
    const { serve } = location(fakeGitHub({ tag: "v1.0.5", files: { "v1.0.5": v105 } }));
    const response = await serve("HEAD");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  });
});
