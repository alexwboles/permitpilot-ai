# REDESIGN-AUDIT — permitpilot-ai (2026-10-13)

Permit requirement checker + application tracker for contractors/homeowners.
Feature-rich already: permit assessment, status pipeline, deadlines, inspections,
payments, fee estimates, cover-note drafts, CSV/print. Identity on arrival:
"building-dept dossier" (FILE tabs, Form PP-01, seal) — decent, but the page
reads as a long scrolling form, not construction software.

## Competitors referenced
- **Procore** — left sidebar is the construction-software standard; project
  dashboards with at-a-glance status; **daily logs** (notes, calls, inspections,
  delays, deliveries) as the field record; document control.
- **Buildertrend** — project dashboards (jobs, deadlines, budgets at a glance);
  document vault; daily logs; schedule views; warm but utilitarian design.

## Gaps found (visual / functional / flow)

### Functional
1. **No project log / journal.** Procore's daily log is the signature field
   record — dated entries for inspector calls, site observations, delays.
   Nothing here captures what happened on the job over time.
2. **No project switcher rail.** Switching projects means a dropdown in File 1;
   Procore/Buildertrend keep a persistent project rail.

### Visual
3. Long single-column scroll of dossier cards — no persistent navigation, no
   project context while working in File 3/4.
4. Dossier identity is good but flat: FILE tabs all look the same, permit cards
   don't read as documents, no jobsite texture.
5. Status pipeline exists in logic (STATUS_STEPS) — needs to look like a real
   approval pipeline, not a generic stepper.

### Flow
6. The check → track flow works; keep. Adding a site log gives the "track every
   application to approval" promise a place to record the messy middle.

## Redesign plan
- **Identity: "The job trailer office."** Ink-navy sidebar (#1c2733) with a
  persistent project rail (Procore standard), warm paper workspace, safety-orange
  accent (#d95d1e), subtle blueprint-grid texture on headers.
- **Sidebar**: brand + seal, project rail (click to switch active project,
  per-project permit progress), "+ New project" shortcut, local pill.
- **Site log** (new, "File 5"): per-project dated entries (note / inspector call /
  delay / delivery), newest first, deletable, printed in the report. Backfilled
  on load for older saves.
- **Permit cards as stamped documents**: status rendered as stamp-style badges
  (APPLIED / APPROVED / etc.), blueprint-ruled card headers.
- Preserve: all existing features (assessment, deadlines, inspections, payments,
  fees, cover note, CSV, print), disclaimer banners, local-only storage.

## Non-goals
- Multi-user / cloud sync (local-first is the product's promise).
- True Gantt scheduling (Buildertrend power feature; out of scope).
