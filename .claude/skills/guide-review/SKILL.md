---
name: guide-review
description: Verify a visual guide after edits - run the token check and self-test, drive the browser through every cross-section, check overflow and mobile, then report what actually passed. Use before committing guide changes, when the user asks to check or review a guide, or when finishing work on one.
---

# Reviewing a guide

Authoritative checklists: the guide's own `README.md` → «Проверка после правок» (per-guide, the
specific clicks) and `CONTRIBUTING.md` §6 (pre-publication). Read them; this skill is the order of
operations and the failure modes worth hunting.

## 1. Mechanical checks first

```bash
node tools/check-tokens.mjs <guide>          # exit 1 on drift
```

Then serve and open with `?selftest=1`:

```bash
cd <guide> && python3 -m http.server
```

- `traces-tempo` must report **36/36 passed**. Fewer means a regression, not a flaky check.
- `envoy-gateway-visualization` has no self-test (`CONTRIBUTING.md` §5 violation). Do not report it
  as passing. Instead check its two ID contracts by hand - every `data-node` in `layers/*.html`
  resolves in `PANELS`, every `data-f` resolves in `manifest.fields` - and say in the report that
  this was manual.

A grep-based contract check is a legitimate substitute for a missing self-test; pretending the
contract is fine because the page looked normal is not. A broken `data-node` is invisible until
someone clicks that exact node.

## 2. Browser pass

Use Playwright MCP. Console must be clean - `favicon.ico 404` is the only acceptable error.

Walk the guide's README checklist literally; it lists the interactions that have broken before.
Beyond it, always:

- Every cross-section renders. A layer nobody clicked is a layer nobody tested.
- Click→panel on several nodes, including one you just edited.
- Deep link: open `#<layer>/<node>` **as a fresh navigation**, not by clicking. It must restore
  layer and selection. This is the path a reader arrives by from a post.
- Hover the selected control. `:hover` must not override `[aria-selected="true"]` - this exact bug
  has shipped before (`traces-tempo/DESIGN.md` §3.13).
- Interactive numbers: move a slider and confirm labels change coherently and do not jitter
  horizontally (that means `tabular-nums` was lost).

## 3. Text overflow - the trap that hides

SVG does not wrap. Do not judge by eye; measure in the page:

```js
[...document.querySelectorAll('svg text')]
  .filter(t => t.getComputedTextLength() > /* its box width */ 0)
```

In practice: compare each label's `getComputedTextLength()` against its node `rect` width, and
check nothing exceeds the `viewBox`. tempo automates this; for envoy do it explicitly after any
label, font, or size change.

## 4. Responsive

Check at **1400px and 380px**. Required: no horizontal scroll on the *page*, wide diagrams scroll
inside their own wrapper, the side panel moves below, nothing clipped. Take screenshots at both -
they are gitignored, so do not commit them.

## 5. Content pass - the part no script can do

- **Does it read without the author?** Walk every cross-section looking for a place that needs
  outside knowledge not explained on the page. The guide gets published where there is nobody to
  ask. This is the check most worth your time and the one most often skipped.
- Versions in the masthead eyebrow match the version claims in the content. They have contradicted
  each other before - the footer once said "не привязан к версии" while the header named two.
- The educational disclaimer sits where people look, not only in the footer.
- Colour legend covers every role actually used. An undocumented colour is a cipher.

## 6. Report

State separately: what passed mechanically, what you verified in the browser, what you checked by
hand because automation is missing, and **what you did not check**. If the self-test is absent or a
step was skipped, say so plainly - a review that reads as "all good" when a whole class of check
never ran is worse than no review.

Before committing, remind the user of the `?v=N` bump if CSS/JS/layers changed
(`grep -n '?v=' index.html` for the exact places).
