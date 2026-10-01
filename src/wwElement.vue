<template>
    <div
        ref="root"
        class="image-crop-frame"
        :data-dragging="isDragging ? 'true' : null"
        :data-zoomed="isZoomed ? 'true' : null"
        :aria-disabled="isDisabled ? 'true' : null"
    >
        <div
            v-if="imageUrl"
            ref="box"
            class="image-crop-frame__box"
            :class="{ 'is-movable': canMove, 'is-dragging': isDragging, 'is-zoom': zoomMode }"
            :style="boxStyle"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @mousedown="onMouseDown"
            @dblclick="onDoubleClick"
        >
            <span v-if="!isLoaded" class="image-crop-frame__spinner" aria-hidden="true"></span>
            <img
                :key="imageUrl"
                class="image-crop-frame__image"
                :class="{ 'is-loaded': isLoaded }"
                :style="imageStyle"
                :src="imageUrl"
                :alt="content?.alt ?? ''"
                draggable="false"
                @load="onImageLoad"
            />
            <div v-if="shadeStyle" class="image-crop-frame__shade" :style="shadeStyle" aria-hidden="true">
                <span class="image-crop-frame__shade-hole" :style="shadeHoleStyle"></span>
            </div>
            <div
                class="image-crop-frame__window"
                :style="windowStyle"
                :tabindex="canMove || canZoom ? 0 : -1"
                role="group"
                aria-roledescription="crop area"
                :aria-label="accessibleName"
                :aria-describedby="canMove || canZoom ? helpId : null"
                @keydown="onKeyDown"
            >
                <svg
                    v-if="overlayD"
                    class="image-crop-frame__overlay"
                    :class="{ 'is-crisp': isStraightOverlay }"
                    :viewBox="overlayViewBox"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path :d="overlayD" vector-effect="non-scaling-stroke" />
                </svg>
            </div>
            <span
                v-if="snapped.x"
                class="image-crop-frame__snap-guide is-vertical"
                :style="snapGuideStyle.x"
                aria-hidden="true"
            ></span>
            <span
                v-if="snapped.y"
                class="image-crop-frame__snap-guide is-horizontal"
                :style="snapGuideStyle.y"
                aria-hidden="true"
            ></span>
            <span :id="helpId" class="image-crop-frame__help">
                {{ helpText }}
            </span>
        </div>
    </div>
</template>

<script>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { overlayPath } from './overlays.js';
import {
    baseCropSize,
    clampZoom,
    cropRectFor,
    frameRectFor,
    imageRectFor,
    maxZoomFor,
    zoomAround,
} from './zoomMath.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = value => Math.round(value * 10000) / 10000;
// A focus coordinate: a number between 0 and 1, anything else counts as "not set"
const toFraction = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, 0, 1) : null;
};
const isEmpty = value => value === null || value === undefined || value === '';
// "4:5", "4/5", "4x5" or a plain number ("0.8") → width / height
const parseRatio = value => {
    if (typeof value === 'number' && value > 0) return value;
    const parts = String(value ?? '')
        .split(/[:/x×]/)
        .map(part => parseFloat(part));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1];
    if (parts.length === 1 && parts[0] > 0) return parts[0];
    return 4 / 3;
};
const STRAIGHT_OVERLAYS = ['thirds', 'golden', 'grid', 'center'];

