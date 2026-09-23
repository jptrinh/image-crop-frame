<template>
    <div
        ref="root"
        class="image-crop-frame"
        :data-dragging="isDragging ? 'true' : null"
        :aria-disabled="isDisabled ? 'true' : null"
    >
        <div
            v-if="imageUrl"
            ref="box"
            class="image-crop-frame__box"
            :class="{ 'is-movable': canMove, 'is-dragging': isDragging }"
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
                :src="imageUrl"
                :alt="content?.alt ?? ''"
                draggable="false"
                @load="onImageLoad"
            />
            <div
                class="image-crop-frame__window"
                :style="windowStyle"
                :tabindex="canMove ? 0 : -1"
                role="group"
                aria-roledescription="crop area"
                :aria-label="accessibleName"
                :aria-describedby="canMove ? helpId : null"
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
            <span :id="helpId" class="image-crop-frame__help">
                Drag, or use the arrow keys (Shift for bigger steps), to move the crop. Double-click to centre it.
            </span>
        </div>
    </div>
</template>

<script>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { overlayPath } from './overlays.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = value => Math.round(value * 10000) / 10000;
// A focus coordinate: a number between 0 and 1, anything else counts as "not set"
const toFraction = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, 0, 1) : null;
};
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

        const boxSize = computed(() => {
            const { width, height } = available.value;
            if (!width || !height) return null;
            const scale = Math.min(width / imageRatio.value, height);
            return { width: scale * imageRatio.value, height: scale };
        });

        /* ---------- Crop window ---------- */
        // Share of the image the crop keeps: the largest box of the target ratio
        const cropSize = computed(() => {
            const target = parseRatio(props.content?.ratio);
            return imageRatio.value > target
                ? { width: target / imageRatio.value, height: 1 }
                : { width: 1, height: imageRatio.value / target };
        });
        const canMoveX = computed(() => cropSize.value.width < 0.9999);
        const canMoveY = computed(() => cropSize.value.height < 0.9999);
        const canMove = computed(
            () => !isEditing.value && !isDisabled.value && (canMoveX.value || canMoveY.value)
        );

        // Focus point = centre of the crop (0–1). The bound value, unless the user just moved it
        const boundFocus = computed(() => ({
            x: toFraction(props.content?.focusX) ?? 0.5,
            y: toFraction(props.content?.focusY) ?? 0.5,
        }));
        const localFocus = ref(null);
        const isDragging = ref(false);
        // A new bound value (saved, reloaded, other image) takes over from the local one.
        // Keyed on primitives, so a re-evaluated binding with the same values changes nothing.
        watch(
            () => [imageUrl.value, toFraction(props.content?.focusX), toFraction(props.content?.focusY)],
            () => {
                if (!isDragging.value) localFocus.value = null;
            }
        );
        const focus = computed(() => localFocus.value ?? boundFocus.value);

        // Crop box position: kept as centred on the focus point as the image allows
        // (same rule as imgproxy's fp gravity)
        const cropRect = computed(() => {
            const { width, height } = cropSize.value;
            return {
                left: clamp(focus.value.x - width / 2, 0, 1 - width),
                top: clamp(focus.value.y - height / 2, 0, 1 - height),
                width,
                height,
            };
        });

        /* ---------- Internal variable ---------- */
        const variableValue = computed(() => {
            const rect = cropRect.value;
            return {
                focusX: round4(focus.value.x),
                focusY: round4(focus.value.y),
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
                crop: variableValue.value,
                output: size
                    ? { width: Math.round(size.width * rect.width), height: Math.round(size.height * rect.height) }
                    : null,
                trim: { axis: trimmedAxis, percent: Math.round(trimmed * 100) },
                ratio: round4(parseRatio(props.content?.ratio)),
                isDragging: isDragging.value,
                isLoaded: isLoaded.value,
            };
        });
        const markdown = `### Image crop frame

#### focus
Current focus point (centre of the crop), live while dragging: \`{ x, y }\`, 0–1.

#### crop
Crop box as fractions of the image: \`{ focusX, focusY, left, top, width, height }\`.

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
            emit('trigger-event', {
                name: 'change',
                event: { value: { x: round4(focus.value.x), y: round4(focus.value.y) } },
            });
        };

        // Move the crop box to a new top-left corner (fractions), only along the axes that can move.
        // The other axis keeps its stored value, so a later ratio change still has it.
        const moveTo = (left, top) => {
            const { width, height } = cropSize.value;
            localFocus.value = {
                x: canMoveX.value ? clamp(left, 0, 1 - width) + width / 2 : focus.value.x,
                y: canMoveY.value ? clamp(top, 0, 1 - height) + height / 2 : focus.value.y,
            };
        };

        /* ---------- Drag ---------- */
        let drag = null;
        const onMouseDown = event => {
            // Don't let a mouse drag focus the crop: arrow keys keep doing what the page wants
            if (canMove.value) event.preventDefault();
        };
        const onPointerDown = event => {
            if (!canMove.value || event.button !== 0) return;
            const rect = box.value?.getBoundingClientRect?.();
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
                width: rect.width,
                height: rect.height,
                startFocus: { ...focus.value },
            };
            isDragging.value = true;
        };
        const onPointerMove = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            moveTo(
                drag.startLeft + (event.clientX - drag.startX) / drag.width,
                drag.startTop + (event.clientY - drag.startY) / drag.height
            );
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
            if (moved) emitChange();
        };

        /* ---------- Actions ---------- */
        // Set the focus point from a workflow; an empty coordinate keeps its current value
        const setFocus = (x, y) => {
            const next = { x: toFraction(x) ?? focus.value.x, y: toFraction(y) ?? focus.value.y };
            if (round4(next.x) === round4(focus.value.x) && round4(next.y) === round4(focus.value.y)) return;
            localFocus.value = next;
            emitChange();
        };
        const centerCrop = () => setFocus(0.5, 0.5);
        const onDoubleClick = () => {
            if (canMove.value) centerCrop();
        };

        /* ---------- Keyboard (when focused with Tab) ---------- */
        let keyTimer = null;
        const onKeyDown = event => {
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
            // One change event once the keys stop, not one per press
            clearTimeout(keyTimer);
            keyTimer = setTimeout(emitChange, 400);
        };
        onBeforeUnmount(() => clearTimeout(keyTimer));

        /* ---------- Overlay ---------- */
        const overlayType = computed(() => props.content?.overlay ?? 'thirds');
        const windowPx = computed(() =>
            boxSize.value
                ? {
                      width: boxSize.value.width * cropRect.value.width,
                      height: boxSize.value.height * cropRect.value.height,
                  }
                : null
        );
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
        const boxStyle = computed(() =>
            boxSize.value
                ? { width: `${boxSize.value.width}px`, height: `${boxSize.value.height}px` }
                : { width: '100%', aspectRatio: String(imageRatio.value) }
        );
        const windowStyle = computed(() => {
            const rect = cropRect.value;
            const darken = clamp(Number(props.content?.darken ?? 45) || 0, 0, 100) / 100;
            const overlayOpacity = clamp(Number(props.content?.overlayOpacity ?? 40) || 0, 0, 100) / 100;
            return {
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
                // Darken everything outside the crop: a huge shadow clipped by the box
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${darken})`,
                '--icf-overlay-opacity': overlayOpacity,
            };
        });

        /* ---------- Accessibility ---------- */
        const accessibleName = computed(
            () => props.content?.ariaLabel?.trim() || props.wwElementState?.name || 'Crop area'
        );
        const helpId = computed(() => `image-crop-frame-help-${props.uid}`);

        return {
            root,
            box,
            imageUrl,
            isDisabled,
            isLoaded,
            onImageLoad,
            canMove,
            isDragging,
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
            windowStyle,
            accessibleName,
            helpId,
            // Actions (ww-config `actions`)
            setFocus,
            centerCrop,
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

.image-crop-frame__window {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--icf-frame-color, #ffffff);
    transition: left 150ms ease, top 150ms ease, width 150ms ease, height 150ms ease;

    .is-dragging & {
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
