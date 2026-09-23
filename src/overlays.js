// Composition overlays drawn inside the crop window, as one SVG path in pixels (W x H).
// Pure functions: no DOM, no Vue.

const PHI = (1 + Math.sqrt(5)) / 2;

export const OVERLAY_TYPES = ['none', 'thirds', 'golden', 'grid', 'diagonal', 'triangle', 'spiral', 'center'];

const round = n => Math.round(n * 100) / 100;

// Foot of the perpendicular from p onto the line a–b
const project = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return [a[0] + t * dx, a[1] + t * dy];
};

// Golden spiral in a PHI x 1 rectangle: quarter circles through a chain of squares,
// cut left, top, right, bottom in turn. Returns points in that rectangle.
const goldenSpiralPoints = () => {
    const points = [];
    let x = 0;
    let y = 0;
    let w = PHI;
    let h = 1;
    for (let i = 0; i < 12; i++) {
        let s, cx, cy, a0, a1;
        switch (i % 4) {
            case 0: // square on the left
                s = h;
                [cx, cy, a0, a1] = [x + s, y + h, Math.PI, 1.5 * Math.PI];
                x += s;
                w -= s;
                break;
            case 1: // square on top
                s = w;
                [cx, cy, a0, a1] = [x, y + s, 1.5 * Math.PI, 2 * Math.PI];
                y += s;
                h -= s;
                break;
            case 2: // square on the right
                s = h;
                [cx, cy, a0, a1] = [x + w - s, y, 0, 0.5 * Math.PI];
                w -= s;
                break;
            default: // square at the bottom
                s = w;
                [cx, cy, a0, a1] = [x + w, y + h - s, 0.5 * Math.PI, Math.PI];
                h -= s;
        }
        const steps = 12;
        for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
            const a = a0 + ((a1 - a0) * k) / steps;
            points.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
        }
    }
    return points;
};
const SPIRAL = goldenSpiralPoints();

/**
 * @param {string} type one of OVERLAY_TYPES
 * @param {number} W width of the crop window in px
 * @param {number} H height of the crop window in px
 * @param {{ divisions?: number, flipH?: boolean, flipV?: boolean }} options
 *   divisions: squares along the short side ("grid"); flipH / flipV: mirror ("triangle", "spiral")
 * @returns {string} SVG path data, '' when nothing to draw
 */
export function overlayPath(type, W, H, { divisions = 4, flipH = false, flipV = false } = {}) {
    if (!(W > 0 && H > 0)) return '';
    const fx = x => (flipH ? W - x : x);
    const fy = y => (flipV ? H - y : y);
    const line = (x1, y1, x2, y2) => `M${round(fx(x1))} ${round(fy(y1))}L${round(fx(x2))} ${round(fy(y2))}`;
    const vertical = x => line(x, 0, x, H);
    const horizontal = y => line(0, y, W, y);

    switch (type) {
        case 'thirds':
            return [1 / 3, 2 / 3].map(f => vertical(W * f) + horizontal(H * f)).join('');
        case 'golden': {
            // Phi grid: lines at 0.382 and 0.618
            const g = 1 / PHI;
            return [1 - g, g].map(f => vertical(W * f) + horizontal(H * f)).join('');
        }
        case 'grid': {
            // Square cells, `divisions` along the short side
            const cell = Math.min(W, H) / Math.max(1, Math.round(Number(divisions) || 4));
            let d = '';
            for (let x = cell; x < W - 0.5; x += cell) d += vertical(x);
            for (let y = cell; y < H - 0.5; y += cell) d += horizontal(y);
            return d;
        }
        case 'center':
            return vertical(W / 2) + horizontal(H / 2);
        case 'diagonal': {
            // 45° lines from each corner
            const m = Math.min(W, H);
            return line(0, 0, m, m) + line(W, 0, W - m, m) + line(0, H, m, H - m) + line(W, H, W - m, H - m);
        }
        case 'triangle': {
            // Golden triangles: one diagonal, and the perpendiculars to it from the two other corners
            const a = [0, H];
            const b = [W, 0];
            const p1 = project([0, 0], a, b);
            const p2 = project([W, H], a, b);
            return line(...a, ...b) + line(0, 0, ...p1) + line(W, H, ...p2);
        }
        case 'spiral': {
            // Stretched to the window like the usual editors do; drawn landscape, transposed for portrait
            const portrait = H > W;
            const long = portrait ? H : W;
            const short = portrait ? W : H;
            const points = SPIRAL.map(([x, y]) => {
                const px = (x / PHI) * long;
                const py = y * short;
                return portrait ? [py, px] : [px, py];
            });
            return points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(fx(x))} ${round(fy(y))}`).join('');
        }
        default:
            return '';
    }
}
