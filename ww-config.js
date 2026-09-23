export default {
    type: 'wwObject',
    editor: {
        label: { en: 'Image crop frame' },
        icon: 'image',
        customSettingsPropertiesOrder: [
            'imageUrl',
            'alt',
            'ariaLabel',
            ['imageWidth', 'imageHeight'],
            'ratio',
            ['focusX', 'focusY'],
            ['snapToCenter', 'snapDistance'],
            'darken',
            ['overlay', 'gridDivisions', 'overlayFlipH', 'overlayFlipV', 'overlayOpacity'],
            'disabled',
        ],
        customStylePropertiesOrder: ['frameColor', 'overlayColor', 'snapLineColor', 'spinnerColor'],
    },
    // Style-panel colors, compiled by WeWeb per breakpoint / state / class
    css({ content }) {
        return [
            { property: '--icf-frame-color', value: content.frameColor },
            { property: '--icf-overlay-color', value: content.overlayColor },
            { property: '--icf-snap-line-color', value: content.snapLineColor },
            { property: '--icf-spinner-color', value: content.spinnerColor },
        ];
    },
    states: [
        { label: 'dragging', selector: '&[data-dragging="true"]' },
        { label: 'disabled', selector: '&[aria-disabled="true"]' },
    ],
    staticRendering: true,
    options: { displayAllowedValues: ['flex', 'inline-flex'] },
    inherit: { type: 'ww-layout' },
    triggerEvents: [
        {
            name: 'change',
            label: { en: 'On crop change' },
            event: { value: { x: 0.5, y: 0.5 } },
            default: true,
        },
    ],
    actions: [
        { label: { en: 'Center crop' }, action: 'centerCrop' },
        {
            label: { en: 'Set focus point' },
            action: 'setFocus',
            args: [
                { name: 'x', type: 'number', label: { en: 'X (0–1, empty = keep)' } },
                { name: 'y', type: 'number', label: { en: 'Y (0–1, empty = keep)' } },
            ],
        },
    ],
    properties: {
        imageUrl: {
            label: { en: 'Image URL' },
            type: 'Text',
            section: 'settings',
            bindable: true,
            defaultValue: 'https://cdn.weweb.app/public/images/no_image_selected.png',
            /* wwEditor:start */
            bindingValidation: { type: 'string', tooltip: 'URL of the image to show' },
            propertyHelp: { tooltip: 'Image shown behind the crop window.' },
            /* wwEditor:end */
        },
        alt: {
            label: { en: 'Alt text' },
            type: 'Text',
            section: 'settings',
            bindable: true,
            defaultValue: '',
            /* wwEditor:start */
            bindingValidation: { type: 'string', tooltip: 'Alternative text of the image' },
            propertyHelp: { tooltip: 'Alternative text for screen readers.' },
            /* wwEditor:end */
        },
        ariaLabel: {
            label: { en: 'Crop area label' },
            type: 'Text',
            section: 'settings',
            bindable: true,
            defaultValue: '',
            /* wwEditor:start */
            bindingValidation: { type: 'string', tooltip: 'Accessible name of the crop window' },
            propertyHelp: {
                tooltip: 'What screen readers call the crop window. Empty = the element name, else "Crop area".',
            },
            /* wwEditor:end */
        },
        imageWidth: {
            label: { en: 'Image width' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, step: 1, noRange: true },
            bindable: true,
            defaultValue: null,
            /* wwEditor:start */
            bindingValidation: {
                type: 'number',
                tooltip: 'Width of the original in px. Empty = read from the loaded image.',
            },
            propertyHelp: {
                tooltip: 'With the height: the aspect ratio before the image has loaded, and the output size in px (local context).',
            },
            /* wwEditor:end */
        },
        imageHeight: {
            label: { en: 'Image height' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, step: 1, noRange: true },
            bindable: true,
            defaultValue: null,
            /* wwEditor:start */
            bindingValidation: {
                type: 'number',
                tooltip: 'Height of the original in px. Empty = read from the loaded image.',
            },
            propertyHelp: { tooltip: 'Height of the original image.' },
            /* wwEditor:end */
        },
        ratio: {
            label: { en: 'Crop ratio' },
            type: 'Text',
            section: 'settings',
            bindable: true,
            defaultValue: '4:3',
            /* wwEditor:start */
            bindingValidation: {
                type: 'string',
                tooltip: 'Width:height of the crop, e.g. "4:5", "16:9", or a number like 0.8. Empty = 4:3.',
            },
            propertyHelp: { tooltip: 'Aspect ratio of the crop window.' },
            /* wwEditor:end */
        },
        focusX: {
            label: { en: 'Focus X' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, max: 1, step: 0.01 },
            bindable: true,
            defaultValue: null,
            /* wwEditor:start */
            bindingValidation: {
                type: 'number',
                tooltip: 'Horizontal centre of the crop, 0 (left) to 1 (right). Empty = 0.5.',
            },
            propertyHelp: {
                tooltip: 'Bind to the saved value. While the user drags, and until this value changes, the component shows its own position.',
            },
            /* wwEditor:end */
        },
        focusY: {
            label: { en: 'Focus Y' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, max: 1, step: 0.01 },
            bindable: true,
            defaultValue: null,
            /* wwEditor:start */
            bindingValidation: {
                type: 'number',
                tooltip: 'Vertical centre of the crop, 0 (top) to 1 (bottom). Empty = 0.5.',
            },
            propertyHelp: { tooltip: 'Saved vertical focus point.' },
            /* wwEditor:end */
        },
        snapToCenter: {
            label: { en: 'Snap to middle' },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
            defaultValue: false,
            /* wwEditor:start */
            bindingValidation: { type: 'boolean', tooltip: 'true to snap the crop to the image centre while dragging' },
            propertyHelp: {
                tooltip: 'While dragging, the crop sticks to the middle of the image when it gets close, and a centre line shows.',
            },
            /* wwEditor:end */
        },
        snapDistance: {
            label: { en: 'Snap distance (px)' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, max: 50, step: 1 },
            bindable: true,
            defaultValue: 8,
            hidden: content => !content?.snapToCenter,
            /* wwEditor:start */
            bindingValidation: { type: 'number', tooltip: 'Distance in px (on screen) at which the crop snaps' },
            propertyHelp: { tooltip: 'How close (in screen px) the crop centre must get to the image centre to snap.' },
            /* wwEditor:end */
        },
        darken: {
            label: { en: 'Darken outside (%)' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, max: 100, step: 1 },
            bindable: true,
            defaultValue: 45,
            /* wwEditor:start */
            bindingValidation: { type: 'number', tooltip: '0–100: how dark the area outside the crop is' },
            propertyHelp: { tooltip: 'Opacity of the shade over the area outside the crop.' },
            /* wwEditor:end */
        },
        overlay: {
            label: { en: 'Overlay' },
            type: 'TextSelect',
            section: 'settings',
            options: {
                options: [
                    { value: 'none', label: { en: 'None' } },
                    { value: 'thirds', label: { en: 'Rule of thirds' } },
                    { value: 'golden', label: { en: 'Golden ratio (phi grid)' } },
                    { value: 'grid', label: { en: 'Grid' } },
                    { value: 'diagonal', label: { en: 'Diagonals' } },
                    { value: 'triangle', label: { en: 'Golden triangle' } },
                    { value: 'spiral', label: { en: 'Golden spiral' } },
                    { value: 'center', label: { en: 'Center cross' } },
                ],
            },
            bindable: true,
            defaultValue: 'thirds',
            /* wwEditor:start */
            bindingValidation: {
                type: 'string',
                tooltip: 'none | thirds | golden | grid | diagonal | triangle | spiral | center',
            },
            propertyHelp: { tooltip: 'Composition guide drawn inside the crop window.' },
            /* wwEditor:end */
        },
        gridDivisions: {
            label: { en: 'Grid cells (short side)' },
            type: 'Number',
            section: 'settings',
            options: { min: 2, max: 12, step: 1 },
            bindable: true,
            defaultValue: 4,
            hidden: content => content?.overlay !== 'grid',
            /* wwEditor:start */
            bindingValidation: { type: 'number', tooltip: 'Number of square cells along the short side (2–12)' },
            propertyHelp: { tooltip: 'Square cells; the long side gets as many as fit.' },
            /* wwEditor:end */
        },
        overlayFlipH: {
            label: { en: 'Flip horizontally' },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
            defaultValue: false,
            hidden: content => !['triangle', 'spiral'].includes(content?.overlay),
            /* wwEditor:start */
            bindingValidation: { type: 'boolean', tooltip: 'Mirror the triangle / spiral left–right' },
            propertyHelp: { tooltip: 'Mirror the guide left–right to match the subject.' },
            /* wwEditor:end */
        },
        overlayFlipV: {
            label: { en: 'Flip vertically' },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
            defaultValue: false,
            hidden: content => !['triangle', 'spiral'].includes(content?.overlay),
            /* wwEditor:start */
            bindingValidation: { type: 'boolean', tooltip: 'Mirror the triangle / spiral top–bottom' },
            propertyHelp: { tooltip: 'Mirror the guide top–bottom to match the subject.' },
            /* wwEditor:end */
        },
        overlayOpacity: {
            label: { en: 'Overlay opacity (%)' },
            type: 'Number',
            section: 'settings',
            options: { min: 0, max: 100, step: 1 },
            bindable: true,
            defaultValue: 40,
            hidden: content => content?.overlay === 'none',
            /* wwEditor:start */
            bindingValidation: { type: 'number', tooltip: '0–100' },
            propertyHelp: { tooltip: 'Opacity of the guide lines.' },
            /* wwEditor:end */
        },
        disabled: {
            label: { en: 'Disable moving' },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
            defaultValue: false,
            /* wwEditor:start */
            bindingValidation: { type: 'boolean', tooltip: 'true to lock the crop' },
            propertyHelp: { tooltip: 'When on, the crop cannot be moved by the user (actions still work).' },
            /* wwEditor:end */
        },
        frameColor: {
            label: { en: 'Crop border color' },
            type: 'Color',
            section: 'style',
            responsive: true,
            states: true,
            classes: true,
            bindable: true,
            defaultValue: '#FFFFFF',
            /* wwEditor:start */
            bindingValidation: { cssSupports: 'color', type: 'string', tooltip: 'CSS color' },
            propertyHelp: { tooltip: 'Border (and keyboard focus ring) of the crop window.' },
            /* wwEditor:end */
        },
        overlayColor: {
            label: { en: 'Overlay color' },
            type: 'Color',
            section: 'style',
            responsive: true,
            states: true,
            classes: true,
            bindable: true,
            defaultValue: '#FFFFFF',
            /* wwEditor:start */
            bindingValidation: { cssSupports: 'color', type: 'string', tooltip: 'CSS color' },
            propertyHelp: { tooltip: 'Color of the guide lines (see Overlay opacity).' },
            /* wwEditor:end */
        },
        snapLineColor: {
            label: { en: 'Snap line color' },
            type: 'Color',
            section: 'style',
            responsive: true,
            states: true,
            classes: true,
            bindable: true,
            defaultValue: '#FFFFFF',
            hidden: content => !content?.snapToCenter,
            /* wwEditor:start */
            bindingValidation: { cssSupports: 'color', type: 'string', tooltip: 'CSS color' },
            propertyHelp: { tooltip: 'Centre line shown while the crop is snapped (see Snap to middle).' },
            /* wwEditor:end */
        },
        spinnerColor: {
            label: { en: 'Loading spinner color' },
            type: 'Color',
            section: 'style',
            responsive: true,
            states: true,
            classes: true,
            bindable: true,
            defaultValue: '#6E6E73',
            /* wwEditor:start */
            bindingValidation: { cssSupports: 'color', type: 'string', tooltip: 'CSS color' },
            propertyHelp: { tooltip: 'Spinner shown until the image has loaded.' },
            /* wwEditor:end */
        },
    },
};
