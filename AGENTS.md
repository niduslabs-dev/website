# Nidus Labs website — Agent Guide

> Part of the Nidus Labs workspace (`~/Work/personal/niduslabs`). Start with the workspace guide `../AGENTS.md` and `../STATUS.md`; this file covers this repo only.

`niduslabs.dev`: the studio home page, each app's page (`/splito`, `/drop`, `/pane`) and Splito's privacy policy and terms (`/splito/privacy`, `/splito/terms`, account deletion). It's plain HTML and CSS in `public/`, served by a Cloudflare Worker with static assets, except Splito's privacy policy and terms and the two live release-notes pages (below). The legal pages' wording lives in `content/splito/*.md`, and `scripts/build-legal.mjs` builds the pages and publishes the Markdown (`/splito/privacy.md`, `/splito/terms.md`) that the Splito app shows natively. Edit the Markdown, never the built HTML (it's gitignored). Setup and commands are in `README.md`.

- **Deploys go through CI only:** `ci.yml` runs wrangler's dry-run deploy and, on main, then deploys in the same job and checks that the live privacy page and its Markdown carry the expected sentence; update both checks when you change the policy wording. There's no deploy script to run by hand.
- **Legal pages describe what the apps and dashboard actually do.** Change them with the product, never ahead of it, and don't overclaim.
- **Keep the existing tone and structure,** and update a page's "Last updated" date when its content changes.
- **Product pages describe what the app does today** (`/drop` and `/pane` follow their READMEs). The Mac app pages share one layout in `public/product.css` (hero, moss download button, screenshot, features); a page's own CSS file holds only what differs. New pages keep their styles in CSS files, with no inline styles or scripts, so the default Content-Security-Policy in `public/_headers` holds.
- **Two live routes: `/drop/releases` and `/pane/releases`.** They're the only paths that run the Worker (`run_worker_first` in `wrangler.jsonc`; everything else is a static asset). `src/releases.js` renders them:
  - **Latest tag:** a `HEAD` to `github.com/niduslabs-dev/<app>/releases/latest` without following the redirect; its 302 `location` ends in `/releases/tag/vX.Y.Z`. That's not the API, so no token and no rate limit. The tag is kept in the Cache API for 60 seconds, so a new release shows within about a minute.
  - **Notes:** `RELEASE_NOTES.md` from `raw.githubusercontent.com` at that tag. Only `## X.Y.Z` sections and their `- ` lines count; the intro is ignored, one trailing full stop is dropped and every piece of text is escaped. The rendered page is cached per tag and per deployed version (`CF_VERSION_METADATA`) with no expiry, so a deploy that changes the markup renders afresh.
  - **GitHub down:** the last page rendered is served; with nothing cached, a 503 page that links to the GitHub releases. Never an error page.
  - **Headers:** `_headers` doesn't apply to the Worker's responses, so `SECURITY_HEADERS` in `src/releases.js` repeats the default policy (a test checks they match; change both together). Browsers get `Cache-Control: public, max-age=60`.
  - **Styles** are in `public/releases.css`, on top of `product.css`. The product pages only link to them ("Release notes" beside Source on GitHub).
  - **Tests:** `pnpm test` (Node's test runner; CI runs it) covers the parser, the render and fake GitHub responses.
