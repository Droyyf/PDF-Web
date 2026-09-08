// icons.js — inline SVG glyphs (1.5px strokes, currentColor) for all toggle/affordance icons.
// Replaces unicode glyphs (○ ☆ ✕ ＋), which vary in weight and shape across platforms —
// these render identically everywhere (audit fix #5, high-end-visual-design §2).

const svg = (body, viewBox = '0 0 16 16') =>
    `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${body}</svg>`;

export const ICONS = {
    circle: svg('<circle cx="8" cy="8" r="5.5"/>'),
    check: svg('<circle cx="8" cy="8" r="5.5"/><path d="M5.2 8.2 L7.2 10.2 L10.8 5.9"/>'),
    star: svg('<path d="M8 1.8 L9.9 5.7 L14.2 6.3 L11.1 9.3 L11.8 13.6 L8 11.6 L4.2 13.6 L4.9 9.3 L1.8 6.3 L6.1 5.7 Z"/>'),
    starFilled: svg('<path d="M8 1.8 L9.9 5.7 L14.2 6.3 L11.1 9.3 L11.8 13.6 L8 11.6 L4.2 13.6 L4.9 9.3 L1.8 6.3 L6.1 5.7 Z" fill="currentColor" stroke="none"/>'),
    x: svg('<path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5"/>'),
    plus: svg('<path d="M8 2.5 V13.5 M2.5 8 H13.5"/>'),
};
