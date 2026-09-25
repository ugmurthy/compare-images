# Quiet Canvas — Compare Sketch Style Guide

This guide defines the look, feel, layout, and behavior of every Compare Sketch screen. It applies **Design Direction A** (image-first, controls hidden until requested) across the whole app. It changes presentation only; all existing functionality must remain reachable.

## 1. Principle

The page is a quiet sheet of paper. The sketches are the loudest thing on screen.

- **Art first.** No persistent bars, captions, or coordinates over or around the images.
- **Controls float.** Controls live in a few floating surfaces (title card, bottom dock, FAB, corner pills) and never cover the art. Transient popovers and menus are the only exception.
- **Hidden until requested.** Secondary actions live in the FAB menu or popovers, not in visible toolbars.
- **One accent.** Accent colour marks only the primary or active control on screen.
- **Hairlines, not boxes.** Structure comes from whitespace, 1px borders, and soft shadows, not heavy fills.

## 2. Design tokens

Define these as CSS custom properties on `:root` and use them everywhere; do not hard-code values in components.

### Colour

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5F3EE` | Page background (optional very faint grain, ≤3% opacity) |
| `--surface` | `#FFFFFF` | Cards, dock, pills, menus, image frames |
| `--surface-frost` | `rgba(255,255,255,0.72)` + `backdrop-filter: blur(8px)` | Identity chips, popovers over art |
| `--hairline` | `#E6E1D6` | 1px borders, dividers |
| `--dash` | `#D8D2C4` | Dashed drop-well borders |
| `--ink` | `#1E1F22` | Primary text, icons |
| `--ink-muted` | `#75726B` | Secondary text, counts, notes |
| `--accent` | `#3050D0` | Primary buttons, active/pressed state, links, FAB |
| `--accent-tint` | `rgba(48,80,208,0.10)` | Background of pressed icon buttons and selected rows |
| `--on-accent` | `#FFFFFF` | Text/icons on accent |
| `--ok` | `#22A447` | Status dot "ready", "Selected" check |
| `--danger` | `#C8412F` | Destructive icons (Clear all, delete) |
| `--tooltip` | `#1E1F22` bg, `#FFFFFF` text | Tooltips |
| `--scrim` | `rgba(30,31,34,0.32)` | Modal and bottom-sheet scrim only |

Anchor pair colours (muted and distinct; a pair shares one colour): terracotta `#C0583F`, sage `#6E8B4E`, ochre `#C8921A`, slate blue `#2F5FC4`, plum `#7E4FB0`. Then cycle.

### Typography

- **Display/title serif:** Newsreader (fallback `Georgia, serif`). Use it **only** for page headings, card titles, and the wordmark.
- **UI sans:** Inter (fallback `system-ui, sans-serif`). Use it for every control, label, body line, and number.
- Numbers in readouts (`50%`, `Part 2 of 4`, `24 px`) use `font-variant-numeric: tabular-nums`.

| Role | Font | Size / line | Weight |
|---|---|---|---|
| Page heading (Landing, History) | Serif | 44 / 52 | 500 |
| Title card title | Serif | 26 / 32 | 500 |
| Column/section heading | Serif | 20 / 28 | 500 |
| Wordmark | Serif | 20 / 28 | 500 |
| Body / menu row / button | Inter | 14 / 20 | 500 (rows), 600 (primary button) |
| Secondary / note / meta | Inter | 13 / 18 | 400, `--ink-muted` |
| Tag chip | Inter | 12 / 16 | 500 |
| Dock icon label (anchoring only) | Inter | 12 / 16 | 500 |

The title card note is always a single line: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.

### Shape, spacing, elevation

- Radius: cards, image frames, menus, and popovers use `14px`; list rows `10px`; dock, pills, buttons, and chips are fully rounded (`999px`); FAB is a circle.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48. Page edge margin is 24px on desktop and 16px below 720px.
- Shadow (one level only): `0 1px 2px rgba(30,31,34,0.04), 0 8px 24px rgba(30,31,34,0.06)`. The FAB uses a slightly stronger shadow: `0 6px 20px rgba(48,80,208,0.28)`.
- Every floating surface has a `1px solid var(--hairline)` border; the FAB and accent buttons have none.

