---
name: photo-swipe-gesture
description: >-
  Implements touch swipe-to-change-image in React photo viewers with custom
  touch handlers (no swipe library). Covers gating (pan mode, not zoomed),
  threshold detection, pinch/pan conflict avoidance, and parent index wiring.
  Use when adding swipe navigation to galleries, fixing swipe vs pan/zoom/draw
  conflicts, or extending PhotoViewer/DrawingCanvas in this project.
---

# Photo Swipe Gesture (touch slide to swap images)

Custom **touch-only** horizontal swipe to go prev/next. No carousel library. State lives in the gallery parent; the canvas detects gestures and calls `onPrev` / `onNext`.

## Reference implementation (this repo)

| Layer | File | Role |
|-------|------|------|
| Index state | `frontend/src/components/photos/PhotoGallery.jsx` | `selectedPhotoIndex`, `handlePrevPhoto`, `handleNextPhoto` |
| Viewer shell | `frontend/src/components/photos/PhotoViewer.jsx` | Passes `onPrev`/`onNext` to canvas; keyboard arrows; chevron buttons |
| Gesture + zoom/pan/draw | `frontend/src/components/photos/DrawingCanvas.jsx` | Touch handlers, thresholds, `swipeStartRef` |

Read `DrawingCanvas.jsx` before changing swipe behavior.

## Architecture

```
Gallery (owns index)
  → Viewer (resets zoom on photo change, forwards callbacks)
    → Canvas (detects swipe, calls onPrev/onNext)
```

Parent passes `null` when at boundary (no callback = swipe disabled on that side):

```jsx
onPrev={index > 0 ? handlePrev : null}
onNext={index < photos.length - 1 ? handleNext : null}
```

## Constants (tune together)

```js
const SWIPE_THRESHOLD_PX = 60;       // min horizontal travel
const SWIPE_HORIZONTAL_RATIO = 2;    // |deltaX| must be >= ratio * |deltaY|
```

- Increase threshold if accidental swipes are common.
- Increase ratio if vertical scroll feels like horizontal swipes.

## When swipe is armed (`canSwipe`)

All must be true on **single-finger touchstart**:

1. `onPrev || onNext` — neighbor exists
2. `tool === 'pan'` — not draw/text mode
3. `scale <= 1` — not zoomed (zoomed = pan drag only)

If not `canSwipe`, delegate to existing pointer handlers (`handlePointerDown`).

Two-finger touch: clear `swipeStartRef`, handle pinch-zoom (never swipe).

## Three-phase touch flow

Use a ref for start coords (not state — avoid re-renders during move):

```js
const swipeStartRef = useRef(null);
```

**touchstart (1 finger)**  
- If `canSwipe`: `swipeStartRef.current = { x, y }`  
- Else: normal pan/draw down

**touchmove (1 finger)**  
- If `swipeStartRef.current`: `e.preventDefault()` (block page scroll)  
- Else: normal pan/draw move

**touchend (0 fingers left)**  
- If start exists and `changedTouches[0]`:
  - `deltaX = end.clientX - start.x`, `deltaY = end.clientY - start.y`
  - Valid swipe: `|deltaX| >= SWIPE_THRESHOLD_PX` AND `|deltaX| >= |deltaY| * SWIPE_HORIZONTAL_RATIO`
  - `deltaX > 0` → `onPrev()` (swipe right)
  - `deltaX < 0` → `onNext()` (swipe left)
  - Clear ref; return (skip pointer-up pan/draw cleanup if navigation fired)
- Else: `handlePointerUp()` as usual

Container: `style={{ touchAction: 'none' }}` on the gesture surface.

## Coexistence with other gestures

| Gesture | Behavior |
|---------|----------|
| Pinch (2 fingers) | Zoom; clears swipe ref on start |
| Pan (1 finger, zoomed) | `scale > 1` → swipe disabled |
| Draw (1 finger) | `tool === 'draw'` → swipe disabled |
| Wheel | Zoom (desktop); unrelated to swipe |
| Keyboard / buttons | `ArrowLeft`/`ArrowRight` + chevrons in `PhotoViewer` |

After navigation, reset view in viewer on `photo.id` change: `scale = 1`, `offset = {0,0}`, loading state.

## Implementation checklist

When adding swipe to a new viewer:

- [ ] Parent owns index; passes conditional `onPrev` / `onNext`
- [ ] Canvas (or full-screen overlay) receives callbacks as props
- [ ] `swipeStartRef` + three touch handlers on gesture surface
- [ ] Gate swipe on pan tool + `scale <= 1`
- [ ] `touchAction: 'none'` on container
- [ ] Pinch handler clears swipe ref
- [ ] Reset zoom/offset when photo changes
- [ ] Desktop: keyboard and/or nav buttons (mouse drag ≠ swipe)

## Do not

- Use a swipe library for this pattern unless requirements outgrow it (velocity, rubber-banding, snap animation).
- Arm swipe when zoomed — users expect drag-to-pan.
- Arm swipe in draw mode — conflicts with strokes.
- Store swipe start in React state — causes extra renders and jank.
- Forget `preventDefault` during tracked swipe — browser scroll steals the gesture.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Page scrolls instead of swipe | Missing `touchAction: 'none'` or `preventDefault` on move |
| Swipe fires while drawing | `canSwipe` missing `tool === 'pan'` check |
| Swipe fires while zoomed | Missing `scale <= 1` gate |
| Vertical scroll triggers swap | Lower ratio or raise `SWIPE_THRESHOLD_PX` |
| Swipe does nothing at first/last | Parent passed `null` for boundary — expected |
| Pinch then accidental swap | Ensure 2-finger start clears `swipeStartRef` |

## Extending

**Animated slide transition:** keep detection as-is; add CSS transform on index change in viewer (do not move index logic into canvas).

**Velocity-based swipe:** on touchend, also check `deltaX / duration`; keep horizontal-ratio guard.

**RTL:** invert direction mapping (`deltaX > 0` → `onNext`).

**Different thresholds per breakpoint:** derive constants from `window.innerWidth` in one place; document chosen values.
