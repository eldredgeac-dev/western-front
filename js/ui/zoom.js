// zoom.js — pinch to zoom, drag to pan, and tap to select on the map.
//
// We move around the map by changing the SVG's viewBox: the part of the map
// (in map units) that fills the screen. `k` is the zoom: screen pixels per map unit.
// A touch that moves less than TAP_SLOP pixels counts as a tap, not a drag.

const TAP_SLOP = 8;          // px a finger may wander and still be a tap
const MAX_ZOOM = 6;          // × the "fill the screen" zoom (see docs/STYLE.md note in MILESTONES)
// Detail levels (docs/STYLE.md §13), in screen pixels per map unit:
// "far" below MID_ZOOM, "mid" from MID_ZOOM, "near" from NEAR_ZOOM.
const MID_ZOOM = 1.4;
const NEAR_ZOOM = 2.8;

export function enableZoom(svg, { onTap, onViewChange = () => {}, home = null }) {
  const vb = svg.viewBox.baseVal;
  const W = vb.width; const H = vb.height;     // the whole map, in map units
  let view = { x: 0, y: 0, k: 1 };            // top-left corner (map units) and zoom
  let fitted = false;

  const size = () => {
    const r = svg.getBoundingClientRect();
    return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top };
  };
  // Smallest zoom shows the whole map; 1× fills the screen; up to MAX_ZOOM × that.
  const minK = () => { const s = size(); return Math.min(s.w / W, s.h / H); };
  const fillK = () => { const s = size(); return Math.max(s.w / W, s.h / H); };
  const maxK = () => fillK() * MAX_ZOOM;

  // Keep the view on the map (centre it when it's smaller than the screen).
  function clamp() {
    const s = size();
    view.k = Math.min(maxK(), Math.max(minK(), view.k));
    const vw = s.w / view.k; const vh = s.h / view.k;
    view.x = vw >= W ? (W - vw) / 2 : Math.min(W - vw, Math.max(0, view.x));
    view.y = vh >= H ? (H - vh) / 2 : Math.min(H - vh, Math.max(0, view.y));
  }
  function apply() {
    clamp();
    const s = size();
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${s.w / view.k} ${s.h / view.k}`);
    // Labels read this to stay a readable size on screen (css/style.css).
    svg.style.setProperty('--u', String(1 / view.k));
    const level = view.k >= NEAR_ZOOM ? 'near' : view.k >= MID_ZOOM ? 'mid' : 'far';
    for (const l of ['far', 'mid', 'near']) svg.classList.toggle(l, l === level);
    // Tell the map once per frame at most (it tidies up the labels).
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; onViewChange(); }); }
  }
  let pending = false;
  // Zoom by `factor`, keeping the map point under screen point (px, py) still.
  function zoomAt(factor, px, py) {
    const mx = view.x + px / view.k; const my = view.y + py / view.k;
    view.k = Math.min(maxK(), Math.max(minK(), view.k * factor));
    view.x = mx - px / view.k; view.y = my - py / view.k;
    apply();
  }
  // Start view ("Fit"): the `home` area (map units) if given — the whole front
  // line — otherwise fill the screen, centred on the middle of the map.
  function fit() {
    const s = size();
    const area = home && home();
    if (area) {
      const [x, y, w, h] = area;
      const pad = 0.06;
      view.k = Math.min(s.w / (w * (1 + 2 * pad)), s.h / (h * (1 + 2 * pad)));
      view.x = x + w / 2 - s.w / view.k / 2; view.y = y + h / 2 - s.h / view.k / 2;
    } else {
      view.k = fillK();
      view.x = (W - s.w / view.k) / 2; view.y = (H - s.h / view.k) / 2;
    }
    apply();
  }

  // ---- fingers and mouse (pointer events cover both)
  const pointers = new Map();     // pointerId → {x, y}
  let gesture = null;             // what the current touch is doing
  const local = (e) => { const s = size(); return { x: e.clientX - s.left, y: e.clientY - s.top }; };

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, local(e));
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      gesture = { kind: 'maybe-tap', start: pts[0], last: pts[0], target: e.target };
    } else if (pts.length === 2) {
      const [a, b] = pts;
      gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, local(e));
    const pts = [...pointers.values()];
    if (gesture.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      view.x -= (mid.x - gesture.mid.x) / view.k;      // two-finger drag pans too
      view.y -= (mid.y - gesture.mid.y) / view.k;
      zoomAt(dist / (gesture.dist || dist), mid.x, mid.y);
      gesture.dist = dist; gesture.mid = mid;
      return;
    }
    const p = pts[0];
    if (gesture.kind === 'maybe-tap' && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > TAP_SLOP) {
      gesture.kind = 'pan';
    }
    if (gesture.kind === 'pan') {
      view.x -= (p.x - gesture.last.x) / view.k;
      view.y -= (p.y - gesture.last.y) / view.k;
      apply();
    }
    gesture.last = p;
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.kind === 'maybe-tap' && e.type === 'pointerup') {
      const hit = gesture.target.closest?.('[data-box]');
      if (hit) onTap(hit.dataset.box);
    }
    // Lifting one finger of a pinch carries on as a pan with the other.
    if (pointers.size === 1) gesture = { kind: 'pan', last: [...pointers.values()][0] };
    if (pointers.size === 0) gesture = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  // Mouse wheel / trackpad zoom on a computer.
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  // Keyboard: Enter or Space on a focused territory selects it.
  svg.addEventListener('keydown', (e) => {
    const hit = e.target.closest?.('[data-box]');
    if (hit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onTap(hit.dataset.box); }
  });

  // Re-fit when the screen changes size (fold/unfold, rotate): keep the same centre.
  let lastSize = size();
  new ResizeObserver(() => {
    const s = size();
    if (!fitted) { fitted = true; fit(); lastSize = s; return; }
    const cx = view.x + lastSize.w / view.k / 2; const cy = view.y + lastSize.h / view.k / 2;
    view.k *= Math.sqrt((s.w * s.h) / (lastSize.w * lastSize.h || 1));
    view.x = cx - s.w / view.k / 2; view.y = cy - s.h / view.k / 2;
    lastSize = s;
    apply();
  }).observe(svg);

  // For the + / − / fit buttons, and for showing a chosen area (map units).
  const centre = () => { const s = size(); return [s.w / 2, s.h / 2]; };
  return {
    zoomIn: () => zoomAt(1.6, ...centre()),
    zoomOut: () => zoomAt(1 / 1.6, ...centre()),
    fit,
    show(x, y, w, h) {
      const s = size();
      view.k = Math.min(s.w / w, s.h / h);
      view.x = x + w / 2 - s.w / view.k / 2; view.y = y + h / 2 - s.h / view.k / 2;
      apply();
    },
  };
}
