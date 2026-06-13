# Cape Town Flood-Events Database - Web GIS Prototype v4

This version adds public-facing website sections before the data explorer:

- About / background
- Study objectives
- Classification framework table
- Methodology tabs for SAWS, News articles, FloodList, EM-DAT and Service requests
- Limitations and responsible use
- Interactive map and filtered data download

## How to run locally

Do not open `index.html` directly as a file, because Chrome may block the JSON data.

1. Open the folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html`.
4. Select **Open with Live Server**.

The browser URL should start with `http://127.0.0.1` or `http://localhost`.

## Main files to edit

- `index.html` - website wording, sections, headings and layout
- `assets/style.css` - colours, spacing, cards and visual design
- `assets/app.js` - map, filtering, charts, methodology tabs and download logic
- `data/events.json` - flood event records
- `data/impact_categories.json` - impact classification table
- `data/sp_areas.geojson` - small place boundaries
- `data/mp_areas.geojson` - main place boundaries
- `data/municipality_areas.geojson` - municipality boundary
- `assets/doc_images/` - workflow figures extracted from your methodology document

## Suggested publication structure

- Archive the cleaned dataset and documentation on ZivaHub for DOI/citation.
- Host this web explorer through CASCADE, GitHub Pages or Netlify.
- Link both the ZivaHub dataset and the web explorer from the CASCADE project page.
