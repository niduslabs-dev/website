// Builds Splito's legal pages from their Markdown, the one place the wording
// lives: each `content/splito/<page>.md` becomes `public/splito/<page>/index.html`
// in the site's page shell, and is also published as `public/splito/<page>.md`
// for the Splito app, which shows it natively. Both outputs are generated, so
// they're gitignored; `pnpm dev` and `pnpm check` (and so CI's deploy) run this
// first.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { marked } from "marked";

/** The pages, in the order the site's nav lists them. */
const pages = [
  {
    slug: "privacy",
    nav: "Privacy",
    description: "What Splito collects, why, who it's shared with, and how to delete it.",
  },
  {
    slug: "terms",
    nav: "Terms",
    description: "The terms for using Splito.",
  },
];

const shell = ({ title, description, nav, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Nidus Labs</title>
<meta name="description" content="${description}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="page">
<header class="site">
<a class="brand" href="/"><img class="mark-light" src="/mark.svg" alt=""><img class="mark-dark" src="/mark-on-dark.svg" alt="">Nidus <span>Labs</span></a>
<nav class="site" aria-label="Main">${nav}</nav>
</header>

<main class="doc">
${body}</main>

<footer class="site">
<span>© 2026 Nidus Labs</span>
<a href="mailto:support@niduslabs.dev">support@niduslabs.dev</a>
</footer>
</div>
</body>
</html>
`;

const navFor = (current) =>
  pages
    .map(({ slug, nav }) =>
      slug === current
        ? `<a href="/splito/${slug}" aria-current="page">${nav}</a>`
        : `<a href="/splito/${slug}">${nav}</a>`,
    )
    .join("");

for (const page of pages) {
  const source = new URL(`../content/splito/${page.slug}.md`, import.meta.url);
  const markdown = await readFile(source, "utf8");
  const title = /^# (.+)$/m.exec(markdown)?.[1];
  if (!title) throw new Error(`content/splito/${page.slug}.md needs a "# " title`);

  const body = marked
    .parse(markdown)
    // The site's styles: the date under the title, and a table that scrolls
    // on its own on a narrow screen.
    .replace(/<p>(Last updated [^<]+)<\/p>/, '<p class="updated">$1</p>')
    .replaceAll("<table>", '<div class="table-scroll">\n<table>')
    .replaceAll("</table>", "</table>\n</div>");

  const html = shell({ title, description: page.description, nav: navFor(page.slug), body });
  const directory = new URL(`../public/splito/${page.slug}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), html);
  await copyFile(source, new URL(`../public/splito/${page.slug}.md`, import.meta.url));
}

console.log(`Built ${pages.map(({ slug }) => `/splito/${slug}`).join(", ")} from content/splito.`);
