// Geometry of the zoomable crop. Run: npm test (plain node, no dependency)
import assert from 'node:assert/strict';
import {
    maxZoomFor,
    clampZoom,
    floorZoom,
    baseCropSize,
    cropRectFor,
    frameRectFor,
    imageRectFor,
    zoomAround,
} from '../src/zoomMath.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

// 1. Same caps as the backend ("Set image focus", checked on 2026-10-01)
near(maxZoomFor({ imageWidth: 4160, imageHeight: 6240, ratio: 4 / 5 }), 4160 / 1080);
assert.equal(clampZoom(10, maxZoomFor({ imageWidth: 4160, imageHeight: 6240, ratio: 4 / 5 })), 3.8518);
assert.equal(clampZoom(5, maxZoomFor({ imageWidth: 2374, imageHeight: 1334, ratio: 2374 / 1334 })), 2.1981);
// 4:5 on a 16:9 image: the box is 1067 px wide, under 1080: no zoom at all
assert.equal(clampZoom(2, maxZoomFor({ imageWidth: 2374, imageHeight: 1334, ratio: 4 / 5 })), 1);
// A minimum height wins when it is the stricter one
near(maxZoomFor({ imageWidth: 2374, imageHeight: 1334, ratio: 16 / 9, minWidth: 1080, minHeight: 1080 }), 1334 / 1080, 1e-3);
// No minimum, or unknown size: the hard cap
assert.equal(maxZoomFor({ imageWidth: 100, imageHeight: 100, ratio: 1, minWidth: 0, minHeight: 0 }), 8);
assert.equal(maxZoomFor({ imageWidth: null, imageHeight: null, ratio: 1 }), 8);
assert.equal(floorZoom(1.00005), 1);
assert.equal(floorZoom(1.23456), 1.2345);

// 2. At any zoom and focus, the crop lands exactly on the frame and the image covers it
const frame = frameRectFor({ width: 600, height: 500 }, 16, 4 / 5);
near(frame.width / frame.height, 4 / 5);
assert.ok(frame.width <= 600 - 32 + 1e-9 && frame.height <= 500 - 32 + 1e-9);
near(frame.left, (600 - frame.width) / 2);
const imageRatio = 4160 / 6240;
for (const zoom of [1, 1.7, 3.8518]) {
    const base = baseCropSize(imageRatio, 4 / 5);
    const size = { width: base.width / zoom, height: base.height / zoom };
    for (const focus of [{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.9 }, { x: 0, y: 0 }]) {
        const crop = cropRectFor(focus, size);
        const img = imageRectFor(frame, imageRatio, zoom, crop);
        near(img.left + crop.left * img.width, frame.left);
        near(img.top + crop.top * img.height, frame.top);
        near(crop.width * img.width, frame.width);
        near(crop.height * img.height, frame.height);
        assert.ok(img.left <= frame.left + 1e-6 && img.top <= frame.top + 1e-6);
        assert.ok(img.left + img.width >= frame.left + frame.width - 1e-6);
        assert.ok(img.top + img.height >= frame.top + frame.height - 1e-6);
    }
}

// 3. Zooming around a point keeps the image point under it (away from the edges)
{
    const zoom = 1.5;
    const base = baseCropSize(imageRatio, 4 / 5);
    const crop = cropRectFor({ x: 0.5, y: 0.5 }, { width: base.width / zoom, height: base.height / zoom });
    const imageRect = imageRectFor(frame, imageRatio, zoom, crop);
    const px = frame.left + frame.width * 0.4;
    const py = frame.top + frame.height * 0.45;
    const u = (px - imageRect.left) / imageRect.width;
    const v = (py - imageRect.top) / imageRect.height;
    const nextZoom = 2.2;
    const f = zoomAround({ frame, imageRect, imageRatio, ratio: 4 / 5, zoom, nextZoom, px, py });
    const ncrop = cropRectFor(f, { width: base.width / nextZoom, height: base.height / nextZoom });
    const nrect = imageRectFor(frame, imageRatio, nextZoom, ncrop);
    near((px - nrect.left) / nrect.width, u, 1e-9);
    near((py - nrect.top) / nrect.height, v, 1e-9);
}

// 4. An axis that can't move (full width at zoom 1) is left as stored (null)
{
    const base = baseCropSize(2 / 3, 4 / 5);
    assert.equal(base.width, 1);
    const imageRect = imageRectFor(frame, 2 / 3, 1, cropRectFor({ x: 0.5, y: 0.5 }, base));
    const f = zoomAround({ frame, imageRect, imageRatio: 2 / 3, ratio: 4 / 5, zoom: 1, nextZoom: 1, px: 300, py: 250 });
    assert.equal(f.x, null);
    assert.notEqual(f.y, null);
}

console.log('zoomMath: all tests passed');
