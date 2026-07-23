/*
 * SvgImport — turn SVG artwork into engine vertex arrays.
 *
 * The engine renders vector objects from flat {x,y} point arrays (see
 * VectorGameObject). This converts an SVG's drawable elements into such arrays
 * by leaning on the browser's own SVG geometry engine: path / rect / circle /
 * ellipse / line / polyline / polygon are all SVGGeometryElements, so
 * getTotalLength() + getPointAtLength() sample each outline uniformly — Bézier
 * curves, arcs and primitives alike — with no path-data parser to maintain.
 * Element/group transforms are honored through getCTM().
 *
 * Pipeline:
 *   const { shapes, bounds } = await loadSvg('media/svg/logo.svg', { sampleDistance: 3 });
 *   const norm = normalizeShapes(shapes, { targetSize: 120 });      // centre + scale
 *   const objs = svgToVectorObjects(gs, norm, { x, y, strokeWeight: 1.5 });
 *   objs.forEach(o => gs.gameLoop.addRenderSystem('svg', o, 20));    // or render yourself
 *
 * Each returned shape is a polyline (closed shapes come back closed, minus the
 * duplicate final point — VectorGameObject's closeShape reconnects them). Runs
 * in the browser only (needs the DOM/SVG layout APIs).
 */

import VectorGameObject from "../VectorGameObject.js";

const SVG_NS = 'http://www.w3.org/2000/svg';
const GEOM_SELECTOR = 'path, rect, circle, ellipse, line, polyline, polygon';

// Closed shapes shouldn't emit their duplicate final point (start === end).
function isClosed(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'polygon' || tag === 'rect' || tag === 'circle' || tag === 'ellipse') return true;
  if (tag === 'path') return /z/i.test(el.getAttribute('d') || '');
  return false; // line, polyline are open
}

// Map a local point through the element's CTM into the root viewBox user space.
function applyCTM(ctm, x, y) {
  if (!ctm) return { x, y };
  return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f };
}

function sampleElement(el, sampleDistance, minSamples) {
  let total;
  try { total = el.getTotalLength(); } catch (e) { return []; }
  if (!isFinite(total) || total <= 0) return [];

  const ctm = el.getCTM();
  const steps = Math.max(minSamples, Math.ceil(total / sampleDistance));
  const closed = isClosed(el);
  const upto = closed ? steps - 1 : steps;   // drop duplicate closing vertex

  const pts = [];
  for (let i = 0; i <= upto; i++) {
    const p = el.getPointAtLength((i / steps) * total);
    pts.push(applyCTM(ctm, p.x, p.y));
  }
  return pts;
}

// Parse SVG markup into an array of polyline shapes plus a combined bounds.
// opts: { sampleDistance = 3 (px between samples), minSamples = 8 }
export function parseSvg(text, opts = {}) {
  const sampleDistance = opts.sampleDistance ?? 3;
  const minSamples = opts.minSamples ?? 8;

  // Parse without running scripts (DOMParser is inert), then move a live copy
  // offscreen so the geometry/CTM layout APIs are available.
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) {
    throw new Error('SVG parse error');
  }

  const holder = document.createElement('div');
  // Offscreen but still in the render tree (display:none would null out getCTM).
  holder.style.cssText = 'position:absolute; left:-99999px; top:0; width:0; height:0; overflow:hidden;';
  document.body.appendChild(holder);

  const shapes = [];
  try {
    const liveSvg = document.importNode(parsed.documentElement, true);
    holder.appendChild(liveSvg);
    liveSvg.querySelectorAll(GEOM_SELECTOR).forEach((el) => {
      const pts = sampleElement(el, sampleDistance, minSamples);
      if (pts.length >= 2) shapes.push(pts);
    });
  } finally {
    document.body.removeChild(holder);
  }

  return { shapes, bounds: boundsOf(shapes) };
}

// Fetch and parse an SVG file.
export async function loadSvg(url, opts = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SVG fetch failed (${res.status}): ${url}`);
  return parseSvg(await res.text(), opts);
}

// Combined bounding box over all shapes' points.
export function boundsOf(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of shapes) {
    for (const p of shape) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// Recentre (and optionally scale/flip) shapes about their combined centre, so
// multiple shapes placed at one position reconstruct the artwork's layout.
// opts: { center = true, targetSize (fit longest side), scale, flipY = false }
export function normalizeShapes(shapes, opts = {}) {
  const b = boundsOf(shapes);
  const cx = opts.center === false ? 0 : b.cx;
  const cy = opts.center === false ? 0 : b.cy;

  let s = 1;
  if (opts.targetSize) s = opts.targetSize / (Math.max(b.width, b.height) || 1);
  else if (typeof opts.scale === 'number') s = opts.scale;

  const fy = opts.flipY ? -1 : 1;   // SVG y is already down, like the canvas
  return shapes.map((shape) => shape.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s * fy })));
}

// Build one VectorGameObject per shape, all sharing a position. Feed shapes
// through normalizeShapes first so they sit around the origin.
// opts: { x, y, strokeWeight = 1, fill = false, alpha = 255, scale = 1, closeShape = true }
export function svgToVectorObjects(gameSession, shapes, opts = {}) {
  const x = opts.x ?? gameSession.canvasWidth / 2;
  const y = opts.y ?? gameSession.canvasHeight / 2;
  return shapes.map((shape) => new VectorGameObject(
    gameSession, x, y, shape,
    opts.closeShape !== false,
    opts.strokeWeight ?? 1,
    opts.fill ?? false,
    0,
    opts.scale ?? 1,
    opts.alpha ?? 255,
  ));
}
