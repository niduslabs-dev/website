# Nidus Labs website — Agent Guide

> Part of the Nidus Labs workspace (`~/Work/personal/niduslabs`). Start with the workspace guide `../AGENTS.md` and `../STATUS.md`; this file covers this repo only.

`niduslabs.dev`: the studio home page and each app's privacy policy and terms (`/splito/privacy`, `/splito/terms`, account deletion). It's plain HTML and CSS in `public/`, served by a Cloudflare Worker with static assets. Setup and commands are in `README.md`.

- **Deploys go through CI only:** Checks (wrangler's dry-run deploy), then Deploy on main. Deploy checks that the live privacy page carries its expected sentence; update that check when you change the policy wording. There's no deploy script to run by hand.
- **Legal pages describe what the apps and dashboard actually do.** Change them with the product, never ahead of it, and don't overclaim.
- **Keep the existing tone and structure,** and update a page's "Last updated" date when its content changes.
