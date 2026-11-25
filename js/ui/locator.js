// locator.js — the small map in the corner (like a campaign game's mini-map): the
// whole map with the territories in their owners' colours and the front line, plus a
// front-red box round the part on screen. Tap it to jump there.
//
// It doesn't copy the map: SVG <use> elements show the big map's own countries,
// territories and front line, so it updates by itself when the war moves on.

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

//   button — the <button> to draw into
//   size   — { w, h } of the whole map, in map units
//   onJump(x, y) — called with the map point that was tapped
export function createLocator(button, size, onJump) {
  const svg = el('svg', { viewBox: `0 0 ${size.w} ${size.h}`, class: 'map-svg locator-svg', 'aria-hidden': 'true' });
  // lines keep a readable width at this small size (see css: --u is "map units per pixel")
  svg.style.setProperty('--u', String(size.w / 100));
  el('rect', { width: size.w, height: size.h, class: 'sea' }, svg);
  el('use', { href: '#countries' }, svg);
  el('use', { href: '#territories' }, svg);
  el('use', { href: '#front' }, svg);
  const view = el('rect', { class: 'locator-box' }, svg);
  button.replaceChildren(svg);

  button.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect();
    onJump(((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h);
  });

  // Outline the part on screen: [x, y, w, h] in map units.
  return function show([x, y, w, h]) {
    const x0 = Math.max(0, x); const y0 = Math.max(0, y);
    view.setAttribute('x', x0); view.setAttribute('y', y0);
    view.setAttribute('width', Math.max(0, Math.min(size.w, x + w) - x0));
    view.setAttribute('height', Math.max(0, Math.min(size.h, y + h) - y0));
  };
}
