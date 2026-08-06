# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Language split:** guide content and prose docs (`README.md`, `DESIGN.md`, `CONTRIBUTING.md`) are
Russian - the audience is Russian-speaking. Code comments and commit messages are English. Keep
writing each in its established language; do not translate existing docs.

## What this is

A monorepo of static visual guides. Every top-level directory containing `styles.css` is one guide
and one Render static site. Currently two: `envoy-gateway-visualization/`, `traces-tempo/`.

**No build step** - this is a principle, not just the current state: HTML + CSS + vanilla JS, no
npm, no bundlers, no frameworks, no preprocessors. The only external dependency is Google Fonts.
Do not propose a toolchain, do not add `package.json`, do not fill `buildCommand` in `render.yaml`.
The point is that the artifact still opens in five years without reviving a toolchain.

## Commands

```bash
cd <guide> && python3 -m http.server        # → localhost:8000
```

An http server is mandatory for `envoy-gateway-visualization`: layers are loaded via `fetch`,
which CORS blocks on `file://` - opening the file directly leaves the board empty.

```bash
node tools/check-tokens.mjs                 # all guides; exit 1 on drift
node tools/check-tokens.mjs <guide>         # one guide (absolute paths accepted)
```

There are no tests or linters in the usual sense. There are exactly two checks:
`check-tokens.mjs` (static: token values, semantic-role coverage, section references) and
`?selftest=1` in the browser (the guide's own invariants). Run both before committing.

`?selftest=1`: `traces-tempo` prints a banner reading **36/36 passed**.
`envoy-gateway-visualization` has no self-test at all, contrary to `CONTRIBUTING.md` §5 - its
main piece of tech debt, recorded in its README.

## How a guide is built

The layer split is identical across guides and mandatory - it is what lets an agent edit content
without reading logic. Most edits should touch only `data.js`.

| File | Role |
|------|------|
| `index.html` | shell: masthead, navigation, colour legend, side panel, footer. Diagram markup is absent or extracted |
| `data.js` | content model: pure data, no DOM |
| `app.js` | behaviour: navigation, selection, deep links, self-test |
| `styles.css` | `:root` tokens (a physical copy of the canon) + components |

Guide-specific: `envoy-gateway-visualization` extracts each cross-section into
`layers/<name>.html`; `traces-tempo` extracts all arithmetic into `model.js` (pure functions, the
single source of every number shown).

**Load order is a critical invariant.** `app.js` wires its handlers at load time, so it must come
last, when all markup is already in the DOM.

- envoy: `data.js` synchronously → `fetch` all `layers/*.html` in parallel → inject into `#board`
  → only then load `app.js` dynamically. If a `fetch` fails, the board renders an error and
  `app.js` is never loaded. That is why `app.js` needs no awareness of the async bootstrap.
- tempo: `model.js` → `data.js` → `app.js` as ordinary script tags.

**Bump the `?v=N` cache-bust on every asset edit**, or readers get a stale file. The version is
duplicated across several places in one `index.html` and all of them must match: envoy has the
`<link>` to `styles.css`, a literal on `data.js`, and the `V` constant in the bootstrap (which
versions `app.js` and `layers/*.html`); tempo has the `<link>` plus three script tags. Both
guides' READMEs state the number of places inaccurately - count with
`grep -n '?v=' index.html` rather than trusting the prose.

**ID-based contracts** are what breaks silently. Each guide's `README.md` documents them under
«Ключевой контракт»; read that section before editing data or markup. In short - envoy:
`data-node` ↔ a key in `PANELS`, `data-f` ↔ `manifest.fields`; tempo: `MATRIX[act][lens]` ↔
`RENDERERS` + `COPY`, `STATE.params` ↔ `KNOBS`, `{{key}}` in `CONFIGS` ↔ `STATE.params`.

## Documentation as contract

Four documents with a strict division of labour:

```
DESIGN.md          the series-wide visual law; token canon lives in <!-- canonical:... --> blocks
CONTRIBUTING.md    process: folder layout, the mandatory guide-README structure, self-test, publishing
<guide>/README.md  presentation and edits: files, navigation, contracts, common edits, verification
<guide>/DESIGN.md  local overlay: own components from §3.5 onward + the deviations section
```

Rules that must not be broken by accident:

1. **`DESIGN.md` section numbers are stable identifiers.** CSS/JS comments reference them
   (`/* ... (DESIGN.md §3.11) */`). Renumbering a section breaks references nobody will re-check.
   Append new material at the end. `§1`, `§2`, `§3.1–3.4`, `§4`, `§5` belong to the root law
   permanently; `§3.5` onward is the guide's territory. `check-tokens.mjs` verifies that every
   reference found in code resolves.
2. **Tokens are copied physically, not shared.** A guide is self-contained - the sites share no
   runtime dependency. Consistency is enforced by `check-tokens.mjs`, which reads the canon from
   the `<!-- canonical:... -->` blocks of the root `DESIGN.md`. Edit the canon there first, then
   the copies.
3. **A guide picks its own semantic token names; the values are fixed.** `--accent-traffic`
   (envoy) and `--accent-keep` (tempo) are the same role - "made it through" - with the same
   value. The checker matches by value, not by name. The mapping must be recorded in the local
   `DESIGN.md` §1.
4. **The guide README's headings are fixed verbatim** (`CONTRIBUTING.md` §3) - an agent picking up
   the work navigates by them. Do not reorder, do not delete an empty section (write "нет" with a
   reason instead).
5. **Deviating from the law is allowed, but must be recorded** - in the local `DESIGN.md` §5 and
   in the registry at root `DESIGN.md` §6, with the reason. An unrecorded deviation is
   indistinguishable from carelessness.

## Traps

- **SVG does not wrap text.** A long label silently overflows its node box. Do not trust your
  eyes: measure with `getComputedTextLength()` - in tempo this is part of the self-test.
- **A semantic token is not a categorical one, even at equal values.** The ambers especially:
  `--accent-warning` `#b45309` and `--c-amber` `#d97706` are **different values**, not aliases.
- **Cyrillic coverage in every font.** Latin-only families fall back to system fonts silently -
  `Fraunces` + `Hanken Grotesk` stood in the series that way for a long time. Check the subset
  before swapping a family.
- **Clarity limit of ≤7–9 elements** in view per diagram. Exceeding it means the cross-section
  should be split, not shrunk.
- **`favicon.ico 404`** is the only console error that is acceptable.

## Deployment

`render.yaml` is the blueprint, one service per guide: `rootDir` + `staticPublishPath: .` +
`buildCommand: ""` + a **mandatory** `buildFilter.paths` (without it, editing one guide rebuilds
every site). A new guide needs a service there and a row in the root `README.md` table.

The folder is published as-is, so `README.md`, `DESIGN.md`, `TODO.md` and `font-explore.html` ship
with the site. Never put anything sensitive in a guide folder.

The pre-publication checklist (OG tags, 1200×627 preview, Post Inspector) is `CONTRIBUTING.md` §6.
Both guides are currently undeployed and **have no OG tags** - that is the publishing blocker.

## Commits and safety

- One logical change per commit. English message, imperative subject, body explaining why rather
  than listing files. Do not mix a content edit with a styling rework.
- **Do not push unless explicitly asked.** Unpushed commits in this repo are normal.
- Internal technical briefs (`*_visualization.md`, `*_brief.md`) are gitignored: they contain
  private repository links and cluster names. **Never commit or publish them**, even when the edit
  looks harmless. Their reasoning has been migrated into the READMEs and `DESIGN.md` files.
- `envoy-gateway-visualization/.mcp.json` wires up the Render MCP server and takes its key from an
  externally set `RENDER_API_KEY`. The key must never land in the repo. That config is only picked
  up when the cwd is that folder.
