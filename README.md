# Compare Sketch ✏️

A web application for aligning and comparing two similar pencil/charcoal sketch photographs, detecting minor changes between them.

## Features

- **Image Upload**: Drag-and-drop or browse for two sketch images (reference and source)
- **Source Rotation**: Rotate the source clockwise in 90° steps before aligning
- **App navigation**: A top bar switches between **Compare**, **Measure** (enabled once a reference is loaded; measures the current part when opened from Compare parts), and **History**
- **Unified Comparison Workspace**: Switch between Originals, Auto align, and Manual align without leaving the images. Previously computed alignments are kept, so switching back is instant; **Edit anchors** reopens a manual alignment's points. A hint line under the toolbar suggests the next step
- **Adaptive crosshair cursor**: Point placement in Measure, Manual anchors, and part selection uses a drawn, open-centre crosshair whose centre is exactly the click point. Each arm and the centre ring independently turn black or white from the pixels beneath them (with hysteresis against paper grain), so the cursor stays visible across dark strokes and light paper without covering the target pixel
- **Precision magnifier**: A small 3× lens follows point placement and dragging in manual anchors, calibration, measurement, and part selection, including keyboard refinement. It shows the exact target with an open-centre crosshair, stays inside the viewport, and sits away from the point so a finger does not cover the enlarged detail. The magnifier switch beside the theme control turns it on/off for every marking tool and remembers the preference in this browser (on by default). Crosshairs and point placement still work when it is off. For new manual anchors, press, move to refine, then release to place the point; cancelling the gesture discards it
- **Auto-Alignment**: Uses OpenCV.js ORB feature matching + RANSAC homography to align images
- **Manual Anchors**: Add color-paired anchor points, drag or arrow-key nudge them, undo points, and use an adjustable linked or per-image visual grid
- **Grid Detection**: Detects grid intersections on the reference image as alignment diagnostics
- **Comparison Views**:
  - Side-by-side: reference vs aligned source
  - Overlay: blend aligned source on top of reference with adjustable opacity
- **Compare Parts**: After alignment, drag a rectangle on the reference in Side by side view, then click **Compare parts**. The dedicated page shows that region from the reference and aligned source, with icon buttons for stacked or side-by-side layouts. Back preserves your selection; changing the alignment clears it. Keyboard selection supports arrow keys, Shift for 10-pixel steps, Enter to mark each corner, and Escape to clear.
- **Measure Reference**: Use **Measure** on a full reference (even without a source or alignment) or from a part. Click two grid corners on the full reference to calibrate horizontal and/or vertical spans, optionally entering each span's size on paper and a unit. Calibration saves immediately in IndexedDB, keyed by reference image content, and is shared by every comparison and part of that reference. Redo replaces the single calibration; its endpoints can be dragged or arrow-key nudged. To measure, click once to anchor Point 1, then move the cursor for live horizontal/vertical percentages and optional paper-unit distances along a single dashed guide. Every subsequent click replaces Point 1 and starts a new measurement, rather than fixing a second point. Hold Shift to temporarily hide the moving cursor, guide, on-image distance labels and magnifier; release it to restore them without resetting their positions. The fixed anchor and sidebar readouts remain visible, and measurement continues while hidden. Arrow keys move the cursor, Enter anchors a new Point 1, and Tab to the anchor allows arrow-key refinement, with Shift for 10 pixels. Escape or **New** clears the anchor. Fit/2×/4× zoom does not change distances. Measurements are temporary and disappear when leaving the tool. This measures image-space proportions, not perspective-correct physical lengths.
- **History**: Save a timestamped alignment under a project, then save named parts and notes from the Parts view. A project can contain many comparisons sharing a reference filename. Reopen an entry with its saved images and alignment, or use the dashed **New comparison with this reference** tile in Comparisons to compare a new source against the saved reference. Images and metadata stay in this browser's IndexedDB. Identical reference files are stored only once, matched by SHA-256 content hash; source files remain stored per entry. Existing history automatically migrates to shared reference storage, and a reference is removed only when no entries use it. Exports retain the self-contained format with both images in each entry.
- **Aligned Source Download**: In History, select a project and use the download icon beside **Comparisons**. Its saved source rotations and alignments are applied, then up to 99 lossless PNGs are automatically downloaded in one compressed ZIP. Photos are sorted newest first by EXIF `DateTimeOriginal`, including timezone offsets and subseconds when present, not by comparison-save or file-modification date. Names use the project name (with unsafe filename characters replaced by underscores) followed by `_01` through `_99` before `.png`, for example `Capture Study_01.png`. Entries beyond 99 are ignored. Photos without readable capture metadata are placed last, ordered by source filename, and reported in the completion notice. EXIF dates without an offset use the browser's local timezone. Browser settings may prompt for a download location. This does not change saved source images or the existing full-data JSON export.

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

## Amp Orbs

`.agents/setup` uses Bun and Node from Amp's base image and installs dependencies
with `bun install --frozen-lockfile`. Amp snapshots the prepared environment so
fresh orbs can reuse it; a warm setup checks the lockfile without reinstalling
unchanged dependencies. No secrets, databases, or additional system packages are
required. `.agents/resume` only checks readiness and never installs dependencies.

Start the supervised development server and get its authenticated portal URL:

```bash
amp orb services ensure
```

The service in `.amp/services.yaml` survives pause/resume. Vite accepts portal
hostnames only inside an orb. Generated `.amp/portals/` files are Git-ignored.
Run `bun run build` to verify the production bundle; there is no dedicated test
or lint script.

## How It Works

1. Load two sketch photographs (reference and source with changes)
2. Choose one comparison method in the shared workspace:
   - **Visual** shows the untouched originals side by side
   - **Manual anchors** uses 4+ complete matching point pairs for homography
   - **Auto align** uses ORB feature detection, BF matching, Lowe's ratio test, and RANSAC
3. In Manual anchors, click matching locations, drag or nudge points to refine them, and optionally enable and position a visual grid
4. Apply the anchors or run automatic alignment to warp the source into the reference coordinate space
5. Inspect aligned results using Side-by-Side or Overlay, and save the comparison and selected parts if desired

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
- OpenCV alignment remains on the main thread with resolution-bounded feature detection
- Grid detection works best with clear, high-contrast grid lines
- Saved comparisons include both original image files, alignment, notes, and part previews in IndexedDB. Reopen from History without selecting files again; source rotations are reapplied before restoring alignment.
- Storage is local to this browser/profile and can be evicted or removed by clearing site data. The header shows estimated total site usage against the browser's quota (not an IndexedDB-only limit): green below 60%, amber at 60%, red at 80%. Estimates refresh after saving/deleting and when the window regains focus; some browsers do not provide estimates.
- Calibration remains available when the same reference file is selected again, even without a saved comparison. JSON history backups include calibration for references in saved comparisons; calibration-only references are not included. Import restores missing calibrations but keeps an existing local calibration. Measurements are never included in backups.
- History's **Export all** downloads a versioned JSON file containing base64-encoded original images and all saved metadata. Use **Import** next to it to restore a version-2 JSON backup. Existing projects (name and reference filename), entries (ID), and parts (ID within an entry) are kept, not replaced; new entries join existing projects and missing parts are appended to existing entries. A completion summary reports imported and already-existing project, entry, and part counts. Invalid backups are rejected before any data is written. Export does not delete data.
- The version-2 database resets old metadata-only history without migration. Saving multiple comparisons currently stores a separate copy of their images in each entry.