### Icons

- Line icons, 1.5px stroke, round caps and joins, 20px glyph in a 40px hit area (dock: 44px). Use one consistent set, such as Lucide, drawn in `--ink`.
- Active state: icon turns `--accent` and the button gets an `--accent-tint` background.
- Icon-only buttons always have `aria-label` and a tooltip with the same text.

| Action | Icon |
|---|---|
| Side by side | two vertical panels (`columns-2`) |
| Stacked | two horizontal panels (`rows-2`) |
| Overlay | two overlapping squares (`copy`) |
| Rotate source 90° | circular arrow (`rotate-cw`) |
| Select region | dashed square with plus (`square-dashed` + plus) |
| Compare parts | two vertical panels |
| Save comparison | download tray (`download`) |
| Save part details | bookmark (`bookmark`) |
| Adjust region | crop (`crop`) |
| Run auto align | refresh (`refresh-cw`) |
| Edit manual anchors | connected nodes (`waypoints`) |
| View originals | picture (`image`) |
| New comparison | file with plus (`file-plus`) |
| History | clock (`clock`) |
| Back | left arrow (`arrow-left`) |
| Undo / Grid / Point list / Clear all | `undo-2` / `grid-3x3` / `list` / `trash-2` (danger colour) |
| Play / Stop | `play` / `square` |
| Identity chip | lowercase `i` in `--accent` |

## 3. Shared components

### Corner pills (fixed, top)

- **Top-left:** a ghost back control, a pill with a left arrow and a label (for example "← Whole image", "← Cancel anchors", "← Back to comparison"). On the root compare screen, the wordmark sits here instead.
- **Top-right:** "History" ghost pill (clock icon), then the runtime status pill (a coloured dot and text: "Loading OpenCV…", "OpenCV ready", or "OpenCV failed · Retry"). Keep both 40px tall and 24px from the edges.

### Title card (fixed, top centre)

- Centred, `max-width: 560px`, 24px from the top. Below 720px it becomes full width minus 32px.
- Row 1: serif title on the left and muted meta on the right (for example "Part 2 of 4", "Auto aligned", "5 anchors · 4 paired").
- Row 2: one clipped muted line (a note or hint).
- Content per screen: Compare Images shows the project name and entry note. Compare Parts shows the part name and part note. Anchoring shows "Place matching points" and the placement hint.

### Image frame

- White frame with 8px inner padding, 14px radius, hairline border, and shadow. The image fills the frame (`object-fit: contain`).
- No caption bar, no dimensions, no coordinates.
- **Identity chip:** 24px frosted circle 12px inside the upper-left of the image. It is focusable. On hover or focus, a dark tooltip appears to its right showing the filename; the source image's tooltip adds the rotation (for example "bracket-revb.jpg · rotated 90°"). In overlay mode it shows "reference + source".
- Side by side: two frames with a 16px gap. Stacked: frames one above the other. Overlay: a single frame.

### Bottom dock (fixed, bottom centre)

- A fully rounded white pill, 64px tall, 24px above the bottom plus `env(safe-area-inset-bottom)`, with its content centred.
- Groups are separated by 1px × 28px hairline dividers. Icon buttons are 44px, and the pressed button uses `aria-pressed="true"` with an accent tint.
- The dock grows or shrinks with its contents and never spans the full width.
- Reserve bottom padding on the page equal to the dock height plus its offset, so art is never hidden behind the dock when scrolled.

### FAB and action menu

- A 56px accent circle fixed in the right gutter and vertically centred; it never sits over the art. Below 720px it is 48px, placed bottom-right above the dock with safe-area spacing.
- Closed icon: a context-specific glyph (plus or ellipsis). Open icon: ✕.
- The menu is a white 14px card, about 260px wide, opening to the left of the FAB and vertically centred on it (upward on mobile). Rows are 40px with a 20px icon, 12px gap, and 14px Inter.
- The primary row (the most likely next action) uses accent text and an accent-tint background.
- Groups are separated by hairline dividers, with an optional 12px muted caption ("Alignment"). Unavailable actions are not removed but shown disabled (40% opacity, `aria-disabled`).
- There is no scrim. It closes on Esc, outside click, or after choosing an action. It uses `role="menu"` with `menuitem` children, arrow-key navigation, and returns focus to the FAB when it closes.

