# image-crop-frame

WeWeb coded component: an image fitted inside the element, with a crop window of a fixed
ratio that the user drags. Made for the carrousl project
(not derived from a `jpui-*` component).

The crop is a **focus point** `(x, y)` in fractions of the image (0–1): the crop window is
the largest box of the ratio, kept as centred on that point as the image allows. That is
imgproxy's `gravity:fp:x:y` rule, so `rs:fill:W:H/g:fp:x:y` reproduces the preview. With a **zoom** the box
is the largest box of the ratio divided by the zoom (`crop:w:h:fp:x:y` at the original's resolution).

## Use

- Bind `imageUrl`, `imageWidth` / `imageHeight` (the original's size), `ratio`, and
  `focusX` / `focusY` (the saved point).
- On **On crop change**, save `event.value.x` / `event.value.y` / `event.value.zoom`. In a `js` formula the event
  is `event`, not `context.event`. The event fires once the crop has been still for **Change delay** ms (500): a
  burst of drags, scrolls or key presses makes one save. A change still waiting when the image changes is dropped.
  Saves can still overlap (a slow endpoint): the component ignores a bound value equal to an older change event,
  so the late answer of an earlier save never pulls the crop back.
- Move: drag (only the axis the ratio leaves free), arrow keys once focused with Tab (Shift =
  10%), double-click to centre. A mouse drag does not take focus, so page shortcuts on the arrow
  keys keep working.
- **Snap to middle** (off by default): while dragging, the crop sticks to the image centre once
  its centre is within **Snap distance** px (8), and a centre line shows (style property **Snap line color**). Arrow keys don't snap.
- **Zoom** (property `zoomEnabled`, off by default): the frame stays put and the image moves and scales under
  it, like the iOS crop (the rest of the image shows darkened, `Frame margin` px around the frame). Bind `zoom` to
  the saved value, and `minOutputWidth` / `minOutputHeight` to the limits the backend uses (the app gets them from
  its image list endpoint), so the gesture stops where the server would cap it. Zoom with Cmd / Ctrl + scroll or a trackpad pinch (around the pointer; in Safari the pinch arrives as gesture events, handled too), a two-finger pinch on a touch screen (around the fingers, which also move the image; lift one finger and the other keeps dragging), `+` / `-` keys once focused;
  a plain scroll moves the image once zoomed; drag moves it; double-click shows the whole image. The zoom is capped
  so the exported crop keeps `Min output width` px (1080) and, if set, `Min output height` px (0 = not checked): the
  same formula as the backend, `maxZoom = max(1, min(boxW / minW, boxH / minH))` with `boxW = min(imgW, imgH × ratio)`.
  A saved zoom is shown even with Zoom off (the crop window just gets smaller). In zoom mode the frame takes all touch
  gestures (`touch-action: none`): a finger on it never scrolls the page. Geometry is in `src/zoomMath.js` (pure functions).
- Overlays: rule of thirds, golden ratio (phi grid), grid, diagonals, golden triangle, golden
  spiral, center cross, none. Triangle and spiral can be flipped.
- Local context `imageCropFrame`: focus, crop box, output size in px, trimmed side.
- Actions: **Center crop**, **Reset zoom**, **Set focus point** (`x`, `y`, `zoom`).
- States: `dragging`, `disabled`, `zoomed`. Colors are style properties (per breakpoint / state / class).

## Develop

```bash
npm i
npm run serve --port=8080
npm run build -- --name=image-crop-frame --type=wwobject
npm test         # geometry of the zoom (src/zoomMath.js), plain node
npm run harness  # standalone test page outside WeWeb (dev/harness), see dev/harness/build.mjs
```
