# niduslabs.dev

The Nidus Labs website: the studio home page, and each app's privacy policy and terms (`/splito/privacy`, `/splito/terms`).

Plain HTML and CSS in `public/`, served by a Cloudflare Worker with static assets in the Nidus Labs account.

```sh
pnpm install
pnpm dev      # http://localhost:8787
pnpm deploy
```

Icons, the mark and the link-preview image are copied from [niduslabs-dev/assets](https://github.com/niduslabs-dev/assets) (`web/`, `logo/`, `social/og-image.png`); copy them again when the assets change.