### Popover (e.g. Grid settings)

- A white 14px card attached to its dock button with a small caret. It may overlap the art because it is transient.
- Labelled sliders sit in rows (label 88px wide, slider, tabular readout on the right). Toggles are segmented pills.

### Modal / bottom sheet (save forms)

- Scrim `--scrim`; centred card about 480px wide; `role="dialog"`, `aria-modal`, labelled serif heading, focus trap, Esc to close, focus restored to the opener.
- Below 720px it becomes a bottom sheet with 14px top corners and safe-area bottom padding.
- Fields are stacked with 13px muted labels, 40px inputs, 10px radius, and hairline borders; focus shows a 2px accent ring.
- Actions sit bottom-right: a ghost "Cancel" and an accent primary button.

### Buttons

- **Primary:** accent fill, white 14px/600 text, 40px height (44px in the dock), fully rounded, optional leading icon. Disabled: accent at 45% opacity.
- **Ghost:** transparent (or white on paper) with a hairline border and ink text. Hover adds `--accent-tint`.
- **Text link:** accent text, no underline until hover.
- **Destructive:** icon in `--danger`; confirm before deleting.

### Tags and status

- Tag chip: `#EFEDE7` background, ink text, 12px, fully rounded (for example "Auto align", "Manual anchors").
- Status dot: an 8px circle in `--ok`, the accent, or `--danger`.

## 4. Screens

Mock references (desktop, 1600×1000):

- Landing: https://ampcode.com/user-content/attachments/b0b8460faf71f05d3f464591dab157a518960928bec573bd8b0a3e2224a20ebc-file.png
- Manual anchoring: https://ampcode.com/user-content/attachments/c8bfe3645ac049dcb41e3a6e3a2e19b1aa2d6dd6264de0474449dd26692ee819-file.png
- History: https://ampcode.com/user-content/attachments/4c66a1889a5c4c92267b5a1d86bfd6a47b9c2963439399d41287aba33125e959-file.png
- Compare Images, FAB open: https://ampcode.com/user-content/attachments/13724c677192bd589f1cb48a410a6d3186a0ac8916096104bb310c5583ac7a8e-file.png
- Compare Parts, overlay, FAB open: https://ampcode.com/user-content/attachments/858ded957c1aa4a92260f08baa8f80d3fdaf56fd88e86b35f8778770277031b9-file.png

Narrow-screen references from the original Direction A (restyle with these tokens):

- Stacked mobile: https://ampcode.com/user-content/attachments/1412464cb3dc30463022251fd55fb99758443066f0813750dbb1095148cc43d0-file.png
- Save bottom sheet: https://ampcode.com/user-content/attachments/05f5ffaea56698beb45cb45d68ad9155b897f7655edf09aba79235e5885e5822-file.png

### 4.1 Landing (upload)

```
┌──────────────────────────────────────────────────────────────┐
│ ✎ Compare Sketch                        (◷ History)(● ready) │
│                                                              │
│                    Choose two images                         │
│        Add an original reference and the source …            │
│                                                              │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐        ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       │
│   │ (i) [preview]       │        │        ⇪            │       │
│   │                     │        │      Source         │       │
│   │                     │        │ Sketch with changes │       │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘        │ Drop an image or    │       │
│   Reference · file.jpg  Replace  │ browse              │       │
│                                  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│                  1 of 2 selected  |  Reset                   │
└──────────────────────────────────────────────────────────────┘
```

