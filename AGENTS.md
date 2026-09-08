# Repository Guidelines

## Project Overview

Compare Sketch is a browser-only Svelte 5 application for aligning and comparing two sketch photographs. It uses a self-hosted OpenCV.js build for image alignment and a Web Worker for difference processing.

## Development Commands

- Install dependencies: `bun install`
- Start the development server: `bun run dev`
- Create a production build: `bun run build`
- Preview the production build: `bun run preview`

There are currently no dedicated test, lint, or format scripts. Do not claim those checks ran unless the scripts are added first.

## Code Layout

- `src/App.svelte`: application state and top-level comparison workflow
- `src/components/`: upload, mode selection, anchor editing, and comparison UI
- `src/lib/opencv.ts`: promise-based OpenCV loading and image-alignment API
- `src/lib/manualAnchors.ts`: manual anchor types and utilities
- `src/lib/difference.ts`: main-thread interface to difference processing
- `src/lib/difference.worker.ts`: pixel-difference processing off the UI thread
- `public/vendor/opencv-4.9.0.js`: pinned third-party OpenCV browser bundle

## Implementation Conventions

- Use TypeScript and preserve strict type checking.
- Follow the existing style: two-space indentation, single quotes in TypeScript, and semicolons.
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, and `$props`) rather than legacy reactive syntax for new code.
- Keep browser and canvas ownership explicit. Revoke replaced object URLs, cancel animation frames, terminate workers, and delete temporary OpenCV `Mat` objects.
- Keep OpenCV's public API promise-based so its implementation can later move behind a worker or service boundary without changing component call sites.
- Keep CPU-heavy pixel processing out of the UI thread when practical. Preserve transferable-buffer usage in the difference worker.
- Do not edit `public/vendor/opencv-4.9.0.js` unless the task explicitly requires replacing or patching the vendored OpenCV build.
- Make focused changes and reuse the existing component and library boundaries. Avoid adding dependencies for behavior supported by browser APIs or the current stack.

## Verification

- Run `bun run build` after code changes; it is the current type/compiler and production-bundle check.
- For UI changes, run the app and inspect the affected state in a browser at desktop and narrow viewport widths.
- Exercise the relevant workflow, not only the initial upload screen. Depending on the change, verify image selection, source rotation, mode switching, manual anchors, auto-alignment, overlay controls, and difference rendering.
- OpenCV initialization can take time because the self-hosted bundle is large. Distinguish an initialization failure from an alignment failure when debugging.

## Scope Notes

- The application intentionally runs OpenCV alignment on the main thread; do not move it to a worker using the current prebuilt bundle without first resolving the worker-bootstrap limitation described in `README.md`.
- Preserve accessibility attributes and keyboard behavior when changing controls or anchor editing.
