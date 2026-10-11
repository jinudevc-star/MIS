MIS Dashboard

`facilities-mis-dashboard.html` is the Facilities MIS Command Deck for AKESI Schools and Aga Khan Academy Hyderabad. It is self-contained: open it in a browser. The live copy is the claude.ai artifact https://claude.ai/artifact/R7ZuiMxD8bGfRuhSL12kZT.

## Asset Register tab

When the Aga Khan Academy workbook is selected, the **Assets** tab shows campus asset status from the AKAH_SOP_Server asset register (https://claude.ai/artifact/N4qdSGMjaYhGBB1UaYaDoT). That is the same 48-asset register the AssetTrack QR Android app (jinudevc-star/Agakhan-Academies) uses. Asset IDs link to each asset's sheet in the register.

On claude.ai, the tab reads the `register/current` document in the dashboard's database. A sync copies the asset register into that document. When the database is unavailable, for example in this file opened locally, the tab shows the snapshot built into the page and the time it was taken.
