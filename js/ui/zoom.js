// zoom.js — pinch to zoom, drag to pan, and tap to select on the map.
//
// We move around the map by changing the SVG's viewBox: the part of the map
// (in map units) that fills the screen. `k` is the zoom: screen pixels per map unit.
// A touch that moves less than TAP_SLOP pixels counts as a tap, not a drag.

const TAP_SLOP = 8;          // px a finger may wander and still be a tap
const MAX_ZOOM = 9;          // × the "fill the screen" zoom (the map is bigger now, so more room)
const START_ZOOM = 1.6;      // screen pixels per map unit at the start: mid detail, close in
// Detail levels (docs/STYLE.md §13), in screen pixels per map unit:
// "far" below MID_ZOOM, "mid" from MID_ZOOM, "near" from NEAR_ZOOM.
const MID_ZOOM = 1.4;
const NEAR_ZOOM = 2.8;

// Does the phone ask for less motion (Settings → Accessibility → Reduce Motion)?
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

//   onTap(boxId)      — a territory was tapped
//   onViewChange(k)   — the view moved (k = screen pixels per map unit)
//   home()            — the area [x, y, w, h] the "Front" button shows (the front line)
//   start()           — the point [x, y] to start on (map units), or null for home
export function enableZoom(svg, { onTap, onViewChange = () => {}, home = null, start = null }) {
  const vb = svg.viewBox.baseVal;
  const W = vb.width; const H = vb.height;     // the whole map, in map units
  let view = { x: 0, y: 0, k: 1 };            // top-left corner (map units) and zoom
  let fitted = false;

  const size = () => {
    const r = svg.getBoundingClientRect();
    return { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top };
  };
  // The map always fills the screen (like a campaign map you pan around): the smallest
  // zoom is "fill the screen"; the largest is MAX_ZOOM × that.
  const minK = () => { const s = size(); return Math.max(s.w / W, s.h / H); };
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
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; onViewChange(view.k); }); }
  }
  let pending = false;
  // Zoom by `factor`, keeping the map point under screen point (px, py) still.
  function zoomAt(factor, px, py) {
    const mx = view.x + px / view.k; const my = view.y + py / view.k;
    view.k = Math.min(maxK(), Math.max(minK(), view.k * factor));
    view.x = mx - px / view.k; view.y = my - py / view.k;
    apply();
  }
  // "Front": show the whole front line (the `home` area), or fill the screen.
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
  // The first view: zoomed in at mid detail on the `start` point (or the whole front).
  function startView() {
    const at = start && start();
    if (!at) { fit(); return; }
    const s = size();
    view.k = Math.max(START_ZOOM, minK());
    view.x = at[0] - s.w / view.k / 2; view.y = at[1] - s.h / view.k / 2;
    apply();
  }
  // Pan by (dx, dy) screen pixels.
  function panBy(dx, dy) { view.x += dx / view.k; view.y += dy / view.k; apply(); }

  // A flick keeps the map gliding for a moment, slowing down (none with Reduce Motion).
  let glide = null;
  function stopGlide() { if (glide) cancelAnimationFrame(glide.frame); glide = null; }
  function startGlide(vx, vy) {
    if (reduceMotion() || Math.hypot(vx, vy) < 0.3) return;
    glide = { vx, vy, t: performance.now() };
    const step = (now) => {
      const dt = Math.min(40, now - glide.t); glide.t = now;
      panBy(-glide.vx * dt, -glide.vy * dt);
      const slow = Math.pow(0.992, dt);                    // slows to a stop in ~0.6 s
      glide.vx *= slow; glide.vy *= slow;
      if (Math.hypot(glide.vx, glide.vy) < 0.02) { glide = null; return; }
      glide.frame = requestAnimationFrame(step);
    };
    glide.frame = requestAnimationFrame(step);
  }

  // ---- fingers and mouse (pointer events cover both)
  const pointers = new Map();     // pointerId → {x, y}
  let gesture = null;             // what the current touch is doing
  const local = (e) => { const s = size(); return { x: e.clientX - s.left, y: e.clientY - s.top }; };

  svg.addEventListener('pointerdown', (e) => {
    stopGlide();
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
      // remember the finger's speed (pixels per ms), smoothed, for the glide
      const now = performance.now(); const dt = Math.max(1, now - (gesture.time || now - 16));
      const vx = (p.x - gesture.last.x) / dt; const vy = (p.y - gesture.last.y) / dt;
      gesture.v = gesture.v ? [gesture.v[0] * 0.6 + vx * 0.4, gesture.v[1] * 0.6 + vy * 0.4] : [vx, vy];
      gesture.time = now;
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
    // A one-finger pan that ends while still moving glides on.
    if (pointers.size === 0 && gesture && gesture.kind === 'pan' && gesture.v && performance.now() - gesture.time < 60) {
      startGlide(gesture.v[0], gesture.v[1]);
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
  // Arrow keys pan the map on a computer (when no text box has the keyboard).
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (!ARROWS[e.key] || svg.getBoundingClientRect().width === 0 || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    e.preventDefault();
    panBy(ARROWS[e.key][0] * 80, ARROWS[e.key][1] * 80);
  });

  // Re-fit when the screen changes size (fold/unfold, rotate): keep the same centre.
  let lastSize = size();
  new ResizeObserver(() => {
    const s = size();
    if (!fitted) { fitted = true; startView(); lastSize = s; return; }
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
    startView,
    // the part of the map on screen now, in map units: [x, y, w, h]
    current() { const s = size(); return [view.x, view.y, s.w / view.k, s.h / view.k]; },
    // centre the view on a point (map units), keeping the zoom
    centreOn(x, y) { const s = size(); view.x = x - s.w / view.k / 2; view.y = y - s.h / view.k / 2; apply(); },
    show(x, y, w, h) {
      const s = size();
      view.k = Math.min(s.w / w, s.h / h);
      view.x = x + w / 2 - s.w / view.k / 2; view.y = y + h / 2 - s.h / view.k / 2;
      apply();
    },
  };
}
