/**
 * The live release-notes pages, /drop/releases and /pane/releases.
 *
 * Each request finds the app's latest release tag from GitHub's
 * `releases/latest` redirect (a plain web request, not the API, so no token
 * and no rate limit), fetches RELEASE_NOTES.md at that tag, and renders every
 * `## X.Y.Z` section newest first. A file at a tag never changes, so the page
 * rendered for a tag is cached with no expiry; only the tag lookup is
 * repeated, at most once a minute per Cloudflare location. The notes are
 * untrusted input: every piece of text is escaped.
 *
 * When GitHub can't be reached, the last page rendered is served, and failing
 * that a short page that links to the GitHub releases. Never an error.
 */

/** The apps with a releases page, by URL slug: the name and the icon the app bar shows, as on the app's own page. */
export const APPS = {
  drop: { name: "Drop", icon: "/drop/icon.png" },
  pane: { name: "Pane", icon: "/pane/icon.png" },
};

const ORIGIN = "https://niduslabs.dev";
const GITHUB = "https://github.com/niduslabs-dev";
const RAW = "https://raw.githubusercontent.com/niduslabs-dev";

/** How long one tag lookup stands, so a new release shows within about a minute. */
export const TAG_TTL_SECONDS = 60;
/** What browsers and shared caches may keep a page for. Short, for the same reason. */
export const BROWSER_MAX_AGE_SECONDS = 60;
/** A rendered page at a tag never changes; the Cache API needs some lifetime, so a year. */
const FOREVER_SECONDS = 365 * 24 * 60 * 60;
/** Each GitHub request gives up after this long, so an outage still answers quickly. */
export const GITHUB_TIMEOUT_MS = 5000;

/**
 * Must match the default `/*` policy in public/_headers (a test checks):
 * `_headers` applies only to static assets, never to the Worker's own responses.
 */
export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_HEADING = /^## +(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) *$/;

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Reads the `## X.Y.Z` sections of a RELEASE_NOTES.md and their `- ` lines,
 * newest version first. Everything else (the intro, other headings, prose) is
 * ignored. A line loses one trailing full stop, the site's rule for release
 * notes; an ellipsis stays.
 *
 * @param {string} markdown
 * @returns {{ version: string, lines: string[] }[]}
 */
export function parseReleaseNotes(markdown) {
  const releases = [];
  let current = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = VERSION_HEADING.exec(line);
    if (heading) {
      current = { version: heading[1], lines: [] };
      releases.push(current);
    } else if (/^#{1,2} /.test(line)) {
      current = null;
    } else if (current && line.startsWith("- ")) {
      const text = line
        .slice(2)
        .trim()
        .replace(/(?<!\.)\.$/, "");
      if (text) current.lines.push(text);
    }
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

/** Orders `X.Y.Z` versions numerically; a pre-release sorts before its release. */
export function compareVersions(a, b) {
  const [coreA, preA] = a.split("-", 2);
  const [coreB, preB] = b.split("-", 2);
  const partsA = coreA.split(".").map(Number);
  const partsB = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
  }
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return preA < preB ? -1 : 1;
}

