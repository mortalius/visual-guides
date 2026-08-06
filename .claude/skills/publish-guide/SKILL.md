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

Remember the folder publishes as-is: `README.md`, `DESIGN.md`, `TODO.md` and `font-explore.html` all
become reachable URLs. **List the folder and read anything you would not want served** before the
first deploy - `ls -a <guide>/`, dotfiles included. Only the guide directory is served, so
repo-level config (`.mcp.json`, `.gitignore`, `render.yaml`) stays out of reach; keep it that way
rather than moving config into a guide folder for convenience.

## 4. Deploy

Two prerequisites, both easy to discover too late. Check them **before** doing the OG work, so the
user can act while you prepare the rest:

1. **The commits must be pushed.** Render builds from the GitHub repo, not from the working tree -
   a local commit is invisible to it. This repo routinely carries unpushed commits, and pushing
   still requires asking. So publishing is the one workflow where a push is part of the job: raise
   it early rather than at the end.
2. **`RENDER_API_KEY` must be in the environment.** The MCP server in the root `.mcp.json` expands
   it at **session start** - so `export`ing it mid-session does nothing; the user has to set it and
   restart Claude Code. Say this explicitly, because "set the key" on its own leads to a restart
   nobody expected.

If the Render tools are absent from the tool list, the key was not set. Ask - never write a key
anywhere in the repo, which publishes as-is.

Check both with:

```bash
git status -sb | head -1                    # ahead/behind origin
[ -n "$RENDER_API_KEY" ] && echo set || echo unset
```

The env check reflects your shell, not the MCP server's - the reliable signal is whether the Render
tools exist at all.

Deploying is outward-facing and creates public infrastructure: confirm with the user before
triggering it, and confirm again before any custom-domain change - the domain ends up in the OG
tags and in every shared link.

**Create the service from the dashboard, not the MCP.** `create_static_site` takes neither
`rootDir` nor `buildFilter`, so a service created that way is not blueprint-managed and
`render.yaml` becomes decorative. Send the user to Dashboard → New Blueprint Instance → the repo;
Render reads `render.yaml` and creates **every** service in it at once. Say so up front: that means
sibling guides go live too, so check whether any of them is unready to be seen (no OG tags, console
404s) and tell the user which URLs exist but should not be shared yet.

MCP tools are for verification afterwards - `list_services`, `list_deploys` - and each needs an
explicit `workspaceId`; ask which workspace if the account has more than one, never guess.
A 404 on the target `onrender.com` host does not mean the name is reserved: Render answers its
entire wildcard domain, and nothing holds a subdomain until the service exists.

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
