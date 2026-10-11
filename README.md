# MIS Dashboard

Single-file apps in this repository. The two in `dist/` open with no internet, server or login:

| File | App |
|---|---|
| `dist/Facilities_MIS_Dashboard.html` | **Facilities MIS Command Deck**: both MIS workbooks with a 3D stage |
| `dist/SOP_Maintenance_App.html` | **SOP Maintenance App**: built from *SOP & Maintenance App Wireframes* |
| `facilities-mis-dashboard.html` | **Facilities MIS Command Deck with Asset Register tab** (added in jinudevc-star/MIS#2, see below) |

Rebuild both with `python3 tools/build_standalone.py`. Fonts and libraries are embedded (`app/vendor/`), and each build checks that the page makes no network request.

## SOP Maintenance App

Source: `sop/index.html` and `sop/app.js`.

- **PM Overview**: status cards (Total, Overdue, Due soon, PM OK, Not checked, Compliance) filter the table, plus System, Criticality and search filters, an attention banner, and a PM status table sorted by next due with paging.
- **Asset Cards**: the asset directory grid with the same filters.
- **Asset Detail**: summary (location, responsible, last check, next PM, days to PM), with tabs for Operator Checks, PPM Tasks, Limits and Standards, check history and **Record check**.
- **Record operator check** (mobile form): Pass, Fail or N/A per check, notes (required when a check fails), an optional photo (resized), and validation.
  - Saving a check where nothing failed moves the next PM date on.
  - If saving fails, the answers are kept and the reason is shown.
- **Check Records**: every saved check, with export to Excel.
- **Data**:
  - Import the asset register from `.xlsx` or `.csv`. A template with instructions is provided.
  - Switch back to demo data, export records, or clear records.
  - Choose light, dark or follow-device appearance.

The app opens on **illustrative demo assets**, labelled *Demo data*. Their counts match the wireframe: 120 assets, 12 overdue, 8 due soon, 92 PM OK, 8 not checked, 76.7% compliance. The live register sits in the Power BI dataset behind `SOP (1).pbix`, which isn't included, so import an export of it to work with real assets. Check results, notes and photos are stored in that browser on that device. Export them to share.

---

## Facilities MIS Command Deck

**Facilities MIS Command Deck**: one app for both FM MIS workbooks, built in the same design as the *Facilities MIS Dashboard* artifact. It has a dark control-room deck, a live 3D stage, glass instrument panels, and a dock of modules with a sweep transition between them.

| Workbook | File |
|---|---|
| AKESI Schools | `data/AKS-MIS-DATA-2026_CJ_Dashboard.xlsx` |
| Aga Khan Academy, Hyderabad | `data/Aga_HYD_MIS_2026_CJ_Dashboard.xlsx` |

## Open it on any device

**`dist/Facilities_MIS_Dashboard.html`** is one self-contained file (about 2.5 MB). The 3D library, spreadsheet reader, app and both workbooks are all inside it. Copy it to a phone, tablet, laptop, USB drive or shared folder, or attach it to an email or WhatsApp message, and open it in any modern browser. It works offline and needs no server or login. Rebuild it with `python3 tools/build_standalone.py` after updating the data.

## Use it

Open `app/index.html` in a browser. It needs internet access to load three.js, the spreadsheet reader and the fonts from their CDNs.

- **Top bar**: *Workbook*, *Reporting period* (each month or full year to date) and *School* / *Facility* selectors, a live badge, the IST clock, **Sheets** (browse and filter every sheet), **+** (add another `.xlsx` for this session), **Present** (auto-advances the modules every 15 s) and full screen.
- **Modules** (dock at the bottom):
  - AKESI: Overview, Electricity, Solar, Water, Repairs, Generators, Schools, AMC & Tests.
  - AKA: Overview, Water, Electricity, Solar, HVAC, Diesel sets, Service desk, Team, Facilities.
- **3D stage**: each module has its own scene, including water treatment, a transformer with arcs to the loads, a solar array with a moving sun, a genset, cooling towers, a service-desk ticket ring, the team muster ring and paired meter stacks. Block heights follow the selected period, and the selected school or facility is lit and labelled.
- **Drill in**: select a ranking bar or a scorecard row to filter the whole deck to that school or facility. Select a month column in any chart to jump to that month.
- **Keys**: ← → change module, ↑ ↓ change period, A presents, F goes full screen, S opens Sheets, Esc closes Sheets.

Every figure is read from the workbook's `MIS_Calc` sheet, using the values saved when it was last opened in Excel. The "Live telemetry" sparklines are modelled from the period totals, as the panel itself says.

## Update the bundled data

1. Replace or add the `.xlsx` in `data/`. Open and save it in Excel first so formula values are current.
2. Run `python3 tools/build_workbooks.py` to regenerate `app/workbooks.js`.
3. Run `python3 tools/build_standalone.py` to rebuild the single file.

## Files

- `app/index.html`: page, styles and layout
- `app/deck.js`: modules, charts, controller, sheet viewer
- `app/stage3d.js`: the 3D stage (three.js r128)
- `app/mis-engine.js`: reads both MIS_Calc layouts
- `app/workbooks.js`: bundled workbooks (generated)
- `tools/build_workbooks.py`: regenerates `workbooks.js`
- `tools/build_standalone.py`: builds the single-file `dist/Facilities_MIS_Dashboard.html`
- `app/vendor/`: three.js r128 and SheetJS 0.18.5, inlined into the single file

---

## Facilities MIS Command Deck with Asset Register (`facilities-mis-dashboard.html`)

`facilities-mis-dashboard.html` is the Facilities MIS Command Deck for AKESI Schools and Aga Khan Academy Hyderabad. It is self-contained: open it in a browser. The live copy is the claude.ai artifact https://claude.ai/artifact/R7ZuiMxD8bGfRuhSL12kZT.

### Asset Register tab

When the Aga Khan Academy workbook is selected, the **Assets** tab shows campus asset status from the AKAH_SOP_Server asset register (https://claude.ai/artifact/N4qdSGMjaYhGBB1UaYaDoT). That is the same 48-asset register the AssetTrack QR Android app (jinudevc-star/Agakhan-Academies) uses. Asset IDs link to each asset's sheet in the register.

On claude.ai, the tab reads the `register/current` document in the dashboard's database. A sync copies the asset register into that document. When the database is unavailable, for example in this file opened locally, the tab shows the snapshot built into the page and the time it was taken.
