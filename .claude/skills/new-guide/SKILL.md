---
name: new-guide
description: Scaffold a new visual guide in this repo - pick the donor guide, copy the skeleton, strip content, wire tokens, write README/DESIGN, register in render.yaml. Use when the user wants to start a guide on a new topic, add a new visualization, or asks how to begin a new guide.
---

# Scaffolding a new guide

Authoritative sources - read them, do not restate them from memory:
`CONTRIBUTING.md` §4 (steps), §2 (folder layout), §3 (README structure); `DESIGN.md` §0–§5 (the law).
This skill is the procedure and the order; those documents are the content.

## Gate 0 - the promise, before any file

Ask the user for one sentence: **what will the reader understand that they did not before?**
Refuse to scaffold without it. If it cannot be phrased, there is no material yet - only a pile of
facts, and the guide will become a reference table nobody reads.

Then agree on **3–5 cross-sections** (layers / acts), each answering its own question. More than
five means the material does not fit one page and wants to be two guides. Fewer than three usually
means it is a diagram, not a guide.

Record both in the new README's opening paragraph verbatim - later edits get judged against them.

## Gate 1 - pick the donor

Copy the closest existing guide by *genre*, not by topic. Never start from an empty file: the
skeleton already satisfies the law, and a hand-rolled one will not.

| Material is about… | Donor | What you inherit |
|---|---|---|
| topology, who references whom, what a field does | `envoy-gateway-visualization` | SVG node graph, click→panel, layer partials, deep links |
| quantity, how much survives, what a knob changes | `traces-tempo` | `model.js` pure-math split, sliders, variable-width flows, 36-check self-test |

State the choice to the user with the reason before copying. If neither fits, say so and propose
the closer one plus what you will have to build from scratch - do not silently invent a third
skeleton.

## Steps

1. `mkdir <guide-name>` - kebab-case, Latin, topical. **It becomes the site URL and `rootDir`**,
   so renaming later breaks published links. Get it right now, not later.
2. Copy the donor's `index.html`, `styles.css`, `data.js`, `app.js` (+ `model.js` / `layers/`).
3. **Strip content, keep the skeleton.** Empty out `data.js` down to its structure with one
   worked example entry per shape. In `index.html` keep masthead, nav container, legend, panel,
   footer; delete topical text. Do not yet touch `app.js`.
   **The OG block is the dangerous part of a copy.** If the donor is
   `envoy-gateway-visualization`, its `og:url` and `og:image` are absolute URLs pointing at
   `envoy-gateway-guide.onrender.com` - copied verbatim, the new guide advertises the donor's title
   and the donor's preview image, and nothing on the page looks wrong. Retarget `og:url`,
   `og:image`, `og:title`, `og:description`, `og:image:alt` and `<title>`/`<meta description>` to
   the new guide's own host in the same edit as the copy, and delete the inherited `og-preview.png`
   so a stale image cannot ship. Leave `og:image` pointing at a file you have not made yet only if
   you record it in `TODO.md` - see the OG step in `publish-guide`.
4. `:root` in `styles.css`: keep the canonical blocks byte-identical (they came from the donor,
   which passes the check). Rename the semantic accents to this guide's vocabulary - the values
   are fixed, the names are yours (`DESIGN.md` §1).
5. Reset every `?v=N` to 1 - see `CLAUDE.md`, and count the places with `grep -n '?v=' index.html`
   rather than trusting prose.
6. `node tools/check-tokens.mjs <guide-name>` - **now, before the first commit.** Fixing token
   drift after content exists means editing two things at once.
7. Write `README.md` to the fixed structure of `CONTRIBUTING.md` §3. Headings are verbatim; do not
   improvise. Fill «Ключевой контракт» **first** - it is the section an agent reads before editing,
   and if the contract is unwritten the next edit will break it.
8. Write the local `DESIGN.md`: colour→role mapping (§1), own components numbered **from §3.5**,
   and the deviations section (§5). §3.1–3.4 are reserved series-wide forever - code comments
   point at them.
9. Register: a service in `render.yaml` (`rootDir` + `buildFilter.paths`, `buildCommand: ""`) and a
   row in the root `README.md` table with «не задеплоен». Note that applying the blueprint deploys
   **every** service in it, so a guide registered here goes live the next time anyone publishes a
   sibling - which is why the OG block has to be right by then, not just before its own post.
10. Add the guide's OG work to its `TODO.md`: the 1200×627 preview and the Post Inspector run.
    These are the two publication steps that cannot be done at scaffold time - the preview needs
    real content to screenshot, and the inspector needs a live URL. Writing them down now is what
    stops a guide reaching Render with no preview, the way `traces-tempo` did.
11. Add any deviations to the registry in root `DESIGN.md` §6.
12. Only then write real content, `data.js` first.

## Non-negotiables while scaffolding

- No `package.json`, no build step, no framework - `CLAUDE.md` explains why this is permanent.
- `data.js` / `app.js` split even for a tiny guide: it is what lets content be edited without
  reading logic.
- ≤7–9 elements in view per diagram. If a cross-section exceeds it, split the cross-section rather
  than shrinking the type.
- Build the self-test as you go, not at the end. `envoy-gateway-visualization` is the cautionary
  example: it shipped without one and its ID contracts are still checked only by hand.

## Done when

`check-tokens.mjs` passes · `?selftest=1` renders a banner · both README and local `DESIGN.md`
exist with every mandatory section · the guide appears in `render.yaml` and the root README table.

Then hand off to the `guide-review` skill rather than declaring the guide finished.
