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

## Keep the process docs current

**Any process fact discovered while deploying, publishing, or reviewing must land in `CLAUDE.md`
or the relevant skill in `.claude/skills/` - in the same commit as the work that revealed it.**
Not in a chat reply, not only in the guide's `TODO.md`. If a step was missing, wrong, or in the
wrong order, fix the document that told you to do it that way.

What counts: a prerequisite nobody wrote down (a key, a push, a DNS record), an order dependency
that turned out to matter, a command that does not do what the doc claims, a count or path that
drifted, a manual step that could be checked mechanically.

Where it goes: repo-wide facts and invariants → `CLAUDE.md`. Step order and per-stage procedure →
the skill (`new-guide`, `guide-review`, `publish-guide`). Content rules → `DESIGN.md`. Checklists →
`CONTRIBUTING.md`. When unsure, prefer the skill: it is read at the moment the step is executed.

Why this is a rule and not a nicety: this series has already watched documentation rot away from
reality - a ban on a font removed long before was still in a `DESIGN.md`, and both guide READMEs
miscounted their own cache-bust sites. A process fact learned and not written down will be
rediscovered the hard way, and the next agent has no memory of this session.

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
- **Console must be clean.** `favicon.ico 404` was the tolerated exception;
  `envoy-gateway-visualization` now ships a favicon, so its bar is zero errors. tempo still 404s.
- **The data globals are `const`, so they are not on `window`.** Reaching them from an injected
  script or a Playwright `evaluate` needs the bare identifier (`PANELS`, `STEPS`, `MATRIX`), not
  `window.PANELS` - which is `undefined` and throws on property access.

## Deployment

`render.yaml` is the blueprint, one service per guide: `rootDir` + `staticPublishPath: .` +
`buildCommand: ""` + a **mandatory** `buildFilter.paths` (without it, editing one guide rebuilds
every site). A new guide needs a service there and a row in the root `README.md` table.

The folder is published as-is, so `README.md`, `DESIGN.md`, `TODO.md` and `font-explore.html` ship
with the site as reachable URLs. Never put anything sensitive in a guide folder - that is why
`.mcp.json` lives at the repo root, which is not a `rootDir` of any service and therefore never
served.

**Render builds from GitHub, not from the working tree** - a local commit is invisible to it. Since
this repo routinely carries unpushed commits and pushing needs to be asked for, publishing is the
one workflow where a push is part of the job. Raise it early.

The pre-publication checklist (OG tags, 1200×627 preview, Post Inspector) is `CONTRIBUTING.md` §6;
the step-by-step is the `publish-guide` skill. Both guides are live:
`envoy-gateway-guide.onrender.com` (OG tags, `og-preview.png`, favicon - Post Inspector not yet
run) and `traces-tempo-guide.onrender.com`. **`traces-tempo` is live but unannounced** - it has no
OG tags and still 404s on favicon, so nothing should link to it until it gets both.

Blueprint services must be created **through the dashboard**, not the Render MCP:
`create_static_site` accepts neither `rootDir` nor `buildFilter`, so a service made that way is not
blueprint-managed and `render.yaml` silently becomes fiction. Dashboard → New Blueprint Instance
reads `render.yaml` and creates every service in it at once. The MCP tools are for verifying
afterwards (`list_services`, `list_deploys`) - and they need an explicit `workspaceId`: this
account has two workspaces and the guides live in `Workspace1` (`tea-d9q95s61egvs73dhsad0`).

An `onrender.com` host that 404s is **not** proof the name is free - Render answers its whole
wildcard domain. Nothing reserves a subdomain until the service exists.

## Commits and safety

- One logical change per commit. Do not mix a content edit with a styling rework.
- **The whole message is English, including the body** - subject and body both. Early commits in
  this repo have Russian bodies; do not take them as the pattern. Only guide content and prose docs
  are Russian.
- **Keep it to a couple of lines.** Imperative subject under ~70 characters, then at most two or
  three lines of body saying why. A commit whose body runs longer than the diff is a sign the
  reasoning belongs in a doc - put it there and reference it instead.
- The body explains why, not what. Never list the changed files: `git show --stat` already does.
- Omit the body entirely when the subject says everything. A mechanical edit needs no essay.
- **Do not push unless explicitly asked.** Unpushed commits in this repo are normal.
- Internal technical briefs (`*_visualization.md`, `*_brief.md`) are gitignored: they contain
  private repository links and cluster names. **Never commit or publish them**, even when the edit
  looks harmless. Their reasoning has been migrated into the READMEs and `DESIGN.md` files.
- `.mcp.json` at the repo root wires up the Render MCP server and takes its key from an externally
  set `RENDER_API_KEY`. The key must never land in the repo. Two consequences of it being at the
  root: it applies to work on any guide, and it is not inside a published `rootDir`. It is picked up
  when a session starts with the repo root in scope - `export`ing the key mid-session does nothing,
  the session has to be restarted.
