# image-crop-frame

WeWeb coded component: an image fitted inside the element, with a crop window of a fixed
ratio that the user drags. Made for the carousel-scheduler project
(not derived from a `jpui-*` component).

The crop is a **focus point** `(x, y)` in fractions of the image (0–1): the crop window is
the largest box of the ratio, kept as centred on that point as the image allows. That is
imgproxy's `gravity:fp:x:y` rule, so `rs:fill:W:H/g:fp:x:y` reproduces the preview.

## Use

- Bind `imageUrl`, `imageWidth` / `imageHeight` (the original's size), `ratio`, and
  `focusX` / `focusY` (the saved point).
- On **On crop change**, save `event.value.x` / `event.value.y`. In a `js` formula the event
  is `event`, not `context.event`.
- Move: drag (only the axis the ratio leaves free), arrow keys once focused with Tab (Shift =
  10%), double-click to centre. A mouse drag does not take focus, so page shortcuts on the arrow
  keys keep working.
- **Snap to middle** (off by default): while dragging, the crop sticks to the image centre once
  its centre is within **Snap distance** px (8), and a centre line shows. Arrow keys don't snap.
- Overlays: rule of thirds, golden ratio (phi grid), grid, diagonals, golden triangle, golden
  spiral, center cross, none. Triangle and spiral can be flipped.
- Local context `imageCropFrame`: focus, crop box, output size in px, trimmed side.
- Actions: **Center crop**, **Set focus point** (`x`, `y`).
- States: `dragging`, `disabled`. Colors are style properties (per breakpoint / state / class).

## Develop

```bash
npm i
npm run serve --port=8080
npm run build -- --name=image-crop-frame --type=wwobject
```