- There is no dock and no FAB.
- Two equal drop wells, each about 520×380 and 32px apart, with a dashed `--dash` border on white. On hover or drag-over, the border turns accent and gains an accent-tint fill.
- A filled well shows the preview, the identity chip, and a caption row: "Reference · filename" plus a "Replace" text link.
- An empty well shows a centred upload icon, the label (Inter 600), the description (muted), and "Drop an image or **browse**".
- The page advances to Compare Images automatically when both images are loaded (existing behaviour).
- Below 720px, the wells stack at full width.

### 4.2 Compare Images (root workspace)

- **Top-left:** wordmark (no back button). **Top-right:** History pill and status pill.
- **Title card:** project or entry name, meta ("Visual", "Auto aligned", "Manual · 6 anchors", or "Unsaved"), and one clipped note line.
- **Art:** two frames side by side (default), stacked, or overlay. A selected region on the reference is drawn as a 1.5px dashed accent rectangle with four 8px square handles; the outside area is dimmed by 12%.
- **Dock:** [Side by side | Stacked | Overlay] | Rotate source | Select region. In overlay mode, append | Play/Stop | opacity slider (160px) | `NN%` readout.
- **FAB menu (order):**
  1. Compare parts (primary; disabled until a region exists)
  2. Select region on reference
  3. Save comparison
  4. — Alignment —
  5. Run auto align / Run auto align again
  6. Edit manual anchors (opens 4.3)
  7. View originals (Visual method)
  8. —
  9. New comparison
- Methods are mutually exclusive; show a check mark next to the active method row.

### 4.3 Manual anchoring

- **Top-left:** "← Cancel anchors". **Top-right:** status pill.
- **Title card:** "Place matching points"; meta "N anchors · M paired"; note is the live placement hint followed by " · Drag to refine · Arrow keys nudge".
- **Art:** reference and source side by side (stacked below 720px), with the optional grid overlay.
- **Anchor markers:** 22px circles filled with the pair colour, 2px white ring, white Inter 12/600 number, and a soft shadow.
  - Selected marker: 28px with an extra 3px ring in the pair colour at 35% opacity.
  - Unpaired marker (waiting for its match): a gentle pulsing halo (1.6s ease-in-out; disabled under `prefers-reduced-motion`).
  - Markers are focusable buttons (`aria-label="Reference anchor 3"`). Arrow keys nudge a marker; dragging moves it.
- **Dock (icon above label, 12px labels):** Undo | Grid (toggle, `aria-pressed`) | Point list (toggle) | Clear all (danger) | divider | primary "✓ Apply N anchors" (disabled below 4 complete pairs or while OpenCV is not ready; shows "Aligning…" with a spinner while running).
- **Grid popover:** Spacing, X position, Y position, Opacity sliders; segmented "Linked grids | Independent"; when independent, add a segmented "Reference | Source" target.
- **Point list popover:** rows "Point n · ref x,y · source x,y · ✕", scrollable to at most 320px; clicking a row selects its marker.
- There is no FAB on this screen.

### 4.4 Compare Parts

- **Top-left:** "← Whole image" (keeps the selection). **Top-right:** status pill.
- **Title card:** part name (or "Selected region" if unsaved), meta "Part n of N", and one clipped note line.
- **Art:** the same aligned region from the reference and the aligned source, shown stacked (default on narrow screens), side by side, or in overlay. No region size or position text.
- **Dock:** ‹ | part name | › | position dots (8px; active dot in accent) | divider | [Stacked | Side by side | Overlay] | in overlay: divider | Play/Stop | opacity slider | `NN%`.
  - Below 480px, hide the part name but keep the chevrons and dots.
  - Hide the chevrons and dots when the entry has no saved parts.
  - Play animates opacity with the existing 1600ms cosine cycle.
- **FAB menu:**
  1. Save part details (primary; opens the save modal: part name required, part note optional, "Adds to ‹entry›" context, Cancel / "Add part to entry")
  2. Adjust region on whole image
  3. Select a new region
  4. —
  5. Save comparison

### 4.5 History

