// Geometry of the zoomable crop. Pure functions, no DOM: easy to test with node.
//
// Vocabulary
// - ratio:   crop width / height
// - zoom:    1 or more. The crop box is the largest box of the ratio (fractions of the image) divided by the zoom
// - crop:    { left, top, width, height } as fractions of the image (0–1)
// - frame:   the fixed crop window on screen, px, relative to the component

export const HARD_ZOOM_CAP = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Zoom values keep 4 decimals, rounded DOWN so they never exceed the cap the server applies
// (same rule as the "Set image focus" endpoint). Below 1.0001 = no zoom.
export const floorZoom = zoom => {
    const z = Math.floor(zoom * 10000) / 10000;
    return Number.isFinite(z) && z > 1.0001 ? z : 1;
};

// Largest zoom that still gives an output of at least minWidth × minHeight px (0 = not checked).
// Keep in step with the backend ("Set image focus", "Export images"): boxW = largest box of the ratio in source px.
// Image size unknown = only the hard cap.
export const maxZoomFor = ({ imageWidth, imageHeight, ratio, minWidth = 1080, minHeight = 0 }) => {
    let max = HARD_ZOOM_CAP;
    const w = Number(imageWidth);
    const h = Number(imageHeight);
    if (w > 0 && h > 0 && ratio > 0) {
        const boxW = Math.min(w, h * ratio);
        const boxH = boxW / ratio;
        if (minWidth > 0) max = Math.min(max, boxW / minWidth);
        if (minHeight > 0) max = Math.min(max, boxH / minHeight);
    }
    return Math.max(1, max);
};

export const clampZoom = (zoom, maxZoom) => floorZoom(clamp(Number.isFinite(zoom) ? zoom : 1, 1, maxZoom));

// Largest box of the ratio inside the image, as fractions of the image (zoom 1)
export const baseCropSize = (imageRatio, ratio) =>
    imageRatio > ratio ? { width: ratio / imageRatio, height: 1 } : { width: 1, height: imageRatio / ratio };

// Crop box for a focus point (centre) and a crop size: kept as centred on the point as the image allows
export const cropRectFor = (focus, size) => ({
    left: clamp(focus.x - size.width / 2, 0, 1 - size.width),
    top: clamp(focus.y - size.height / 2, 0, 1 - size.height),
    width: size.width,
    height: size.height,
});

// The fixed frame: largest box of the ratio inside the available area minus a padding, centred
export const frameRectFor = (available, padding, ratio) => {
    const { width, height } = available;
    if (!(width > 0) || !(height > 0)) return null;
    const pad = Math.max(0, padding || 0);
    const aw = Math.max(1, width - 2 * pad);
    const ah = Math.max(1, height - 2 * pad);
    const w = Math.min(aw, ah * ratio);
    const h = w / ratio;
    return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
};

// The image under the fixed frame: it covers the frame at zoom 1, scales with the zoom, and sits where the crop box
// lands on the frame
export const imageRectFor = (frame, imageRatio, zoom, crop) => {
    const baseWidth = Math.max(frame.width, frame.height * imageRatio);
    const width = baseWidth * zoom;
    const height = width / imageRatio;
    return { left: frame.left - crop.left * width, top: frame.top - crop.top * height, width, height };
};

// Zoom around a screen point: the image point under (px, py) stays under it.
// Returns the new focus point (centre of the crop) for the axes that can move; null = keep that axis as stored.
export const zoomAround = ({ frame, imageRect, imageRatio, ratio, zoom, nextZoom, px, py }) => {
    const base = baseCropSize(imageRatio, ratio);
    const size = { width: base.width / nextZoom, height: base.height / nextZoom };
    const k = nextZoom / zoom;
    const width = imageRect.width * k;
    const height = imageRect.height * k;
    // Fraction of the image under the point
    const u = (px - imageRect.left) / imageRect.width;
    const v = (py - imageRect.top) / imageRect.height;
    const left = (frame.left - (px - u * width)) / width;
    const top = (frame.top - (py - v * height)) / height;
    return {
        x: size.width < 0.9999 ? clamp(left, 0, 1 - size.width) + size.width / 2 : null,
        y: size.height < 0.9999 ? clamp(top, 0, 1 - size.height) + size.height / 2 : null,
    };
};
