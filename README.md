# 📋 PermitPilot AI

**Which permits does your project need?** Contractors and homeowners start work every day without realizing a permit was required — then pay stop-work orders, fines, and tear-outs. PermitPilot AI checks your job type and location type against a local permit rule bank, explains each permit in plain language, and tracks every application from *Not started → Applied → Approved* with document checklists, fee estimates, and expiry reminders.

> **Disclaimer: General guidance only — not legal advice.** Permit rules vary by city/county. Always verify with your local building department.

## Features

1. **Permit checker** — pick a job type (12 options: kitchen remodel, room addition, new deck, roof replacement, …) and a location type (residential, commercial, rural/agricultural, historic district, floodplain/wetland-adjacent). Get every permit marked **Likely needed / Possibly needed / Probably not** with a plain-language reason.
2. **Document checklists** — per-permit document lists (site plan, drawings, contractor license, insurance cert, HOA approval, load calcs, …) with persistent check-offs.
3. **Application pipeline** — Not started → Applied → Approved per permit, with dates recorded, plus overall project progress.
4. **Fee estimates** — editable low/high fee per permit with live project totals.
5. **Renewal / expiry reminders** — set an expiry date per permit; the dashboard flags **expired (red)** and **due within 30 days (amber)** with plain-language "expires in X days".
6. **Multiple saved projects** — create, load, and delete projects; everything persists in `localStorage`.
7. **Sample project** — one click loads a demo kitchen remodel with realistic progress.
8. **Optional AI cover note** — bring your own OpenAI key (stored in the browser only) to draft a permit-application cover note. Fully optional; a solid local draft is generated without any key.
9. **Print-friendly** — print the page to get a clean paper checklist of permits and documents.

## Run it

No build step. No dependencies. Just open `index.html` in a browser — or serve it:

```bash
cd permitpilot-ai
python3 -m http.server 8080
# open http://localhost:8080
```

All data (projects, check-offs, statuses, fees, your optional API key) lives in `localStorage`. Nothing leaves your device except the optional OpenAI cover-note request, which you trigger explicitly.

## How it works

- `js/permits.js` — pure permit logic: 12 job types, 5 location types, 14 permit definitions, the check engine, document bank, fee math, expiry math, and status-pipeline helpers. Shared by the browser and the tests (Node-loadable via `globalThis.PP`, zero DOM access at load).
- `js/app.js` — UI: projects, permit cards, pipeline stepper, document checklists, fee editing, expiry alerts, cover-note drafting.
- `css/style.css` — clean light theme, mobile-friendly, print stylesheet.

## Tests

```bash
bash test/smoke.sh   # 13 checks: files, syntax, rule-bank sanity, disclaimers
bash test/e2e.sh     # 7 end-to-end flows via Node through the real logic
```

## Disclaimer

**General guidance only — not legal advice.** Permit rules vary by city/county. Always verify with your local building department. PermitPilot AI is a planning aid, not a substitute for your city's building department or a licensed professional.

## License

MIT — built free, no paid services.
