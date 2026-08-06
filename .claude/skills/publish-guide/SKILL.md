---
name: publish-guide
description: Publish a visual guide as a Render static site - OG tags and preview image, blueprint service, deploy, then the LinkedIn Post Inspector warm-up in the right order. Use when the user wants to deploy a guide, put it online, add OG tags, or share it on LinkedIn.
---

# Publishing a guide

Authoritative sources: `CONTRIBUTING.md` §6 (checklist) and §7 (Render keys); `render.yaml` header
comment; `DESIGN.md` §5 (mandatory page minimum, including OG tags).

## Order matters, and one step is irreversible in practice

LinkedIn caches the preview **per URL for a long time**. A bad first scrape sticks and there is no
clean way to force a re-read for that URL. So: OG tags and the image must be live and correct
**before** the URL is ever pasted into LinkedIn, the Post Inspector, or any chat that unfurls links.

Warn the user about this explicitly before deploying, not after.

## 1. Gate - run `guide-review` first

Do not publish an unreviewed guide. Both current guides also fail the pre-publication checklist on
OG tags, so expect to add them as part of this work.

## 2. OG tags

In `<head>`, absolute URLs only (relative ones silently yield no preview):

```html
<meta property="og:type" content="article">
<meta property="og:url" content="https://<host>/">
<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:image" content="https://<host>/og.png">
<meta name="twitter:card" content="summary_large_image">
```

- Image **1200×627**, committed into the guide folder (it ships as-is - no build step to generate it).
- Title and description are the post's first impression: name the subject and the promise, not the
  technology stack. Reuse the guide's own promise sentence from its README rather than inventing new
  marketing copy - and none of the banned clichés (`DESIGN.md` §4).
- Add `<meta name="description">` and a favicon while here: the `favicon.ico 404` is the one
  tolerated console error, and publishing is the moment to stop tolerating it.

The image must depict the guide - a screenshot of its most legible cross-section beats an abstract
graphic. Take it at 1400px width and crop.

## 3. Blueprint

Confirm the guide's service in `render.yaml`: `type: web`, `runtime: static`, `rootDir: <guide>`,
`staticPublishPath: .`, `buildCommand: ""`, and `buildFilter.paths: [<guide>/**]`.

`buildFilter` is **mandatory** - without it every guide rebuilds on any commit. `buildCommand` stays
empty; any command there means a toolchain leaked into the series.

Remember the folder publishes as-is: `README.md`, `DESIGN.md`, `TODO.md`, `font-explore.html` all
become reachable URLs. Check nothing sensitive is in the folder before the first deploy.

## 4. Deploy

The Render MCP server is configured in `envoy-gateway-visualization/.mcp.json` and reads
`RENDER_API_KEY` from the environment - it is only picked up when the cwd is that folder. If the
tools are unavailable, the key is not set; ask the user to set it rather than putting a key
anywhere in the repo.

Deploying is outward-facing and creates public infrastructure: confirm with the user before
triggering it, and confirm again before any custom-domain change - the domain ends up in the OG
tags and in every shared link.

After the first deploy, fetch the live URL and verify: the page renders (not a 404 from a wrong
`staticPublishPath`), assets load over https, and the OG tags in the served HTML carry the real
host - not a placeholder.

## 5. LinkedIn warm-up

Only now:

1. Run the URL through [Post Inspector](https://www.linkedin.com/post-inspector/).
2. Confirm the rendered preview shows the intended title, description, and image at the right crop.
3. If it is wrong, fix and re-inspect **before** posting. After the post exists, the cached preview
   is what everyone sees.

## 6. Record it

- Root `README.md` table: replace «не задеплоен» with the live URL.
- Guide `README.md` header line: add the published URL (`CONTRIBUTING.md` §3 leaves a slot for it).
- Clear the corresponding items from the guide's `TODO.md`.
- Commit - and do not push unless the user asks.
