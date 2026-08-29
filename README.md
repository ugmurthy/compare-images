# Compare Sketch ✏️

A web application for aligning and comparing two similar pencil/charcoal sketch photographs, detecting minor changes between them.

## Features

- **Image Upload**: Drag-and-drop or browse for two sketch images (reference and source)
- **Auto-Alignment**: Uses OpenCV.js ORB feature matching + RANSAC homography to align images
- **Grid Anchor Detection**: Detects grid intersection points at the 4 corners of the sketch as alignment anchors
- **Comparison Views**:
  - Side-by-side: reference vs aligned source
  - Overlay: blend aligned source on top of reference with adjustable opacity
  - Difference: thresholded pixel difference highlighting changes

## Tech Stack

- **Svelte 5** (runes syntax)
- **OpenCV.js 4.11** (loaded from CDN)
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
2. Click "Load OpenCV.js" to initialize the computer vision library
3. Click "Align & Compare" to:
   - Detect grid anchor points on the reference image (4 corners)
   - Use ORB feature detection + BF matching + Lowe's ratio test
   - Compute homography with RANSAC
   - Warp source image to align with reference
   - Compute pixel-level differences with adaptive thresholding
4. Switch between Side-by-Side, Overlay, and Difference view modes

## MVP Limitations

- OpenCV.js is loaded from CDN (~8MB, may be slow on first load)
- Processing is synchronous on the main thread (may block UI for large images)
- Grid detection works best with clear, high-contrast grid lines
- No undo/redo or save functionality yet