export default {
    props: {
        uid: { type: String, required: true },
        content: { type: Object, required: true },
        wwElementState: { type: Object, default: () => ({}) },
        /* wwEditor:start */
        wwEditorState: { type: Object, required: true },
        /* wwEditor:end */
    },
    emits: ['trigger-event'],
    setup(props, { emit }) {
        const root = ref(null);
        const box = ref(null);

        const isEditing = computed(() => {
            /* wwEditor:start */
            return !!props.wwEditorState?.isEditing;
            /* wwEditor:end */
            // eslint-disable-next-line no-unreachable
            return false;
        });

        const imageUrl = computed(() => props.content?.imageUrl || '');
        const isDisabled = computed(() => !!props.content?.disabled);
        // Zoom mode (iOS style): fixed frame, the image moves and scales under it. Off = the original behaviour.
        const zoomMode = computed(() => !!props.content?.zoomEnabled);

        /* ---------- Image aspect ratio ---------- */
        // Known dimensions first (they arrive before the image), else the loaded image's own size
        const naturalSize = ref(null);
        const isLoaded = ref(false);
        watch(imageUrl, () => {
            isLoaded.value = false;
            naturalSize.value = null;
        });
        const onImageLoad = event => {
            const img = event?.target;
            if (img?.naturalWidth && img?.naturalHeight) {
                naturalSize.value = { width: img.naturalWidth, height: img.naturalHeight };
            }
            isLoaded.value = true;
        };
        const knownSize = computed(() => {
            const width = Number(props.content?.imageWidth);
            const height = Number(props.content?.imageHeight);
            if (width > 0 && height > 0) return { width, height };
            return naturalSize.value;
        });
        const imageRatio = computed(() => (knownSize.value ? knownSize.value.width / knownSize.value.height : 3 / 2));

        /* ---------- Fit the image inside the element ---------- */
        const available = ref({ width: 0, height: 0 });
        let resizeObserver = null;
        onMounted(() => {
            const win = wwLib.getFrontWindow();
            const measure = () => {
                const rect = root.value?.getBoundingClientRect?.();
                if (rect) available.value = { width: rect.width, height: rect.height };
            };
            measure();
            if (typeof win?.ResizeObserver === 'function' && root.value) {
                resizeObserver = new win.ResizeObserver(measure);
                resizeObserver.observe(root.value);
            }
        });
        onBeforeUnmount(() => resizeObserver?.disconnect());

        // Classic mode: the image contained in the element
        const boxSize = computed(() => {
            const { width, height } = available.value;
            if (!width || !height) return null;
            const scale = Math.min(width / imageRatio.value, height);
            return { width: scale * imageRatio.value, height: scale };
        });

        /* ---------- Zoom ---------- */
        const targetRatio = computed(() => parseRatio(props.content?.ratio));
        // Largest zoom that keeps the output at least minOutputWidth × minOutputHeight px (same rule as the backend)
        const maxZoom = computed(() => {
            const minWidth = isEmpty(props.content?.minOutputWidth) ? 1080 : Number(props.content.minOutputWidth) || 0;
            const minHeight = Number(props.content?.minOutputHeight) || 0;
            return maxZoomFor({
                imageWidth: knownSize.value?.width,
                imageHeight: knownSize.value?.height,
                ratio: targetRatio.value,
                minWidth,
                minHeight,
            });
        });
        // The bound value, unless the user just changed it (same idea as the focus point below)
        const boundZoom = computed(() => {
            const z = Number(props.content?.zoom);
            return Number.isFinite(z) && z > 1 ? z : 1;
        });
        const localZoom = ref(null);
        const isDragging = ref(false);
        // A change waiting for the "change" event (see changeDelay), and the values already sent, newest last
        const isSettling = ref(false);
        let settleTimer = null;
        let sentValues = [];
        // Always capped: a ratio change may have lowered the cap under the stored zoom (the server caps it the same way)
        const zoom = computed(() => clampZoom(localZoom.value ?? boundZoom.value, maxZoom.value));
        const isZoomed = computed(() => zoom.value > 1);
        const canInteract = computed(() => !isEditing.value && !isDisabled.value);
        const canZoom = computed(() => zoomMode.value && canInteract.value && maxZoom.value > 1);

        /* ---------- Crop window ---------- */
        // Share of the image the crop keeps: the largest box of the target ratio, divided by the zoom
        const cropSize = computed(() => {
            const base = baseCropSize(imageRatio.value, targetRatio.value);
            return { width: base.width / zoom.value, height: base.height / zoom.value };
        });
        const canMoveX = computed(() => cropSize.value.width < 0.9999);
        const canMoveY = computed(() => cropSize.value.height < 0.9999);
        const canMove = computed(() => canInteract.value && (canMoveX.value || canMoveY.value));

        // Focus point = centre of the crop (0–1). The bound value, unless the user just moved it
        const boundFocus = computed(() => ({
            x: toFraction(props.content?.focusX) ?? 0.5,
            y: toFraction(props.content?.focusY) ?? 0.5,
        }));
        const localFocus = ref(null);
        // Same crop, give or take the rounding done on the way (4 decimals)
        const sameCrop = (a, b) =>
            Math.abs(a.x - b.x) < 0.0002 && Math.abs(a.y - b.y) < 0.0002 && Math.abs(a.zoom - b.zoom) < 0.0002;
        // A new bound value (saved, reloaded, other image) takes over from the local one, except:
        // - while the user is still at it (dragging, or a change waiting to be sent): their value wins, the next
        //   change event saves it;
        // - when it is the late echo of an earlier change event: several saves can be on their way at once, and the
        //   answer to an older one must not pull the crop back.
        // Keyed on primitives, so a re-evaluated binding with the same values changes nothing.
        watch(
            () => [imageUrl.value, toFraction(props.content?.focusX), toFraction(props.content?.focusY), boundZoom.value],
            ([url, x, y, z], [previousUrl]) => {
                if (url !== previousUrl) {
                    // Another image: a change still waiting belonged to the previous one, it is dropped
                    clearTimeout(settleTimer);
                    isSettling.value = false;
                    sentValues = [];
                } else {
                    if (isDragging.value || isSettling.value) return;
                    const bound = { x, y, zoom: z };
                    const latest = sentValues[sentValues.length - 1];
                    const isLateEcho =
                        latest && !sameCrop(bound, latest) && sentValues.some(sent => sameCrop(bound, sent));
                    if (isLateEcho) {
                        // Keep showing the latest change (the local value may already have given way to it)
                        localFocus.value = { x: latest.x, y: latest.y };
                        localZoom.value = latest.zoom;
                        return;
                    }
                }
                localFocus.value = null;
                localZoom.value = null;
            }
        );
        const focus = computed(() => localFocus.value ?? boundFocus.value);

        // Crop box position: kept as centred on the focus point as the image allows
        // (same rule as imgproxy's fp gravity)
        const cropRect = computed(() => cropRectFor(focus.value, cropSize.value));

        /* ---------- Layout on screen (px, relative to the component) ---------- */
        // Zoom mode: the fixed frame, and the image under it
        const frameRect = computed(() =>
            zoomMode.value
                ? frameRectFor(available.value, Number(props.content?.framePadding ?? 16), targetRatio.value)
                : null
        );
        const imageRect = computed(() => {
            if (zoomMode.value) {
                return frameRect.value
                    ? imageRectFor(frameRect.value, imageRatio.value, zoom.value, cropRect.value)
                    : null;
            }
            return boxSize.value ? { left: 0, top: 0, width: boxSize.value.width, height: boxSize.value.height } : null;
        });

        /* ---------- Internal variable ---------- */
        const variableValue = computed(() => {
            const rect = cropRect.value;
            return {
                focusX: round4(focus.value.x),
                focusY: round4(focus.value.y),
                zoom: zoom.value,
                left: round4(rect.left),
                top: round4(rect.top),
                width: round4(rect.width),
                height: round4(rect.height),
            };
        });
        const { setValue } = wwLib.wwVariable.useComponentVariable({
            uid: props.uid,
            name: 'value',
            type: 'object',
            defaultValue: variableValue.value,
        });
        watch(variableValue, value => setValue(value), { deep: true });

        /* ---------- Local context (formula editor) ---------- */
        const localData = computed(() => {
            const rect = cropRect.value;
            const size = knownSize.value;
            const trimmedAxis = canMoveX.value ? 'width' : canMoveY.value ? 'height' : null;
            const trimmed = trimmedAxis ? 1 - rect[trimmedAxis] : 0;
            return {
                focus: { x: round4(focus.value.x), y: round4(focus.value.y) },
                zoom: zoom.value,
                // Rounded down like the zoom itself, so it never reads higher than what is accepted
                maxZoom: Math.floor(maxZoom.value * 10000) / 10000,
                crop: variableValue.value,
                output: size
                    ? { width: Math.round(size.width * rect.width), height: Math.round(size.height * rect.height) }
                    : null,
                trim: { axis: trimmedAxis, percent: Math.round(trimmed * 100) },
                ratio: round4(targetRatio.value),
                isDragging: isDragging.value,
                isLoaded: isLoaded.value,
            };
        });
        const markdown = `### Image crop frame

#### focus
Current focus point (centre of the crop), live while dragging: \`{ x, y }\`, 0–1.

#### zoom / maxZoom
Current zoom (1 = the largest box of the ratio, more = a tighter crop) and the largest zoom allowed by the minimum output size.

#### crop
Crop box as fractions of the image: \`{ focusX, focusY, zoom, left, top, width, height }\`.

#### output
Size in px of the cropped original: \`{ width, height }\`, or \`null\` while the image size is unknown.

#### trim
Which side the crop cuts and by how much: \`{ axis: 'width' | 'height' | null, percent }\`.

#### ratio / isDragging / isLoaded
Crop ratio (width / height), whether the user is dragging, whether the image has loaded.

**Usage example:**
\`\`\`
context.local.data?.['imageCropFrame']?.['output']?.['width']
\`\`\`
`;
        wwLib.wwElement.useRegisterElementLocalContext('imageCropFrame', localData, {}, markdown);

        const emitChange = () => {
            clearTimeout(settleTimer);
            isSettling.value = false;
            const value = { x: round4(focus.value.x), y: round4(focus.value.y), zoom: zoom.value };
            sentValues = [...sentValues.slice(-19), value];
            emit('trigger-event', { name: 'change', event: { value } });
        };

        // One change event once the crop has been still for changeDelay ms, not one per drag, wheel tick or key
        const changeDelay = computed(() => {
            const ms = Number(props.content?.changeDelay ?? 500);
            return Number.isFinite(ms) ? clamp(ms, 0, 5000) : 500;
        });
        const emitChangeSoon = () => {
            clearTimeout(settleTimer);
            isSettling.value = true;
            settleTimer = setTimeout(emitChange, changeDelay.value);
        };
        onBeforeUnmount(() => clearTimeout(settleTimer));

        // Move the crop box to a new top-left corner (fractions), only along the axes that can move.
        // The other axis keeps its stored value, so a later ratio change still has it.
        const moveTo = (left, top) => {
            const { width, height } = cropSize.value;
            localFocus.value = {
                x: canMoveX.value ? clamp(left, 0, 1 - width) + width / 2 : focus.value.x,
                y: canMoveY.value ? clamp(top, 0, 1 - height) + height / 2 : focus.value.y,
            };
        };

        /* ---------- Snap to the middle (drag only) ---------- */
        // Which axes are currently held on the image centre, for the guide lines
        const snapped = ref({ x: false, y: false });
        // Top-left corner (fraction) → the centred one when the crop centre is within the snap distance
        const snapStart = (start, size, boxPx) => {
            if (!props.content?.snapToCenter) return { value: start, isSnapped: false };
            const distance = Math.max(0, Number(props.content?.snapDistance ?? 8) || 0);
            const centred = 0.5 - size / 2;
            return Math.abs(start - centred) * boxPx <= distance
                ? { value: centred, isSnapped: true }
                : { value: start, isSnapped: false };
        };
        // Zoom mode: the guide lines go through the middle of the image, wherever it is on screen
        const snapGuideStyle = computed(() => {
            const rect = imageRect.value;
            if (!zoomMode.value || !rect) return { x: null, y: null };
            return {
                x: { left: `${rect.left + rect.width / 2}px` },
                y: { top: `${rect.top + rect.height / 2}px` },
            };
        });

        /* ---------- Drag ---------- */
        let drag = null;
        const onMouseDown = event => {
            // Don't let a mouse drag focus the crop: arrow keys keep doing what the page wants
            if (canMove.value) event.preventDefault();
        };
        const onPointerDown = event => {
            if (!canMove.value || event.button !== 0) return;
            const rect = imageRect.value;
            if (!rect?.width || !rect?.height) return;
            event.preventDefault();
            try {
                box.value?.setPointerCapture?.(event.pointerId);
            } catch (e) {
                // Pointer already released: the drag still works while the pointer stays over the image
            }
            drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: cropRect.value.left,
                startTop: cropRect.value.top,
                // Image size on screen: converts pointer distance into a share of the image
                width: rect.width,
                height: rect.height,
                // Classic: the window follows the pointer. Zoom mode: the image does, so the crop goes the other way
                sign: zoomMode.value ? -1 : 1,
                startFocus: { ...focus.value },
            };
            isDragging.value = true;
        };
        const onPointerMove = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const { width, height } = cropSize.value;
            const left = snapStart(
                drag.startLeft + (drag.sign * (event.clientX - drag.startX)) / drag.width,
                width,
                drag.width
            );
            const top = snapStart(
                drag.startTop + (drag.sign * (event.clientY - drag.startY)) / drag.height,
                height,
                drag.height
            );
            snapped.value = {
                x: canMoveX.value && left.isSnapped,
                y: canMoveY.value && top.isSnapped,
            };
            moveTo(left.value, top.value);
        };
        const onPointerUp = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            try {
                box.value?.releasePointerCapture?.(event.pointerId);
            } catch (e) {
                // Nothing to release
            }
            const moved =
                round4(focus.value.x) !== round4(drag.startFocus.x) ||
                round4(focus.value.y) !== round4(drag.startFocus.y);
            drag = null;
            isDragging.value = false;
            snapped.value = { x: false, y: false };
            if (moved) emitChangeSoon();
        };

        /* ---------- Zoom gestures ---------- */
        // Zoom around a point of the component (px, relative to it): the image point under it stays under it
        const zoomAt = (nextZoomRaw, px, py) => {
            const rect = imageRect.value;
            const frame = frameRect.value;
            if (!zoomMode.value || !rect || !frame) return false;
            const nextZoom = clampZoom(nextZoomRaw, maxZoom.value);
            if (nextZoom === zoom.value) return false;
            const next = zoomAround({
                frame,
                imageRect: rect,
                imageRatio: imageRatio.value,
                ratio: targetRatio.value,
                zoom: zoom.value,
                nextZoom,
                px,
                py,
            });
            localFocus.value = { x: next.x ?? focus.value.x, y: next.y ?? focus.value.y };
            localZoom.value = nextZoom;
            return true;
        };
        const frameCenter = () => {
            const frame = frameRect.value;
            return frame ? { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 } : { x: 0, y: 0 };
        };

        // Wheel: ⌘ / Ctrl + wheel and the trackpad pinch (the browser sends it as ctrl + wheel) zoom around the pointer;
        // a plain scroll (two fingers) moves the image once zoomed. Without a modifier and without a zoom,
        // a vertical scroll still scrolls the page.
        // Largest delta taken from one wheel event: a mouse notch (~100 px, more with ctrl on Windows) would otherwise
        // jump straight to the cap, while a pinch sends many small deltas
        const MAX_WHEEL_DELTA = 40;
        const onWheel = event => {
            if (!zoomMode.value || !canInteract.value) return;
            const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
            const deltaX = (event.deltaX || 0) * lines;
            const deltaY = (event.deltaY || 0) * lines;
            const rect = box.value?.getBoundingClientRect?.();
            if (!rect) return;
            if (event.ctrlKey || event.metaKey) {
                // Always swallowed over the frame, even when the zoom can't change: otherwise the browser zooms the page
                event.preventDefault();
                // Not while dragging: the drag measures from where it started, a size change would make it jump
                if (drag || maxZoom.value <= 1) return;
                const step = clamp(deltaY, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
                const changed = zoomAt(
                    zoom.value * Math.exp(-step * 0.01),
                    event.clientX - rect.left,
                    event.clientY - rect.top
                );
                if (changed) emitChangeSoon();
            } else if (isZoomed.value && canMove.value) {
                event.preventDefault();
                const size = imageRect.value;
                if (drag || !size) return;
                // Scrolling right shows what is on the right: the crop moves right
                moveTo(cropRect.value.left + deltaX / size.width, cropRect.value.top + deltaY / size.height);
                emitChangeSoon();
            } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // A sideways two-finger swipe would go back / forward in the browser history (Chrome on macOS)
                event.preventDefault();
            }
        };
        // The listener is added by hand: it must not be passive to be able to stop the page scrolling
        watch(
            box,
            (element, previous) => {
                previous?.removeEventListener?.('wheel', onWheel);
                element?.addEventListener?.('wheel', onWheel, { passive: false });
            },
            { flush: 'post' }
        );
        onBeforeUnmount(() => box.value?.removeEventListener?.('wheel', onWheel));

        /* ---------- Actions ---------- */
        // Set the focus point (and the zoom) from a workflow; an empty value keeps its current one
        const setFocus = (x, y, nextZoom) => {
            const next = { x: toFraction(x) ?? focus.value.x, y: toFraction(y) ?? focus.value.y };
            const targetZoom = isEmpty(nextZoom) ? zoom.value : clampZoom(Number(nextZoom), maxZoom.value);
            if (
                round4(next.x) === round4(focus.value.x) &&
                round4(next.y) === round4(focus.value.y) &&
                targetZoom === zoom.value
            ) {
                return;
            }
            localFocus.value = next;
            localZoom.value = targetZoom;
            emitChangeSoon();
        };
        const centerCrop = () => setFocus(0.5, 0.5);
        const resetZoom = () => setFocus(0.5, 0.5, 1);
        // Double-click: zoom mode goes back to the whole image, classic mode just centres
        const onDoubleClick = () => {
            if (zoomMode.value) {
                if (canInteract.value) resetZoom();
            } else if (canMove.value) {
                centerCrop();
            }
        };

        /* ---------- Keyboard (when focused with Tab) ---------- */
        const onKeyDown = event => {
            const zoomKey = { '+': 1.1, '=': 1.1, '-': 1 / 1.1, _: 1 / 1.1 }[event.key];
            if (zoomKey && canZoom.value && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                event.stopPropagation();
                const center = frameCenter();
                if (zoomAt(zoom.value * zoomKey, center.x, center.y)) emitChangeSoon();
                return;
            }
            if (!canMove.value) return;
            const step = event.shiftKey ? 0.1 : 0.01;
            const { left, top } = cropRect.value;
            const moves = {
                ArrowLeft: canMoveX.value && [left - step, top],
                ArrowRight: canMoveX.value && [left + step, top],
                ArrowUp: canMoveY.value && [left, top - step],
                ArrowDown: canMoveY.value && [left, top + step],
            };
            if (!moves[event.key]) return;
            // Handled here: keep the page shortcuts and scrolling out of it
            event.preventDefault();
            event.stopPropagation();
            moveTo(...moves[event.key]);
            emitChangeSoon();
        };

        /* ---------- Overlay ---------- */
        const overlayType = computed(() => props.content?.overlay ?? 'thirds');
        // Size of the crop window on screen
        const windowPx = computed(() => {
            if (zoomMode.value) {
                return frameRect.value ? { width: frameRect.value.width, height: frameRect.value.height } : null;
            }
            return boxSize.value
                ? {
                      width: boxSize.value.width * cropRect.value.width,
                      height: boxSize.value.height * cropRect.value.height,
                  }
                : null;
        });
        const overlayD = computed(() =>
            windowPx.value
                ? overlayPath(overlayType.value, windowPx.value.width, windowPx.value.height, {
                      divisions: props.content?.gridDivisions,
                      flipH: !!props.content?.overlayFlipH,
                      flipV: !!props.content?.overlayFlipV,
                  })
                : ''
        );
        const overlayViewBox = computed(() =>
            windowPx.value ? `0 0 ${windowPx.value.width} ${windowPx.value.height}` : '0 0 1 1'
        );
        const isStraightOverlay = computed(() => STRAIGHT_OVERLAYS.includes(overlayType.value));

        /* ---------- Styles (runtime values; colors come from the css() hook) ---------- */
        const boxStyle = computed(() => {
            // Zoom mode: the box is the whole component, the frame and the image are placed inside it
            if (zoomMode.value) return { width: '100%', height: '100%' };
            return boxSize.value
                ? { width: `${boxSize.value.width}px`, height: `${boxSize.value.height}px` }
                : { width: '100%', aspectRatio: String(imageRatio.value) };
        });
        const imageStyle = computed(() => {
            const rect = imageRect.value;
            if (!zoomMode.value || !rect) return null;
            return {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                right: 'auto',
                bottom: 'auto',
            };
        });
        const darkenAlpha = computed(() => clamp(Number(props.content?.darken ?? 45) || 0, 0, 100) / 100);
        // Zoom mode: the box is the whole element, wider than the image, so a shadow on the window would also darken
        // the empty areas beside the image (a grey band). The shade is drawn over the image only, with a hole
        // where the frame is.
        const shadeStyle = computed(() => {
            const rect = imageRect.value;
            // Not before the image has loaded: it would draw a dark box where the spinner turns
            if (!zoomMode.value || !rect || !frameRect.value || !isLoaded.value) return null;
            return {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
            };
        });
        const shadeHoleStyle = computed(() => {
            const rect = imageRect.value;
            const frame = frameRect.value;
            if (!rect || !frame) return null;
            return {
                left: `${frame.left - rect.left}px`,
                top: `${frame.top - rect.top}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${darkenAlpha.value})`,
            };
        });
        const windowStyle = computed(() => {
            const darken = darkenAlpha.value;
            const overlayOpacity = clamp(Number(props.content?.overlayOpacity ?? 40) || 0, 0, 100) / 100;
            const rect = cropRect.value;
            const frame = frameRect.value;
            const place =
                zoomMode.value && frame
                    ? {
                          left: `${frame.left}px`,
                          top: `${frame.top}px`,
                          width: `${frame.width}px`,
                          height: `${frame.height}px`,
                      }
                    : {
                          left: `${rect.left * 100}%`,
                          top: `${rect.top * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                      };
            return {
                ...place,
                // Classic mode: darken everything outside the crop with a huge shadow clipped by the box (= the image).
                // Zoom mode: the shade layer does it, over the image only
                boxShadow: zoomMode.value ? 'none' : `0 0 0 9999px rgba(0, 0, 0, ${darken})`,
                '--icf-overlay-opacity': overlayOpacity,
            };
        });

        /* ---------- Accessibility ---------- */
        const accessibleName = computed(
            () => props.content?.ariaLabel?.trim() || props.wwElementState?.name || 'Crop area'
        );
        const helpId = computed(() => `image-crop-frame-help-${props.uid}`);
        const helpText = computed(() =>
            zoomMode.value
                ? 'Drag, or use the arrow keys (Shift for bigger steps), to move the image under the crop. Press plus or minus to zoom, or pinch / hold Command and scroll. Double-click to show the whole image.'
                : 'Drag, or use the arrow keys (Shift for bigger steps), to move the crop. Double-click to centre it.'
        );

        return {
            root,
            box,
            imageUrl,
            isDisabled,
            isLoaded,
            onImageLoad,
            canMove,
            canZoom,
            zoomMode,
            isZoomed,
            isDragging,
            snapped,
            snapGuideStyle,
            onMouseDown,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onDoubleClick,
            onKeyDown,
            overlayD,
            overlayViewBox,
            isStraightOverlay,
            boxStyle,
            imageStyle,
            shadeStyle,
            shadeHoleStyle,
            windowStyle,
            accessibleName,
            helpId,
            helpText,
            // Actions (ww-config `actions`)
            setFocus,
            centerCrop,
            resetZoom,
        };
    },
};
</script>

<style lang="scss" scoped>
.image-crop-frame {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.image-crop-frame__box {
    position: relative;
    overflow: hidden;
    flex: none;
    user-select: none;
    -webkit-user-select: none;

    &.is-movable {
        cursor: grab;
        touch-action: none;
    }
    &.is-dragging {
        cursor: grabbing;
    }
}

.image-crop-frame__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    pointer-events: none;

    &.is-loaded {
        opacity: 1;
    }
}

// Zoom mode: the darkening, over the image only (its overflow clips the hole's shadow)
.image-crop-frame__shade {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
}
.image-crop-frame__shade-hole {
    position: absolute;
}

// Zoom mode: the image is placed in px (exact ratio), whatever its natural size
.is-zoom .image-crop-frame__image {
    object-fit: fill;
    max-width: none;
}

.image-crop-frame__window {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--icf-frame-color, #ffffff);
    transition: left 150ms ease, top 150ms ease, width 150ms ease, height 150ms ease;

    .is-dragging & {
        transition: none;
    }
    // The frame never moves in zoom mode, only the image does: a transition would only lag behind it
    .is-zoom & {
        transition: none;
    }
    &:focus-visible {
        outline: 2px solid var(--icf-frame-color, #ffffff);
        outline-offset: 2px;
    }
}

.image-crop-frame__overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    opacity: var(--icf-overlay-opacity, 0.4);

    path {
        fill: none;
        stroke: var(--icf-overlay-color, #ffffff);
        stroke-width: 1px;
    }
    &.is-crisp path {
        shape-rendering: crispEdges;
    }
}

// Image centre line, shown while a drag is held on it
.image-crop-frame__snap-guide {
    position: absolute;
    pointer-events: none;
    background: var(--icf-snap-line-color, #ffffff);

    &.is-vertical {
        top: 0;
        bottom: 0;
        left: 50%;
        width: 1px;
        margin-left: -0.5px;
    }
    &.is-horizontal {
        left: 0;
        right: 0;
        top: 50%;
        height: 1px;
        margin-top: -0.5px;
    }
}

.image-crop-frame__spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border-radius: 50%;
    border: 2px solid var(--icf-spinner-color, #6e6e73);
    border-right-color: transparent;
    animation: image-crop-frame-spin 0.8s linear infinite;
    pointer-events: none;
}

// Read by screen readers only
.image-crop-frame__help {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

@keyframes image-crop-frame-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .image-crop-frame__window {
        transition: none;
    }
    .image-crop-frame__spinner {
        animation-duration: 2.4s;
    }
}
</style>
