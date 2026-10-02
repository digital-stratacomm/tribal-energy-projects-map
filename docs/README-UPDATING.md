# Tribal Energy Projects Map (build-free version)

This folder is the live site, served by GitHub Pages (Settings > Pages > branch `master`, folder `/docs`).
No Node, npm, or Gulp needed. Edit a file, commit, and GitHub Pages republishes in ~1 minute.

## Updating project data
Edit the Google Sheet (tab must be named `Data`). Changes appear on the next page load.
Required columns: Project, Link, Tribe, State, Year, Assistance Type, Technology, Category, Latitude, Longitude.

## Changing keys or the sheet
Edit `js/config.js` only.

## Adding a column to the table
1. Add the column to the sheet first (exact header text).
2. Add the same header text to `dataHeaders` near the top of `js/app.js`.