function head(slug, { title, description, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Nidus Labs</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/${slug}/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/${slug}/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/product.css">
<link rel="stylesheet" href="/releases.css">
</head>
<body>
`;
}

const MENU_CHEVRON = `<svg class="menu-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The top of a releases page: the skip link, the global header, then the app's sticky bar with Release notes
 * marked current (its Overview is the way back), as public/drop/index.html has it. On phones the bar's links and
 * Download fold into a popover menu; no script.
 */
function heroStart(slug) {
  const { name, icon } = APPS[slug];
  const dmg = `${GITHUB}/${slug}/releases/latest/download/${name}.dmg`;
  const links = `<a href="/${slug}">Overview</a><a href="/${slug}/releases" aria-current="page">Release notes</a>`;
  return `<a class="skip" href="#content">Skip to content</a>
<div class="page">
<header class="site">
<a class="brand" href="/"><img class="mark-light" src="/mark.svg" alt=""><img class="mark-dark" src="/mark-on-dark.svg" alt="">Nidus <span>Labs</span></a>
<nav class="site" aria-label="Main"><a href="/#apps">Apps</a><a href="mailto:hello@niduslabs.dev">Contact</a></nav>
</header>
</div>
<nav class="appbar" aria-label="${name}"><div class="appbar-inner">
<span class="app-title"><img class="app-icon mac-icon" src="${icon}" width="28" height="28" alt="">${name}</span>
<span class="app-links">${links}</span>
<div class="app-menu"><button type="button" class="app-menu-btn" popovertarget="app-pages"><span class="vh">${name} pages, </span>Release notes${MENU_CHEVRON}</button><div class="app-menu-panel" id="app-pages" popover>${links}<hr><a class="menu-download" href="${dmg}">Download for Mac</a></div></div>
<a class="button button-small" href="${dmg}">Download</a>
</div></nav>
<div class="page">
<main id="content">
<section class="releases-hero">
<h1>Release notes</h1>
`;
}

/** The end of a releases page: the app's support address in the footer, as on the app's own page. */
const FOOT = `</main>

<footer class="site">
<span>© 2026 Nidus Labs</span>
<a href="mailto:support@niduslabs.dev">support@niduslabs.dev</a>
</footer>
</div>
</body>
</html>
`;

/**
 * The full releases page for one app.
 *
 * @param {keyof APPS} slug
 * @param {string} tag the latest release tag, `vX.Y.Z`; its version gets the Latest pill and the download button
 * @param {{ version: string, lines: string[] }[]} releases newest first, from parseReleaseNotes
 */
export function renderReleasesPage(slug, tag, releases) {
  const { name } = APPS[slug];
  const latest = tag.replace(/^v/, "");
  const description = `Every version of ${name}, newest first, with what changed in each.`;
  const sections = releases
    .map(({ version, lines }) => {
      const id = `v${version.replaceAll(".", "-")}`;
      const pill = version === latest ? ' <span class="pill">Latest</span>' : "";
      const items = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
      return `<section class="release" aria-labelledby="${escapeHtml(id)}"><h2 id="${escapeHtml(id)}">${escapeHtml(version)}${pill}</h2><ul>${items}</ul></section>\n`;
    })
    .join("");
  return (
    head(slug, {
      title: `${name} release notes`,
      description,
      canonical: `${ORIGIN}/${slug}/releases`,
    }) +
    heroStart(slug) +
    `<p class="sub">Every version of ${name}, newest first.</p>
<div class="actions"><a class="button" href="${GITHUB}/${slug}/releases/latest/download/${name}.dmg">Download ${escapeHtml(latest)}</a></div>
</section>
<div class="releases">
${sections}</div>
` +
    FOOT
  );
}

/** The page served when GitHub can't be reached and nothing is cached yet. */
export function renderFallbackPage(slug) {
  const { name } = APPS[slug];
  return (
    head(slug, {
      title: `${name} release notes`,
      description: `Every version of ${name}, newest first, with what changed in each.`,
      canonical: `${ORIGIN}/${slug}/releases`,
    }) +
    heroStart(slug) +
    `<p class="sub">The release notes can't be loaded right now. They're also on GitHub.</p>
<div class="actions"><a class="button" href="${GITHUB}/${slug}/releases">Release notes on GitHub</a></div>
</section>
` +
    FOOT
  );
}

/** Cache API keys. They live on the site's own origin but are never served directly. */
function cacheKey(slug, ...parts) {
  return new Request(
    `${ORIGIN}/__releases-cache/${slug}/${parts.map(encodeURIComponent).join("/")}`,
  );
}

/**
 * The app's latest release tag, from the 302 that github.com/…/releases/latest answers.
 * Remembered for TAG_TTL_SECONDS. Returns null when GitHub can't be reached or answers oddly.
 */
async function latestTag(slug, { fetch, cache, waitUntil }) {
  const key = cacheKey(slug, "latest-tag");
  const hit = await cache.match(key);
  if (hit) return hit.text();
  let response;
  try {
    response = await fetch(`${GITHUB}/${slug}/releases/latest`, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "niduslabs.dev" },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  const location = response.headers.get("location") ?? "";
  const tag = /\/releases\/tag\/([^/?#]+)$/.exec(location)?.[1];
  if (response.status !== 302 || !tag || !TAG_PATTERN.test(tag)) return null;
  waitUntil(
    cache.put(
      key,
      new Response(tag, { headers: { "Cache-Control": `max-age=${TAG_TTL_SECONDS}` } }),
    ),
  );
  return tag;
}

/** RELEASE_NOTES.md at a tag, or null when it can't be fetched. */
async function releaseNotesAt(slug, tag, { fetch }) {
  try {
    const response = await fetch(`${RAW}/${slug}/${tag}/RELEASE_NOTES.md`, {
      headers: { "User-Agent": "niduslabs.dev" },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function forever(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `max-age=${FOREVER_SECONDS}`,
    },
  });
}

function page(body, status, cacheControl, method) {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Renders the HTML for an app's releases page: from the per-tag cache, else
 * from GitHub, else the last page rendered. Null when there's nothing to show.
 *
 * @param {string} build identifies the deployed Worker version, so a deploy that changes the markup renders afresh
 */
async function releasesHtml(slug, build, deps) {
  const tag = await latestTag(slug, deps);
  if (tag) {
    const key = cacheKey(slug, "page", build, tag);
    const hit = await deps.cache.match(key);
    if (hit) return hit.text();
    const markdown = await releaseNotesAt(slug, tag, deps);
    if (markdown !== null) {
      const html = renderReleasesPage(slug, tag, parseReleaseNotes(markdown));
      deps.waitUntil(
        Promise.all([
          deps.cache.put(key, forever(html)),
          deps.cache.put(cacheKey(slug, "last"), forever(html)),
        ]),
      );
      return html;
    }
  }
  const last = await deps.cache.match(cacheKey(slug, "last"));
  return last ? last.text() : null;
}

/**
 * Answers GET or HEAD for /<slug>/releases.
 *
 * @param {keyof APPS} slug
 * @param {{ method: string, build: string, fetch: typeof fetch, cache: Cache, waitUntil: (p: Promise<unknown>) => void }} deps
 */
export async function serveReleases(slug, { method, build, ...deps }) {
  let html = null;
  try {
    html = await releasesHtml(slug, build, deps);
  } catch {
    html = null;
  }
  if (html !== null) {
    return page(html, 200, `public, max-age=${BROWSER_MAX_AGE_SECONDS}`, method);
  }
  // A 503 tells crawlers and caches this is temporary; the page itself is a normal, working page.
  const fallback = page(renderFallbackPage(slug), 503, "no-store", method);
  fallback.headers.set("Retry-After", String(TAG_TTL_SECONDS));
  return fallback;
}
