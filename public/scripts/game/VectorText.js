/*
 * VectorText — tiny hand-drawn-style polyline font.
 *
 * Each glyph is a list of strokes; each stroke is a polyline of [x, y]
 * coordinates in a unit cell (x ∈ [0, ~0.65], y ∈ [0.2, 1.3] where 0.2 is
 * the top of an ascender, 1.0 is the baseline, and 1.3 is the bottom of a
 * descender). Rendering scales the unit cell by `sizePx`.
 *
 * This is a minimal alphabet — only the letters needed for the current HUD
 * are defined. Add more on demand.
 */

const LETTERS = {
    a: {
        width: 0.6,
        strokes: [
            [[0.55, 0.55], [0.4, 0.45], [0.1, 0.45], [0, 0.55], [0, 0.85], [0.1, 0.95], [0.55, 0.95]],
            [[0.55, 0.45], [0.55, 0.95]],
        ],
    },
    c: {
        width: 0.6,
        strokes: [
            [[0.55, 0.55], [0.4, 0.45], [0.1, 0.45], [0, 0.55], [0, 0.85], [0.1, 0.95], [0.5, 0.95]],
        ],
    },
    e: {
        width: 0.6,
        strokes: [
            [[0, 0.7], [0.55, 0.7], [0.55, 0.55], [0.4, 0.45], [0.1, 0.45], [0, 0.55], [0, 0.85], [0.1, 0.95], [0.55, 0.95]],
        ],
    },
    h: {
        width: 0.6,
        strokes: [
            [[0.05, 0.2], [0.05, 0.95]],
            [[0.05, 0.6], [0.15, 0.5], [0.4, 0.45], [0.55, 0.55], [0.55, 0.95]],
        ],
    },
    o: {
        width: 0.65,
        strokes: [
            [[0.3, 0.45], [0.1, 0.5], [0, 0.6], [0, 0.8], [0.1, 0.92], [0.3, 0.95], [0.5, 0.92], [0.6, 0.8], [0.6, 0.6], [0.5, 0.5], [0.3, 0.45]],
        ],
    },
    p: {
        width: 0.65,
        strokes: [
            [[0.05, 0.45], [0.05, 1.3]],
            [[0.05, 0.45], [0.5, 0.45], [0.6, 0.55], [0.6, 0.7], [0.5, 0.8], [0.05, 0.8]],
        ],
    },
    s: {
        width: 0.6,
        strokes: [
            [[0.6, 0.5], [0.5, 0.45], [0.1, 0.45], [0, 0.55], [0.05, 0.65], [0.55, 0.7], [0.6, 0.8], [0.5, 0.95], [0, 0.95]],
        ],
    },
    t: {
        width: 0.45,
        strokes: [
            [[0.2, 0.25], [0.2, 0.85], [0.35, 0.95]],
            [[0, 0.45], [0.4, 0.45]],
        ],
    },
};

const LETTER_SPACING = 0.15;
const SPACE_WIDTH = 0.4;

// Returns the unit-width of `text` (in glyph-cell units) so the caller can
// align right / center the text without manual measurement.
export function measureText(text) {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ') {
            w += SPACE_WIDTH;
            continue;
        }
        const g = LETTERS[ch];
        if (!g) continue;
        w += g.width;
        if (i < text.length - 1) w += LETTER_SPACING;
    }
    return w;
}

// Render `text` with its top-left at (x, y) using one full unit = sizePx.
// p5 stroke / strokeWeight / strokeCap should be set by the caller.
export function renderText(p, text, x, y, sizePx) {
    let cursorX = x;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ') {
            cursorX += SPACE_WIDTH * sizePx;
            continue;
        }
        const g = LETTERS[ch];
        if (!g) continue;
        for (const stroke of g.strokes) {
            for (let j = 0; j < stroke.length - 1; j++) {
                const [ax, ay] = stroke[j];
                const [bx, by] = stroke[j + 1];
                p.line(
                    cursorX + ax * sizePx,
                    y + ay * sizePx,
                    cursorX + bx * sizePx,
                    y + by * sizePx,
                );
            }
        }
        cursorX += g.width * sizePx;
        if (i < text.length - 1) cursorX += LETTER_SPACING * sizePx;
    }
}
