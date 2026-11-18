# Nidus Labs website — Agent Guide

> Part of the Nidus Labs workspace (`~/Work/personal/niduslabs`). Start with the workspace guide `../AGENTS.md` and `../STATUS.md`; this file covers this repo only.

`niduslabs.dev`: the studio home page, each app's page (`/splito`, `/drop`, `/pane`) and Splito's privacy policy and terms (`/splito/privacy`, `/splito/terms`, account deletion). It's plain HTML and CSS in `public/`, served by a Cloudflare Worker with static assets, except Splito's privacy policy and terms and the two live release-notes pages (below). The legal pages' wording lives in `content/splito/*.md`, and `scripts/build-legal.mjs` builds the pages and publishes the Markdown (`/splito/privacy.md`, `/splito/terms.md`) that the Splito app shows natively. Edit the Markdown, never the built HTML (it's gitignored). Setup and commands are in `README.md`.

- **Deploys go through CI only:** `ci.yml` runs wrangler's dry-run deploy and, on main, then deploys in the same job and checks that the live privacy page and its Markdown carry the expected sentence; update both checks when you change the policy wording. There's no deploy script to run by hand.
- **Legal pages describe what the apps and dashboard actually do.** Change them with the product, never ahead of it, and don't overclaim.
- **Keep the existing tone and structure,** and update a page's "Last updated" date when its content changes.
- **Navigation is one system on every page** (approved by Jatin 2026-11-18; the boards are "Website navigation" on the [identity canvas](https://claude.ai/artifact/5eBm9qNvc1qVzgWk8PbfBd), source in the workspace's `design/boards/website/`):
  - **Header:** the same everywhere: the brand (home), Apps (`/#apps`) and Contact (`hello@`), each link 44 px tall; the header stays 86 px.
  - **App bar:** on `/drop`, `/pane` and their releases pages, a sticky bar under the header: the app's icon and name, Overview and Release notes (`aria-current` on the page you're on) and a small Download (the hero keeps its own; both stay). At 600 px and narrower the links and Download fold into one menu button ("Drop pages, Overview" to a screen reader) that opens a `popover` panel placed by CSS anchor positioning. No script. The bar is one `nav` labelled with the app's name; the panel isn't a second nav. The static pages carry the bar's markup by hand; the Worker's `heroStart` renders the same for the releases and 503 pages. Keep them identical.
  - **Skip link and target:** app pages start with "Skip to content" (shown on focus) and have `main id="content"`; `scroll-padding-top` (57 px, in `product.css`) keeps targets and focus clear of the bar.
  - **Back links:** only on Splito's sub-pages ("‹ [icon] Splito", `aria-label` "Back to Splito"), from the shell in `scripts/build-legal.mjs`, which also builds delete account (`content/splito/delete-account.html`).
  - **Footer:** © and one address: `support@` on an app's pages and Splito's sub-pages, `hello@` on home and the 404. Splito's sub-pages add a Privacy, Terms, Delete account row with `aria-current`.
  - **Links:** underline only inside prose; navigation and actions never underline, and every link outside prose is at least 44 px tall. The moss focus ring (2 px, 2 px gap) is in `styles.css` for every page. Under forced colours, buttons get a 1 px edge and the current page is underlined.
  - **404:** the site header and footer, a Go home button and a See the apps link.
- **Product pages describe what the app does today** (`/drop` and `/pane` follow their READMEs). The Mac app pages share one layout in `public/product.css` (hero, moss download button, screenshot, features); a page's own CSS file holds only what differs. New pages keep their styles in CSS files, with no inline styles or scripts, so the default Content-Security-Policy in `public/_headers` holds.
- **Two live routes: `/drop/releases` and `/pane/releases`.** They're the only paths that run the Worker (`run_worker_first` in `wrangler.jsonc`; everything else is a static asset). `src/releases.js` renders them:
  - **Latest tag:** a `HEAD` to `github.com/niduslabs-dev/<app>/releases/latest` without following the redirect; its 302 `location` ends in `/releases/tag/vX.Y.Z`. That's not the API, so no token and no rate limit. The tag is kept in the Cache API for 60 seconds, so a new release shows within about a minute.
  - **Notes:** `RELEASE_NOTES.md` from `raw.githubusercontent.com` at that tag. Only `## X.Y.Z` sections and their `- ` lines count; the intro is ignored, one trailing full stop is dropped and every piece of text is escaped. The rendered page is cached per tag and per deployed version (`CF_VERSION_METADATA`) with no expiry, so a deploy that changes the markup renders afresh.
  - **GitHub down:** the last page rendered is served; with nothing cached, a 503 page that links to the GitHub releases. Never an error page.
  - **Headers:** `_headers` doesn't apply to the Worker's responses, so `SECURITY_HEADERS` in `src/releases.js` repeats the default policy (a test checks they match; change both together). Browsers get `Cache-Control: public, max-age=60`.
  - **Styles** are in `public/releases.css`, on top of `product.css` (which also holds the app bar). The app pages link to them from the app bar and from "Release notes" beside Source on GitHub.
  - **Tests:** `pnpm test` (Node's test runner; CI runs it) covers the parser, the render and fake GitHub responses.

## Design deviations

The site doesn't read the studio's generated tokens yet (`design/MIGRATION.md`, "Website"). Until it does, these differ from the source on purpose, recorded 2026-11-18:

| Token | The site's value | Why |
|---|---|---|
| `color.role.link` (#466E41 / #8DBB82) | `--link` #3B5E37 / #A9CF9F | The site's link colours predate the tokens; both pass 4.5:1 on every ground they sit on |
| `color.role.textSecondary` (#64636C light) | `--muted` #6B6A73 (brand muted) | Measured 4.86:1 on the page ground, 5.34:1 on cards |
| `color.role.surfaceBaseSolid` dark (#232229) | `--surface` #212027 | Older value; no visible difference |
| no role for a page ground | `--ground` dark is ink #17161C | The site is a brand surface, not an app window |
| `color.role.hairline` (12% ink / paper) | `--rule` #E2E2E7 / #33323B, solid | Older value |
| system font, no web type scale | Manrope for everything, 17 px body, card radius 20 | The site is a brand surface |
