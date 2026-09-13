# Professionalization pass 1.3

## Implemented

- Rebuilt the application header hierarchy with a real page title and subtitle.
- Corrected the conflicting tablet/mobile header rules that forced an unintended stacked layout.
- Hardened the mobile sidebar with safe-area support, body scroll locking, Escape handling and an accessible close overlay.
- Converted sidebar navigation items from clickable `div` elements to semantic buttons.
- Made the notifications panel responsive and usable on narrow screens.
- Added consistent keyboard focus states and 44 px touch targets for primary mobile controls.
- Prevented hover-only transforms from sticking on touch devices.
- Changed mobile modals into bottom sheets with viewport-safe height and internal scrolling.
- Added safe-area padding for devices with notches and home indicators.
- Prevented iOS form zoom by using 16 px form controls on mobile.
- Added a maximum application content width for very large monitors.
- Defined missing CSS variables (`--card-bg`, `--primary-rgb`, `--primary-900-rgb`) that invalidated some visual declarations.
- Added reduced-motion support.

## Structural risks still present

- `src/App.tsx` remains a monolith and should be split by route and feature.
- The application still contains hundreds of inline style objects, which weakens consistency and responsive control.
- Several global selectors are declared multiple times; a future pass should migrate them into layered feature stylesheets or CSS Modules.
- Full visual regression testing should be added at 360, 390, 768, 1024, 1366 and 1920 px.
