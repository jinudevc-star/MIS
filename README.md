# MIS Dashboard

A browser app that combines the two FM MIS workbooks in one dashboard. A **Workbook** drop-down switches between them:

| Workbook | File |
|---|---|
| AKESI Schools | `data/AKS-MIS-DATA-2026_CJ_Dashboard.xlsx` |
| Aga Khan Academy, Hyderabad | `data/Aga_HYD_MIS_2026_CJ_Dashboard.xlsx` |

## Use it

The dashboard sits over a live 3D campus. Each school or facility is a block whose height follows the selected metric. The motion matches the subject: current on overhead lines for energy, a rippling reservoir and pipe flow for water, sunlight for solar, rising air for HVAC. The camera eases to the selected school or facility. Motion stops when the system's reduce-motion setting is on.

Open `app/index.html` in a browser. It needs internet access once to load the spreadsheet reader and charting library from a CDN.

- **Workbook / Month / School or Facility**: the yellow drop-downs. Month includes **2026 YTD**.
- **Key figures**: tiles compare with the previous month, Avg-2025 (AKA) or the 2026 monthly average (AKS), plus benchmarks and targets from MIS_Calc. Select a tile to chart it.
- **Trend and ranking charts**: select a bar to change the month or drill into a school or facility.
- **Scorecard**: select a row to drill in. Select a heading to sort.
- **Watchlist and data-quality findings**: the watchlist follows the selection. The findings are copied from each workbook's FM_Dashboard.
- **Sheets** tab: browse and filter every sheet of the selected workbook.
- **Add workbook…**: open an updated or extra `.xlsx` for the current session.

All figures are read from each workbook's `MIS_Calc` sheet, using the values saved when the file was last opened in Excel.

## Update the bundled data

1. Replace or add the `.xlsx` in `data/`. Open and save it in Excel first so the formula values are current.
2. Run `python3 tools/build_workbooks.py` to regenerate `app/workbooks.js`.

## Files

- `app/index.html`: the app
- `app/scene3d.js`: the 3D campus backdrop (three.js)
- `app/mis-engine.js`: reads both MIS_Calc layouts (school blocks and the campus fact table)
- `app/workbooks.js`: the bundled workbooks (generated)
- `tools/build_workbooks.py`: regenerates `workbooks.js`
