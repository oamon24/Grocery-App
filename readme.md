# Kaufland PWA — Modular Refactor Scaffold

This scaffold mirrors the planned split of your monolithic index.html.
Move code into the matching files. Keep module boundaries clean.

## Load Order (modules)
See `scripts/main.js` as the entry point. Suggested import order:
- scripts/firebase.js
- scripts/utils/*.js
- scripts/dataSync.js, scripts/auth.js, scripts/photo.js
- scripts/ui/*, scripts/modals/*, scripts/recipes/*, scripts/cook/*, scripts/timers/*

## CSS
Move `<style>` blocks from index.html into files under /css in logical chunks.

## Assets
Place `alarm.mp3` and SVG sprite in /assets.
