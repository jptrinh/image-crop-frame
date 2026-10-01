import { createApp, reactive, h } from 'vue';
import Comp from './out/wwElement.script.js';
import { render } from './out/wwElement.template.js';

Comp.render = render;

// Just enough of wwLib for the component
window.wwLib = {
    getFrontWindow: () => window,
    getFrontDocument: () => document,
    wwVariable: {
        useComponentVariable: () => ({ setValue: value => (window.__var = JSON.parse(JSON.stringify(value))) }),
    },
    wwElement: { useRegisterElementLocalContext: (name, data) => (window.__ctx = data) },
};
window.__events = [];

// Test picture: 2:3 portrait with a grid, a disc and labelled corners, so moves and zooms are easy to read
const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#e8a87c'/><stop offset='1' stop-color='#41b3a3'/></linearGradient></defs>
<rect width='400' height='600' fill='url(#g)'/>
${Array.from({ length: 11 }, (_, i) => `<line x1='0' y1='${i * 60}' x2='400' y2='${i * 60}' stroke='white' stroke-opacity='.5'/>`).join('')}
${Array.from({ length: 9 }, (_, i) => `<line x1='${i * 50}' y1='0' x2='${i * 50}' y2='600' stroke='white' stroke-opacity='.5'/>`).join('')}
<circle cx='160' cy='240' r='70' fill='#c0392b'/><text x='20' y='40' font-size='28'>TOP-LEFT</text><text x='200' y='590' font-size='28'>BOTTOM</text></svg>`;

window.content = reactive({
    imageUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    imageWidth: 4160,
    imageHeight: 6240,
    ratio: '4:5',
    focusX: 0.5,
    focusY: 0.4,
    zoom: null,
    zoomEnabled: true,
    minOutputWidth: 1080,
    minOutputHeight: 0,
    framePadding: 16,
    darken: 45,
    overlay: 'thirds',
    overlayOpacity: 40,
    snapToCenter: false,
    snapDistance: 8,
    gridDivisions: 4,
    disabled: false,
});

const Root = {
    render: () =>
        h('div', { style: 'width:600px;height:500px;background:#222;position:relative' }, [
            h(Comp, {
                uid: 'harness',
                content: window.content,
                wwEditorState: { isEditing: false },
                onTriggerEvent: event => window.__events.push(JSON.parse(JSON.stringify(event))),
            }),
        ]),
};
createApp(Root).mount('#app');