- **Top-left:** "← Back to comparison". **Top-right:** status pill.
- **Heading:** serif "History", with the muted line "Saved alignments on this browser. Images stay on your device."
- **Layout:** one white card split into three columns by hairline dividers: Projects (about 22%), Entries (about 30%), Detail (the rest).
  - **Projects:** a file icon, the name (Inter 500), and a muted "N entries" line. The selected project gets an accent-tint row with a 2px accent left edge.
  - **Entries:** date and time, a method tag, a muted "N parts" line, and a trash icon on the right (with an aria-label that includes the date). The selected entry is styled like the selected project.
  - **Detail:**
    - Serif date title; tag plus "reference → source" filenames; one clipped note.
    - "Saved parts (N)" list: 56×40 thumbnail placeholder and part name.
    - "Reselect images to open": two slim bordered rows, each showing "Reference · name" or "Source · name" with either a green "✓ Selected" or a ghost "Choose file".
    - Primary "Open comparison" button bottom-right, disabled until both files are chosen ("Opening…" while loading).
- **Empty state:** centred muted text "No saved comparisons yet." with a ghost "Start a comparison" button.
- **Below 900px:** columns collapse into a drill-down (Projects → Entries → Detail), with a back pill at each level.

## 5. Responsive rules

| Width | Changes |
|---|---|
| ≥ 1024px | Side by side allowed; FAB in right gutter; dock with labels |
| 720–1023px | Frames shrink; FAB still in gutter if ≥ 88px free, else mobile placement |
| < 720px | Title card full width minus 32px; images stacked; FAB 48px bottom-right above dock; modals become bottom sheets; drop wells stack |
| < 480px | Dock hides part-name label; anchoring dock hides icon labels (tooltips remain) |

Always respect `env(safe-area-inset-*)` for fixed elements.

## 6. Motion

- Default transition: 160ms `cubic-bezier(0.2, 0, 0, 1)` for hover, press, and colour changes.
- Menu and popover: fade in plus 4px slide from their anchor over 140ms.
- Modal: fade the scrim over 180ms and scale the card from 0.98. Bottom sheet: slide up over 220ms.
- Overlay play: the existing 1600ms cosine opacity loop.
- Honour `prefers-reduced-motion`: remove slides and pulses, and keep only opacity changes.

## 7. Accessibility

- Every icon-only control has an `aria-label` matching its tooltip; toggles use `aria-pressed`.
- Visible focus is a 2px `--accent` outline with a 2px offset on every interactive element, including identity chips and anchor markers.
- Text contrast is at least 4.5:1 (`--ink-muted` on `--paper` passes for 13px+).
- Keyboard:
  - Region selection keeps arrows, Shift for 10px steps, Enter to mark corners, and Esc to clear.
  - Menus support arrow keys and Esc.
  - Modals trap focus.
- The dock and FAB must remain reachable while scrolling, and must never permanently cover art.

## 8. Do / Don't

- **Do:**
  - Keep one accent element per surface.
  - Use the serif only for titles.
  - Put secondary actions in the FAB menu.
  - Show identity through chips and tooltips.
- **Don't:**
  - Add header bars, caption bars, dimension text, or coordinates on images.
  - Use more than one shadow level.
  - Add new colours outside the tokens.
  - Remove an existing capability; relocate it instead (see the function map below).

## 9. Function map (where each existing capability lives)

| Capability | Location |
|---|---|
| Select reference/source images | Landing drop wells; "Replace" link; FAB → New comparison |
| Rotate source 90° | Compare Images dock |
| Visual / Manual / Auto method | Compare Images FAB → Alignment group |
| Place, drag, nudge, undo, clear anchors; grid; point list | Manual anchoring screen and dock |
| Apply anchors | Anchoring dock primary button |
| Side by side / stacked / overlay; opacity; play | Dock on Compare Images and Compare Parts |
| Select region | Dock tool or FAB → Select region on reference |
| Compare parts | FAB → Compare parts |
| Save comparison (project, entry note) | FAB → Save comparison (modal) |
| Save part (name, note) | Compare Parts FAB → Save part details (modal) |
| Navigate saved parts | Compare Parts dock chevrons and dots |
| History browse, open, delete | History pill (top-right) → History screen |
| OpenCV status and retry | Top-right status pill |
