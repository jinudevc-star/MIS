# MIS Dashboard

**Facilities MIS Command Deck**: one app for both FM MIS workbooks, built in the same design as the *Facilities MIS Dashboard* artifact. It has a dark control-room deck, a live 3D stage, glass instrument panels, and a dock of modules with a sweep transition between them.

| Workbook | File |
|---|---|
| AKESI Schools | `data/AKS-MIS-DATA-2026_CJ_Dashboard.xlsx` |
| Aga Khan Academy, Hyderabad | `data/Aga_HYD_MIS_2026_CJ_Dashboard.xlsx` |

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

## Files

- `app/index.html`: page, styles and layout
- `app/deck.js`: modules, charts, controller, sheet viewer
- `app/stage3d.js`: the 3D stage (three.js r128)
- `app/mis-engine.js`: reads both MIS_Calc layouts
- `app/workbooks.js`: bundled workbooks (generated)
- `tools/build_workbooks.py`: regenerates `workbooks.js`
