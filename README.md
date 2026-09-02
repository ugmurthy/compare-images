# Compare Sketch ✏️

A web application for aligning and comparing two similar pencil/charcoal sketch photographs, detecting minor changes between them.

## Features

- **Image Upload**: Drag-and-drop or browse for two sketch images (reference and source)
- **Unified Comparison Workspace**: Switch between original visual comparison, manual anchor alignment, and automatic alignment without leaving the images
- **Auto-Alignment**: Uses OpenCV.js ORB feature matching + RANSAC homography to align images
- **Manual Anchors**: Add color-paired anchor points, drag or arrow-key nudge them, undo points, and use an adjustable linked or per-image visual grid
- **Grid Detection**: Detects grid intersections on the reference image as alignment diagnostics
- **Comparison Views**:
  - Side-by-side: reference vs aligned source
  - Overlay: blend aligned source on top of reference with adjustable opacity
  - Difference: thresholded pixel difference highlighting changes

## Tech Stack

- **Svelte 5** (runes syntax)
- **OpenCV.js 4.9** (self-hosted from `public/vendor`)
- **Vite 8**
- **Bun** (package manager & runtime)

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## How It Works

1. Load two sketch photographs (reference and source with changes)
2. Choose one comparison method in the shared workspace:
   - **Visual** shows the untouched originals side by side
   - **Manual anchors** uses 4+ complete matching point pairs for homography
   - **Auto align** uses ORB feature detection, BF matching, Lowe's ratio test, and RANSAC
3. In Manual anchors, click matching locations, drag or nudge points to refine them, and optionally enable and position a visual grid
4. Apply the anchors or run automatic alignment to warp the source into the reference coordinate space
5. Inspect aligned results using Side-by-Side, Overlay, or Difference views

## OpenCV Architecture

OpenCV.js is served as a local, pinned browser asset at `public/vendor/opencv-4.9.0.js`.
This follows OpenCV's documented browser loading model: define
`Module.onRuntimeInitialized` before loading `opencv.js`, then run CV code after
`cv.Mat` is available.

I tested moving OpenCV into a Web Worker, which would be preferable for large
images, but the prebuilt OpenCV.js WASM bundle hangs during worker bootstrap in
this Vite app. The current implementation keeps a promise-based API boundary in
`src/lib/opencv.ts`, so the CV implementation can later move to a custom worker
build or backend service without changing the Svelte components.

## MVP Limitations

- OpenCV.js is self-hosted but still large (~10MB, cached after first load)
- Processing is synchronous on the main thread (may block UI for large images)
- Grid detection works best with clear, high-contrast grid lines
- No full history/redo or save functionality yet
