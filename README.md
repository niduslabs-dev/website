# niduslabs.dev

> Part of the Nidus Labs workspace (`~/Work/personal/niduslabs`). Start with the workspace guide `../AGENTS.md` and `../STATUS.md`.

The Nidus Labs website: the studio home page, and each app's privacy policy and terms (`/splito/privacy`, `/splito/terms`).

Plain HTML and CSS in `public/`, served by a Cloudflare Worker with static assets in the Nidus Labs account. Splito's privacy policy and terms are written in Markdown (`content/splito/`); `pnpm build` turns them into the pages and also publishes the Markdown itself at `/splito/privacy.md` and `/splito/terms.md`, which the Splito app renders.

```sh
pnpm install
pnpm build    # the Splito legal pages and their Markdown, from content/splito
pnpm dev      # build, then http://localhost:8787
pnpm check    # build, then wrangler's dry-run deploy: reads the config and public/, uploads nothing
```

## Deploying

Production changes ship only through CI; never `wrangler deploy` from a laptop.

- **CI** (`.github/workflows/ci.yml`) runs `pnpm check` on each push to main and on pull requests. Commits that only touch Markdown outside `content/`, or `docs/`, skip it.
- On main, the same job then deploys: on each push once the check passes, or by hand (`gh workflow run ci.yml -R niduslabs-dev/website`, which checks and deploys main as it is). It runs `wrangler deploy`, tagged with the commit, then fetches the live `/splito/privacy` and `/splito/privacy.md` and looks for the policy's newest sentence. When that sentence changes, update `expected` in both steps of the workflow.
- It needs the repository secret `CLOUDFLARE_API_TOKEN` (the shared Nidus Labs token, with Workers deploy rights on the account in `wrangler.jsonc`). Runs that deploy use the `LINUX_RUNNER` variable when it's set, else `ubuntu-latest`: the zone's Bot Fight Mode challenges GitHub's own runners, so the live check can't pass from them. Pull requests, from forks too, run on GitHub's own `ubuntu-latest`, free for a public repo, without the secret, and never on the self-hosted Mac.

Icons, the mark and the link-preview image are copied from [niduslabs-dev/assets](https://github.com/niduslabs-dev/assets) (`web/`, `logo/`, `social/og-image.png`); copy them again when the assets change.
