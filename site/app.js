'use strict';
/* Tibetan Self-Immolations: A Visual Record — radial graph.
   Data: window.VISUAL_RECORD (built by scripts/build_records.py).
   Camera model: screen = C + T + k · R(rot) · world, where C is the viewport centre. */
(() => {
  const DATA = window.VISUAL_RECORD;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeURL = v => { try { const u = new URL(v, location.href); return /^(https?|file):$/.test(u.protocol) ? u.href : '#'; } catch { return '#'; } };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!DATA) { document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40%;text-align:center">The data file did not load. Run scripts/build_records.py and reload.</p>'); return; }

  const { meta, people } = DATA;
  const byId = new Map(people.map(p => [p.id, p]));
  const order = people.map(p => p.id); // chronological
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = iso => { if (!iso) return ''; if (!/^\d{4}/.test(iso)) return iso; const [y, m, d] = iso.split('-').map(Number); return d ? `${d} ${MONTHS[m - 1]} ${y}` : m ? `${MONTHS[m - 1]} ${y}` : String(y); };
  // the date as it should be shown: approximate dates are shown as published
  const showDate = p => p.date_precision && p.date_precision !== 'day' ? p.date_as_published : fmtDate(p.date);
  const shortDate = (iso, prec) => { const [y, m, d] = iso.split('-').map(Number); return prec === 'year' ? String(y) : prec === 'month' ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
  const cls = p => p.outcome === 'died' || p.outcome === 'believed_died' ? 'died' : p.outcome === 'survived' ? 'survived' : 'other';
  const fold = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hash = (id, salt) => { let h = 2166136261 ^ salt; for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  people.forEach(p => { p.search = fold([p.name, ...(p.aliases || []), p.location, p.affiliation, p.region, p.date.slice(0, 4)].join(' ')); });

  /* ---------- Header figures ---------- */
  $('#stats').innerHTML = `<b>${meta.people}</b> people · <b>${meta.tibet}</b> in Tibet and China · <b>${meta.exile}</b> in exile · <b>${meta.died + (meta.believed_died || 0)}</b> reported or believed dead · ${meta.first_year}–${meta.last_year}`;

  /* ---------- Layout: an Archimedean spiral of time around the hub ----------
     r = b·θ. Nodes sit at equal arc length S along it, oldest nearest the centre.
     A wider gap opens before each new year, where the year is written. */
  const NODE_R = 20, S = 80, TURN = 92, R0 = 175, YEAR_GAP = 1.9;
  const b = TURN / (2 * Math.PI);
  let theta = R0 / b;
  const ANGLE0 = -Math.PI / 2;
  const at = th => { const r = b * th, a = th + ANGLE0; return { x: r * Math.cos(a), y: r * Math.sin(a), r, a }; };
  const yearMarks = [];
  let lastYear = null;
  people.forEach(p => {
    const y = p.date.slice(0, 4);
    if (y !== lastYear) {
      if (lastYear !== null) {
        const mid = theta + (S * YEAR_GAP / 2) / (b * theta);
        yearMarks.push({ year: y, ...at(mid), n: people.filter(q => q.date.startsWith(y)).length });
        theta += (S * YEAR_GAP) / (b * theta);
      } else {
        yearMarks.push({ year: y, ...at(theta - (S * .9) / (b * theta)), n: people.filter(q => q.date.startsWith(y)).length });
      }
      lastYear = y;
    }
    const pos = at(theta);
    p.wx = pos.x; p.wy = pos.y; p.wa = pos.a; p.wr = pos.r;
    p.ph1 = hash(p.id, 1) * Math.PI * 2; p.ph2 = hash(p.id, 2) * Math.PI * 2;
    p.sp1 = .00045 + hash(p.id, 3) * .0004; p.sp2 = .0004 + hash(p.id, 4) * .0004;
    theta += S / (b * theta);
  });
  const EXTENT = b * theta + NODE_R + 50;

  /* ---------- 3D layout: a sphere of time around the hub ----------
     Fibonacci sphere, in date order: 2009 at the top pole, 2022 at the bottom.
     Each year label floats just outside the sphere beside that year's first person. */
  const R3 = 520, PERSP = 1600, GOLDEN = Math.PI * (3 - Math.sqrt(5));
  people.forEach((p, i) => {
    const v = 1 - 2 * (i + .5) / people.length, ring = Math.sqrt(1 - v * v), phi = i * GOLDEN;
    p.x3 = R3 * ring * Math.cos(phi); p.y3 = -R3 * v; p.z3 = R3 * ring * Math.sin(phi);
  });
  yearMarks.forEach(m => {
    const first = people.find(p => p.date.startsWith(m.year));
    // just outside the sphere, beside the first person of that year
    m.x3 = first.x3 * 1.2; m.y3 = first.y3 * 1.2 - 34; m.z3 = first.z3 * 1.2;
  });
  const EXTENT3 = R3 + 120;

  /* ---------- Build SVG ---------- */
  const svg = $('#graph'), world = $('#world'), gLinks = $('#links'), gNodes = $('#nodes'), gBack = $('#nodes-back'), gYears = $('#years'), gHub = $('#hub');
  const thread2 = $('#thread'), thread3 = $('#thread3');

  // faint dashed thread tracing the 2D spiral (time)
  {
    const pts = []; const th0 = R0 / b - .6;
    for (let th = th0; th <= theta; th += .05) { const q = at(th); pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
    thread2.setAttribute('d', 'M' + pts.join('L'));
  }

  const splitName = name => {
    const words = name.split(/\s+/); if (name.length <= 12 || words.length === 1) return [name];
    let best = [name], bestScore = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), c = words.slice(i).join(' '), s = Math.max(a.length, c.length);
      if (s < bestScore) { bestScore = s; best = [a, c]; }
    }
    return best;
  };

  people.forEach(p => {
    p.link = el('path', { class: `link ${cls(p)}` }, gLinks);
    const g = el('g', { class: `node ${cls(p)}`, id: p.id, tabindex: '0', role: 'button', 'aria-label': `${p.name}, ${showDate(p)}${p.section === 'exile' ? `, in exile (${p.country})` : ''}. ${p.outcome_label}.` }, gNodes);
    g.dataset.id = p.id;
    if (p.section === 'exile') g.classList.add('exile');
    const upright = el('g', {}, g);
    const pop = el('g', { class: 'pop' }, upright);
    el('circle', { class: 'halo', r: NODE_R * 1.9 }, pop);
    el('circle', { class: 'ring', r: NODE_R }, pop);
    if (p.portrait && p.portrait.file) {
      el('image', { href: p.portrait.file, x: -NODE_R + 1, y: -NODE_R + 1, width: (NODE_R - 1) * 2, height: (NODE_R - 1) * 2, 'clip-path': 'url(#clip-circle)', preserveAspectRatio: 'xMidYMid slice' }, pop);
    } else {
      el('text', { class: 'ini', y: 1 }, pop).textContent = p.initials;
    }
    if (p.section === 'exile') el('circle', { class: 'exdot', cx: NODE_R * .72, cy: -NODE_R * .72, r: 4.5 }, pop);
    const lines = splitName(p.name);
    lines.forEach((ln, i) => { el('text', { class: 'nm', y: NODE_R + 13 + i * 11 }, upright).textContent = ln; });
    el('text', { class: 'dt', y: NODE_R + 13 + lines.length * 11 }, upright).textContent = shortDate(p.date, p.date_precision);
    p.g = g; p.upright = upright;
  });

  yearMarks.forEach(m => {
    const g = el('g', { class: 'year-mark' }, gYears);
    el('text', { y: -4 }, g).textContent = m.year;
    el('text', { class: 'n', y: 14 }, g).textContent = `${m.n} ${m.n === 1 ? 'person' : 'people'}`;
    m.g = g;
  });

  el('circle', { class: 'glow', r: 150 }, gHub);
  el('circle', { class: 'disc', r: 82 }, gHub);
  const hubBig = el('text', { class: 'big', y: 10 }, gHub); hubBig.textContent = meta.people;
  const hubSub = el('text', { class: 'sub', y: 32 }, gHub); hubSub.textContent = 'LIVES';
  el('text', { class: 'yrs', y: -36 }, gHub).textContent = `${meta.first_year} – ${meta.last_year}`;
  el('text', { class: 'yrs', y: 52 }, gHub).textContent = 'about this record';

  /* ---------- Camera ----------
     2D: screen = C + T + k · R(rot) · world.
     3D: world point is turned by yaw (around the vertical axis) and pitch (tilt),
         then given perspective, then screen = C + T + k · projected.
     `mix` blends the two layouts (0 = flat spiral, 1 = sphere) while switching. */
  const cam = { x: 0, y: 0, k: 1, rot: 0, yaw: 0, pitch: -.3 };
  let W = innerWidth, H = innerHeight, tween = null, mode = '2d', mix = 0, mixTween = null;
  const is3D = () => mode === '3d';
  const K_MIN = .18, K_MAX = 5;
  const fitK = (m = mode) => Math.max(K_MIN, Math.min(W, H - (W < 640 ? 250 : 120)) / (2 * (m === '3d' ? EXTENT3 : EXTENT)));
  const restY = () => W <= 640 ? 50 : 10;
  const clampK = k => Math.min(K_MAX, Math.max(K_MIN, k));
  const clampPitch = p => Math.max(-1.45, Math.min(1.45, p));
  function zoomAt(sx, sy, factor) {
    const k2 = clampK(cam.k * factor), f = k2 / cam.k;
    const vx = sx - W / 2 - cam.x, vy = sy - H / 2 - cam.y;
    cam.x = sx - W / 2 - f * vx; cam.y = sy - H / 2 - f * vy; cam.k = k2;
  }
  function rotateAt(sx, sy, d) {
    if (is3D()) { cam.yaw += d; return; }
    const c = Math.cos(d), s = Math.sin(d), px = W / 2 + cam.x - sx, py = H / 2 + cam.y - sy;
    cam.x = sx - W / 2 + (c * px - s * py); cam.y = sy - H / 2 + (s * px + c * py); cam.rot += d;
  }
  const orbit = (dx, dy) => { cam.yaw += dx * .006; cam.pitch = clampPitch(cam.pitch - dy * .006); };
  const hubScreen = () => [W / 2 + cam.x, H / 2 + cam.y];
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const nearAngle = (target, from) => target + Math.round((from - target) / (2 * Math.PI)) * 2 * Math.PI;
  function flyTo(target, ms = 750) {
    const to = { ...cam, ...target };
    to.yaw = nearAngle(to.yaw, cam.yaw);
    if (reduceMotion) { Object.assign(cam, to); return; }
    tween = { from: { ...cam }, to, t0: performance.now(), ms };
  }
  function viewFor(p, k) {
    // put person p at the visible centre (left of the drawer on wide screens)
    const offX = W > 640 && drawerOpen ? -Math.min(440, W) / 2 : 0, offY = W <= 640 && drawerOpen ? -H * .3 : 0;
    if (is3D()) {
      // turn the sphere so p faces the viewer, then centre the sphere's front
      // face p towards the viewer, tilted ~30° off-axis so it does not sit on top of the hub
      const yaw = Math.atan2(-p.x3, p.z3), pitch = clampPitch(Math.atan2(p.y3, Math.hypot(p.x3, p.z3)) + (p.y3 > 0 ? -.55 : .55));
      const x1 = p.x3 * Math.cos(yaw) + p.z3 * Math.sin(yaw), z1 = -p.x3 * Math.sin(yaw) + p.z3 * Math.cos(yaw);
      const y2 = p.y3 * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = p.y3 * Math.sin(pitch) + z1 * Math.cos(pitch), f = PERSP / (PERSP - z2);
      const k3 = k / (f * .9) * 1.05;
      return { k: k3, yaw, pitch, x: offX - k3 * x1 * f, y: offY - k3 * y2 * f };
    }
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return { k, x: offX - k * (c * p.wx - s * p.wy), y: offY - k * (s * p.wx + c * p.wy) };
  }
  const resetView = () => flyTo(is3D() ? { x: 0, y: restY(), k: fitK(), yaw: 0, pitch: -.3 } : { x: 0, y: restY(), k: fitK(), rot: 0 }, 900);

  /* ---------- Render loop ---------- */
  let spinning = !reduceMotion, interacting = false, drawerOpen = false, lastT = performance.now(), lastLod = '', frameNo = 0, sorted3D = false;
  const SPIN = 0.045, SPIN3 = 0.16; // radians per second
  function frame(t) {
    const dt = Math.min(64, t - lastT); lastT = t; frameNo++;
    if (tween) {
      const u = Math.min(1, (t - tween.t0) / tween.ms), e = ease(u);
      for (const key of ['x', 'y', 'k', 'rot', 'yaw', 'pitch']) cam[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
      if (u >= 1) tween = null;
    } else if (spinning && !interacting && !drawerOpen) {
      if (is3D()) cam.yaw += SPIN3 * dt / 1000; else { const [hx, hy] = hubScreen(); rotateAt(hx, hy, SPIN * dt / 1000); }
    }
    if (mixTween) {
      const u = Math.min(1, (t - mixTween.t0) / mixTween.ms);
      mix = mixTween.from + (mixTween.to - mixTween.from) * ease(u);
      if (u >= 1) mixTween = null;
    }
    const m = mix;
    world.setAttribute('transform', `translate(${(W / 2 + cam.x).toFixed(2)} ${(H / 2 + cam.y).toFixed(2)}) scale(${cam.k.toFixed(4)})`);
    const c2 = Math.cos(cam.rot), s2 = Math.sin(cam.rot);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const proj = (x, y, z) => {
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, f = PERSP / (PERSP - z2);
      return [x1 * f, y2 * f, f, z2];
    };
    const thread3pts = m > 0 ? [] : null;
    for (const p of people) {
      let fx = 0, fy = 0;
      if (!reduceMotion) { fx = Math.sin(t * p.sp1 + p.ph1) * 4; fy = Math.cos(t * p.sp2 + p.ph2) * 4; }
      const ax = c2 * (p.wx + fx) - s2 * (p.wy + fy), ay = s2 * (p.wx + fx) + c2 * (p.wy + fy);
      let x = ax, y = ay, sc = 1, op = 1, cx, cyy;
      const cr = p.wr * .55, ca = p.wa - .42, lx = cr * Math.cos(ca), ly = cr * Math.sin(ca);
      cx = c2 * lx - s2 * ly; cyy = s2 * lx + c2 * ly;
      if (m > 0) {
        const [qx, qy, f, z] = proj(p.x3, p.y3, p.z3);
        p.z = z;
        const depth = (z + R3) / (2 * R3); // 0 = far side, 1 = nearest
        x = ax + (qx + fx - ax) * m; y = ay + (qy + fy - ay) * m;
        sc = 1 + (f * .9 - 1) * m; op = 1 + (.22 + .78 * depth - 1) * m;
        cx = cx + (x / 2 - cx) * m; cyy = cyy + (y / 2 - cyy) * m;
        thread3pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      p.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      p.upright.setAttribute('transform', sc === 1 ? '' : `scale(${sc.toFixed(3)})`);
      p.upright.style.opacity = op === 1 ? '' : op.toFixed(3);
      p.link.style.opacity = op === 1 ? '' : (op * op).toFixed(3);
      p.link.setAttribute('d', `M0,0Q${cx.toFixed(1)},${cyy.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`);
    }
    // paint order: in 3D, people behind the hub go in the back layer, sorted far to near
    if (m > .5 && (frameNo % 8 === 0 || !sorted3D)) {
      const active = document.activeElement;
      [...people].sort((a, c) => a.z - c.z).forEach(p => (p.z < 0 ? gBack : gNodes).appendChild(p.g));
      if (active && active.classList && active.classList.contains('node') && document.activeElement !== active) active.focus({ preventScroll: true });
      sorted3D = true;
    } else if (m <= .5 && sorted3D) {
      people.forEach(p => gNodes.appendChild(p.g)); sorted3D = false;
    }
    yearMarks.forEach(ym => {
      let x = c2 * ym.x - s2 * ym.y, y = s2 * ym.x + c2 * ym.y, op = 1, sc = 1;
      if (m > 0) {
        const [qx, qy, f, z] = proj(ym.x3, ym.y3, ym.z3);
        x += (qx - x) * m; y += (qy - y) * m; sc = 1 + (f - 1) * m; op = 1 + (.25 + .75 * (z + R3) / (2 * R3) - 1) * m;
      }
      ym.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})`);
      ym.g.style.opacity = op.toFixed(3);
    });
    thread2.setAttribute('transform', `rotate(${(cam.rot * 180 / Math.PI).toFixed(3)})`);
    thread2.style.opacity = (1 - m).toFixed(3);
    if (thread3pts) thread3.setAttribute('d', 'M' + thread3pts.join('L'));
    thread3.style.opacity = m.toFixed(3);
    const lod = cam.k < .42 ? 'far' : cam.k < .75 ? 'mid' : '';
    if (lod !== lastLod) { svg.classList.toggle('far', lod === 'far'); svg.classList.toggle('mid', lod === 'mid'); lastLod = lod; }
    requestAnimationFrame(frame);
  }

  /* ---------- 2D / 3D switch ---------- */
  const HINTS = {
    '2d': 'Drag to move · scroll or pinch to zoom · Shift + drag, Shift + scroll or two-finger twist to rotate · select a person to read their record',
    '3d': 'Drag to turn the sphere · scroll or pinch to zoom · Shift + drag to move · select a person to read their record',
  };
  const LEGEND = { '2d': `Spiral of time: ${meta.first_year} inside, ${meta.last_year} outside`, '3d': `Sphere of time: ${meta.first_year} at the top, ${meta.last_year} at the bottom` };
  function setMode(next, animate = true) {
    if (next !== '2d' && next !== '3d') return;
    mode = next;
    $$('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('#hint').textContent = HINTS[mode]; $('#legend-order').textContent = LEGEND[mode];
    svg.classList.toggle('three', mode === '3d');
    const target = mode === '3d' ? 1 : 0;
    if (!animate || reduceMotion) { mix = target; mixTween = null; }
    else mixTween = { from: mix, to: target, t0: performance.now(), ms: 1300 };
    if (openId && byId.get(openId)) flyTo(viewFor(byId.get(openId), 1.7), 1300);
    else if (animate) flyTo(mode === '3d' ? { x: 0, y: restY(), k: fitK(), pitch: -.3 } : { x: 0, y: restY(), k: fitK() }, 1300);
    try { localStorage.setItem('tsi-view', mode); } catch {}
  }
  $$('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  /* ---------- Pointer ----------
     2D: drag = pan, Shift+drag = rotate.  3D: drag = turn the sphere, Shift+drag = pan.
     Two fingers: pinch to zoom, twist to rotate (both views). */
  const pts = new Map();
  let downInfo = null, gesture = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    svg.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween = null; interacting = true; hintQuiet();
    if (pts.size === 1) downInfo = { x: e.clientX, y: e.clientY, target: e.target.closest('.node, .hub'), moved: false, shift: e.shiftKey };
    else { downInfo && (downInfo.moved = true); gesture = twoFinger(); }
  });
  function twoFinger() { const [a, c] = [...pts.values()]; return { d: Math.hypot(c.x - a.x, c.y - a.y), ang: Math.atan2(c.y - a.y, c.x - a.x), mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2 }; }
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, cur);
    if (pts.size >= 2) {
      const g2 = twoFinger();
      if (gesture) {
        cam.x += g2.mx - gesture.mx; cam.y += g2.my - gesture.my;
        zoomAt(g2.mx, g2.my, g2.d / (gesture.d || g2.d));
        rotateAt(g2.mx, g2.my, g2.ang - gesture.ang);
      }
      gesture = g2; return;
    }
    if (!downInfo) return;
    if (!downInfo.moved && Math.hypot(cur.x - downInfo.x, cur.y - downInfo.y) < 5) return;
    downInfo.moved = true; svg.classList.add('dragging');
    const shift = downInfo.shift || e.shiftKey;
    if (is3D()) {
      if (shift) { cam.x += cur.x - prev.x; cam.y += cur.y - prev.y; } else orbit(cur.x - prev.x, cur.y - prev.y);
    } else if (shift) {
      const [hx, hy] = hubScreen();
      const a0 = Math.atan2(prev.y - hy, prev.x - hx), a1 = Math.atan2(cur.y - hy, cur.x - hx);
      rotateAt(hx, hy, a1 - a0);
    } else { cam.x += cur.x - prev.x; cam.y += cur.y - prev.y; }
  });
  function pointerEnd(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) gesture = null;
    if (pts.size === 0) {
      svg.classList.remove('dragging'); interacting = false;
      if (downInfo && !downInfo.moved && e.type === 'pointerup' && downInfo.target) {
        downInfo.target.classList.contains('hub') ? openAbout() : openPerson(downInfo.target.dataset.id);
      }
      downInfo = null;
    }
  }
  svg.addEventListener('pointerup', pointerEnd);
  svg.addEventListener('pointercancel', pointerEnd);
  svg.addEventListener('wheel', e => {
    e.preventDefault(); tween = null; hintQuiet();
    if (e.shiftKey) { const [hx, hy] = hubScreen(); rotateAt(hx, hy, (e.deltaY || e.deltaX) * .003); return; }
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-120, Math.min(120, dy)) * (e.ctrlKey ? .01 : .0011)));
  }, { passive: false });
  // Safari trackpad pinch/rotate
  let gs = null;
  svg.addEventListener('gesturestart', e => { e.preventDefault(); gs = { s: e.scale, r: e.rotation }; });
  svg.addEventListener('gesturechange', e => { e.preventDefault(); if (!gs) return; zoomAt(e.clientX, e.clientY, e.scale / gs.s); rotateAt(e.clientX, e.clientY, (e.rotation - gs.r) * Math.PI / 180); gs = { s: e.scale, r: e.rotation }; });

  // hover highlight of a person's line (people live in two layers, so listen on the world group)
  world.addEventListener('pointerover', e => { const n = e.target.closest('.node'); if (n) byId.get(n.dataset.id).link.classList.add('on'); });
  world.addEventListener('pointerout', e => { const n = e.target.closest('.node'); if (n && n.dataset.id !== openId) byId.get(n.dataset.id).link.classList.remove('on'); });
  world.addEventListener('focusin', e => { const n = e.target.closest('.node'); if (n) byId.get(n.dataset.id).link.classList.add('on'); });
  world.addEventListener('focusout', e => { const n = e.target.closest('.node'); if (n && n.dataset.id !== openId) byId.get(n.dataset.id).link.classList.remove('on'); });
  world.addEventListener('keydown', e => { const n = e.target.closest('.node'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPerson(n.dataset.id); } });
  gHub.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAbout(); } });

  /* ---------- Toolbar & keyboard ---------- */
  const zoomBtn = f => { const save = { ...cam }; zoomAt(W / 2, H / 2, f); const target = { ...cam }; Object.assign(cam, save); flyTo(target, 300); };
  const rotBtn = d => { const save = { ...cam }; const [hx, hy] = hubScreen(); rotateAt(hx, hy, d); const target = { ...cam }; Object.assign(cam, save); flyTo(target, 350); };
  $('#zin').addEventListener('click', () => zoomBtn(1.4));
  $('#zout').addEventListener('click', () => zoomBtn(1 / 1.4));
  $('#rl').addEventListener('click', () => rotBtn(-Math.PI / 8));
  $('#rr').addEventListener('click', () => rotBtn(Math.PI / 8));
  const setSpin = on => { spinning = on; const b = $('#spin'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '❚❚' : '▶'; b.title = on ? 'Stop the slow rotation (space)' : 'Start the slow rotation (space)'; };
  setSpin(spinning);
  $('#spin').addEventListener('click', () => setSpin(!spinning));
  $('#reset').addEventListener('click', resetView);
  const arrow = (dx, dy) => { if (is3D()) orbit(dx * -.5, dy * -.5); else { cam.x += dx; cam.y += dy; } };
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || drawerOpen) return;
    const map = { '+': () => zoomBtn(1.4), '=': () => zoomBtn(1.4), '-': () => zoomBtn(1 / 1.4), '_': () => zoomBtn(1 / 1.4), '[': () => rotBtn(-Math.PI / 8), ']': () => rotBtn(Math.PI / 8), '0': resetView,
      '2': () => setMode('2d'), '3': () => setMode('3d'),
      ArrowLeft: () => arrow(60, 0), ArrowRight: () => arrow(-60, 0), ArrowUp: () => arrow(0, 60), ArrowDown: () => arrow(0, -60) };
    if (e.key === ' ' && !e.target.closest('button, .node, .hub')) { e.preventDefault(); setSpin(!spinning); return; }
    if (map[e.key] && !e.target.closest('button') ) { e.preventDefault(); tween = null; map[e.key](); }
  });
  function hintQuiet() { $('#hint').classList.add('quiet'); }

  /* ---------- Search & filters ----------
     Facets combine with AND across groups and OR within a group. Each option shows how many
     people it would match given everything else that is selected (faceted counts). */
  const yearList = [...new Set(people.map(p => p.date.slice(0, 4)))].sort();
  const byCount = key => [...new Set(people.map(p => p[key]))].sort((a, c) => people.filter(p => p[key] === c).length - people.filter(p => p[key] === a).length);
  const FACETS = [
    { key: 'outcome', label: 'Outcome', get: p => cls(p), options: [['died', 'Died or believed dead'], ['survived', 'Survived'], ['other', 'Custody, injured or unknown']] },
    { key: 'country', label: 'Country of protest', get: p => p.country, options: byCount('country').map(c => [c, c]),
      note: '“Tibet and China” covers protests inside the People’s Republic of China. The others took place in exile.' },
    { key: 'year', label: 'Year of protest', get: p => p.date.slice(0, 4), options: yearList.map(y => [y, y]), compact: true },
    { key: 'region', label: 'Place (province, or country in exile)', get: p => p.region, options: byCount('region').map(r => [r, r]) },
    { key: 'source', label: 'Listed by', get: p => p.listed_by.join(' + '), options: [['CTA + ICT', 'Both CTA and ICT'], ['ICT', 'ICT only'], ['CTA', 'CTA only']] },
    { key: 'gender', label: 'Gender', get: p => p.gender, options: [['Male', 'Men'], ['Female', 'Women'], ['Unknown', 'Unknown']] },
    { key: 'age', label: 'Age at the time', get: p => p.age_group, options: [['u20', 'Under 20'], ['20s', '20–29'], ['30s', '30–39'], ['40s', '40–49'], ['50+', '50 and over'], ['na', 'Unknown']] },
  ];
  const selected = Object.fromEntries(FACETS.map(f => [f.key, new Set()]));
  people.forEach(p => { p.facet = Object.fromEntries(FACETS.map(f => [f.key, f.get(p)])); });

  $('#filters-body').innerHTML = FACETS.map(f => `
    <fieldset class="fgroup${f.compact ? ' compact' : ''}"><legend>${f.label}</legend>
      <div class="chips">${f.options.map(([v, l]) => `<button type="button" class="chip" data-f="${f.key}" data-v="${esc(v)}" aria-pressed="false">${esc(l)} <b></b></button>`).join('')}</div>
      ${f.note ? `<p class="fnote">${esc(f.note)}</p>` : ''}
    </fieldset>`).join('');

  let matches = [];
  const passes = (p, q, except) => (!q || p.search.includes(q)) && FACETS.every(f => f.key === except || !selected[f.key].size || selected[f.key].has(p.facet[f.key]));
  function applyFilters() {
    const q = fold($('#q').value.trim());
    const nActive = FACETS.reduce((n, f) => n + selected[f.key].size, 0);
    const filtering = !!(q || nActive);
    matches = people.filter(p => passes(p, q));
    const set = new Set(matches);
    people.forEach(p => {
      const ok = set.has(p);
      p.g.classList.toggle('dim', !ok); p.link.classList.toggle('dim', !ok);
      p.g.classList.toggle('match', ok && filtering); p.link.classList.toggle('match', ok && filtering);
    });
    // faceted counts
    FACETS.forEach(f => {
      const pool = people.filter(p => passes(p, q, f.key));
      $$(`.chip[data-f="${f.key}"]`).forEach(b => {
        const n = pool.filter(p => p.facet[f.key] === b.dataset.v).length;
        b.querySelector('b').textContent = n;
        b.classList.toggle('zero', n === 0 && b.getAttribute('aria-pressed') !== 'true');
      });
    });
    $('#fcount').textContent = nActive ? nActive : '';
    if (typeof renderPills === 'function') renderPills();
    $('#fclear').disabled = !filtering;
    hubBig.textContent = filtering ? matches.length : meta.people;
    hubSub.textContent = filtering ? `OF ${meta.people} SHOWN` : 'LIVES';
    const c = $('#count');
    if (!filtering) { c.textContent = ''; return; }
    c.innerHTML = matches.length
      ? `${matches.length} of ${people.length} people · <button type="button" id="go-first">Show ${esc(matches[0].name)}</button>`
      : 'No one matches. Remove a filter or try another spelling.';
    const gf = $('#go-first'); if (gf) gf.addEventListener('click', () => openPerson(matches[0].id));
  }
  $('#q').addEventListener('input', applyFilters);
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && matches.length && $('#q').value.trim()) openPerson(matches[0].id); });
  $('#filters-body').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const s = selected[b.dataset.f], on = !s.has(b.dataset.v);
    on ? s.add(b.dataset.v) : s.delete(b.dataset.v);
    b.setAttribute('aria-pressed', String(on));
    applyFilters();
  });
  $('#fclear').addEventListener('click', () => {
    FACETS.forEach(f => selected[f.key].clear()); $$('#filters-body .chip').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#q').value = ''; applyFilters();
  });
  // open / close the panel; the choice is remembered in this browser
  const setPanel = (open, remember = true) => {
    $('#filters').hidden = !open; $('#ftoggle').setAttribute('aria-expanded', String(open));
    renderPills();
    if (remember) try { localStorage.setItem('tsi-filters-open', open ? '1' : '0'); } catch {}
  };
  $('#ftoggle').addEventListener('click', () => setPanel($('#filters').hidden));
  $('#fclose').addEventListener('click', () => { setPanel(false); $('#ftoggle').focus(); });
  document.addEventListener('keydown', e => {
    if (drawerOpen || e.target.matches('input, textarea')) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setPanel($('#filters').hidden); }
    else if (e.key === 'Escape' && !$('#filters').hidden) setPanel(false);
  });
  // while the panel is closed, active filters show as small removable pills under the search box
  function renderPills() {
    const box = $('#active-pills'), closed = $('#filters').hidden;
    const items = [];
    FACETS.forEach(f => selected[f.key].forEach(v => items.push({ f: f.key, v, label: (f.options.find(o => o[0] === v) || [v, v])[1] })));
    box.hidden = !closed || !items.length;
    box.innerHTML = items.map(i => `<button type="button" class="pill-x" data-f="${i.f}" data-v="${esc(i.v)}" aria-label="Remove filter ${esc(i.label)}">${esc(i.label)} <span aria-hidden="true">✕</span></button>`).join('');
  }
  $('#active-pills').addEventListener('click', e => {
    const b = e.target.closest('.pill-x'); if (!b) return;
    selected[b.dataset.f].delete(b.dataset.v);
    const chip = $(`#filters-body .chip[data-f="${b.dataset.f}"][data-v="${CSS.escape(b.dataset.v)}"]`); if (chip) chip.setAttribute('aria-pressed', 'false');
    applyFilters();
  });
  let savedPanel = null; try { savedPanel = localStorage.getItem('tsi-filters-open'); } catch {}
  setPanel(savedPanel === '1', false);
  applyFilters();

  /* ---------- Drawer: one person, or the "about" page ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  let openId = null, returnFocus = null;
  const faceHTML = p => `<div class="face ${cls(p)}">${p.portrait && p.portrait.file ? `<img src="${esc(p.portrait.file)}" alt="Portrait of ${esc(p.name)}">` : `<span aria-hidden="true">${esc(p.initials)}</span>`}</div>`;
  const srcTag = src => src && src.url ? `<a class="srctag" href="${esc(safeURL(src.url))}" target="_blank" rel="noopener" title="Where this comes from">${esc(src.label)}</a>` : '';
  const fact = (label, value, extra, wide, src) => value || value === 0
    ? `<div${wide ? ' class="wide"' : ''}><dt>${label}${srcTag(src)}</dt><dd class="${value === 'Unknown' ? 'unk' : ''}">${esc(value)}${extra ? `<small>${esc(extra)}</small>` : ''}</dd></div>` : '';

  function personHTML(p) {
    const fs = p.field_sources || {};
    const parents = [p.father !== 'Unknown' && `Father: ${p.father}`, p.mother !== 'Unknown' && `Mother: ${p.mother}`].filter(Boolean).join(' · ');
    const dateCorr = p.corrections.find(c => c.field === 'incident date');
    let death = '';
    if (cls(p) === 'died') {
      death = p.death_date ? fmtDate(p.death_date) : 'Unknown';
      if (p.days_until_death === 0) death += ', the same day';
      else if (p.days_until_death > 0) death += `, ${p.days_until_death} day${p.days_until_death === 1 ? '' : 's'} later`;
    }
    const others = (p.shared_with || []).map(id => byId.get(id)).filter(Boolean);
    const i = p.ict;
    const ictRows = i ? [['Name', i.name + (i.aliases.length ? ` (${i.aliases.join(', ')})` : '')], ['Date', i.date_as_published], ['Protest location', i.location_as_published], ['Age', i.age_as_published],
      ['Whereabouts / wellbeing', i.status_as_published], ['Monastery', i.monastery_as_published], ['Occupation', i.occupation_as_published]].filter(r => r[1] && r[1] !== 'Unknown' || ['Date', 'Age', 'Whereabouts / wellbeing'].includes(r[0])) : [];
    return `
      <div class="d-head">${faceHTML(p)}
        <div><p class="eyebrow">${p.section === 'exile' ? `In exile · ${esc(p.country)}` : 'Tibet and China'} · listed by ${esc(p.listed_by.join(' and '))}</p>
          <h2 id="d-name">${esc(p.name)}</h2>
          ${p.aliases.length ? `<p class="aka">Also recorded as ${esc(p.aliases.join(', '))}</p>` : ''}
          <span class="pill ${cls(p)}">${esc(p.outcome_label)}</span></div></div>
      <dl class="facts">
        ${fact('Date of protest', showDate(p), dateCorr ? `Corrected; CTA lists ${dateCorr.original}` : p.date_precision && p.date_precision !== 'day' ? 'Approximate, as published' : '', false, fs.date)}
        ${fact('Age', p.age, p.age_is_approximate ? 'Approximate, as published' : '', false, fs.age)}
        ${fact('Gender', p.gender, '', false, fs.gender)}
        ${fact(p.section === 'exile' ? 'Country' : 'Province', p.section === 'exile' ? p.country : p.region, '', false, fs.location)}
        ${cls(p) === 'died' ? fact(p.outcome === 'believed_died' ? 'Believed to have died' : 'Died', death, '', false, fs.death_date || fs.outcome) : fact('Status as reported', p.status_as_published === 'Unknown' || /^unknown$/i.test(p.status_as_published) ? p.outcome_label : p.status_as_published, '', false, fs.outcome)}
        ${fact('Place of protest', p.location, '', true, fs.location)}
        ${fact('Monastery, village or occupation', p.affiliation, '', true, fs.affiliation)}
        ${parents ? fact('Parents', parents, '', true, fs.parents) : ''}
      </dl>
      ${others.length ? `<div class="d-section"><h3>Same day, same place</h3><div class="together">${others.map(o => `<button type="button" data-go="${o.id}">${esc(o.name)}</button>`).join('')}</div></div>` : ''}
      ${p.corrections.length || p.notes.length || p.checks.length ? `<div class="d-section"><h3>Notes on this record</h3>
        ${p.corrections.map(c => `<p class="note"><span class="cert">${esc(c.certainty)} certainty correction</span><br><b>${esc(c.field)}</b>: CTA gives “${esc(c.original)}”; shown here as “${esc(c.field.includes('date') ? fmtDate(c.used) : c.used)}”. ${esc(c.evidence)}</p>`).join('')}
        ${p.checks.map(c => `<p class="note">${esc(c)}</p>`).join('')}
        ${p.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}</div>` : ''}
      ${i ? `<div class="d-section"><h3>As published by ICT</h3><table class="srctable"><tbody>${ictRows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td class="${r[1] === 'Unknown' ? 'unk' : ''}">${esc(r[1])}</td></tr>`).join('')}</tbody></table>
        <a class="src" href="${esc(safeURL(i.source_url))}" target="_blank" rel="noopener">This person's entry on the ICT fact sheet<small>International Campaign for Tibet ↗</small></a></div>` : ''}
      ${p.listed_by.includes('CTA') ? `<div class="d-section"><h3>As published by the CTA</h3><table class="srctable"><tbody>
        <tr><th scope="row">Date</th><td>${esc(p.date_as_published)}</td></tr><tr><th scope="row">Status</th><td>${esc(p.status_as_published)}</td></tr></tbody></table></div>` : ''}
      <div class="d-section"><h3>Sources</h3>
        ${p.sources.map(s => `<a class="src" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener">${esc(s.title)}<small>${esc(s.publisher)} ↗</small></a>`).join('')}
        ${p.portrait ? `<p class="fine">Portrait: ${esc(p.portrait.credit || 'credit not given')}${p.portrait.source_url ? ` · <a href="${esc(safeURL(p.portrait.source_url))}" target="_blank" rel="noopener">original</a>` : ''}</p>` : ''}
      </div>
      <p class="fine">Each fact carries a tag (CTA, ICT, or Corrected) linking to where it comes from. “Unknown” means neither source gives it. Statuses describe what was reported at the time.</p>`;
  }

  function aboutHTML() {
    const years = [...new Set(people.map(p => +p.date.slice(0, 4)))].sort((x, y) => x - y);
    const per = y => people.filter(p => +p.date.slice(0, 4) === y).length, max = Math.max(...years.map(per));
    const S = meta.sources;
    return `<div class="about">
      <p class="eyebrow">About this record</p>
      <h2 id="d-name">${meta.people} people, ${meta.first_year}–${meta.last_year}</h2>
      <p>Every circle is one Tibetan who set themselves on fire in protest: <b>${meta.tibet}</b> inside Tibet and China and <b>${meta.exile}</b> in exile. All of them are linked to this centre. In the 2D view they lie on a spiral of time, earliest nearest the centre. In the 3D view they form a sphere, earliest at the top.</p>
      <div class="d-section"><h3>Two sources, merged</h3>
      <p><a href="${esc(S.cta.url)}" target="_blank" rel="noopener">Central Tibetan Administration</a> fact sheet: ${S.cta.records} people inside Tibet and China. Transcribed ${fmtDate(S.cta.retrieved)}; ${meta.corrections_applied} fields corrected after review.</p>
      <p><a href="${esc(S.ict.url)}" target="_blank" rel="noopener">International Campaign for Tibet</a> fact sheet: ${S.ict.parsed_tibet} inside Tibet and China plus ${S.ict.parsed_exile} in exile. Checked weekly; last checked ${fmtDate(S.ict.retrieved)}, ICT's page last updated ${fmtDate(S.ict.page_last_updated)}.</p>
      <p>${meta.matched} people appear in both lists, ${meta.ict_only} only in ICT's. Where the sources disagree, both versions are shown. Missing information is shown as “Unknown”.</p></div>
      <div class="d-section"><h3>People by year</h3><div class="yearbars">${years.map(y => `<div><span>${y}</span><i style="width:${Math.max(2, per(y) / max * 100)}%"></i><span>${per(y)}</span></div>`).join('')}</div></div>
      <div class="d-section"><h3>Reading the graph</h3><ul>
        <li>Gold ring: died or believed to have died (${meta.died + (meta.believed_died || 0)}). Green ring: survived (${meta.survived}). Dashed ring: in custody, injured with no later report, or unknown (${meta.other}).</li>
        <li>A small outer dot marks a protest in exile.</li>
        <li>Outcomes describe what the sources reported at the time, not anyone's situation today.</li>
        <li>Names and dates appear as you zoom in. Hover or focus a person to light their line to the centre.</li>
        <li>2D: drag to move; Shift + drag, Shift + scroll, a two-finger twist or the ⟲ ⟳ buttons rotate.</li><li>3D: drag to turn the sphere in any direction; Shift + drag to move; ⟲ ⟳ spin it.</li><li>Both: scroll or pinch to zoom. Keys: 2 and 3 switch views, + − zoom, [ ] rotate, arrows move (2D) or turn (3D), 0 resets, F opens the filters, space starts or stops the slow rotation.</li>
      </ul></div>
      <div class="d-section"><h3>Not included yet</h3>
      <p>The 30 March 2022 report of Tsering Samdup (Radio Free Asia) appears in neither fact sheet. ${meta.with_portrait ? `${meta.with_portrait} people have a verified portrait; everyone else is shown by their initials.` : 'No portraits have been added yet, so each person is shown by their initials.'}</p>
      <p><a href="data/records.json" target="_blank" rel="noopener">Merged data (JSON)</a></p></div></div>`;
  }

  function showDrawer(html, isAbout) {
    if (!drawerOpen) returnFocus = document.activeElement;
    $('#d-body').innerHTML = html; $('#d-body').scrollTop = 0;
    $('.drawer-bar').classList.toggle('about-mode', !!isAbout);
    drawer.hidden = false; scrim.hidden = false; drawerOpen = true;
    requestAnimationFrame(() => { drawer.classList.add('open'); scrim.classList.add('open'); });
    drawer.focus({ preventScroll: true });
    $$('#d-body [data-go]').forEach(b => b.addEventListener('click', () => openPerson(b.dataset.go)));
  }
  function openPerson(id) {
    const p = byId.get(id); if (!p) return;
    if (openId && byId.get(openId)) { byId.get(openId).g.classList.remove('sel'); byId.get(openId).link.classList.remove('on'); }
    openId = id; p.g.classList.add('sel'); p.link.classList.add('on');
    const i = order.indexOf(id);
    $('#d-prev').disabled = i <= 0; $('#d-next').disabled = i >= order.length - 1;
    showDrawer(personHTML(p), false);
    flyTo(viewFor(p, Math.min(Math.max(cam.k, 1.4), 2.4)), 800);
    try { history.replaceState(null, '', '#' + id); } catch {}
  }
  function openAbout() {
    if (openId) { byId.get(openId).g.classList.remove('sel'); byId.get(openId).link.classList.remove('on'); openId = null; }
    showDrawer(aboutHTML(), true);
    try { history.replaceState(null, '', '#about'); } catch {}
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawer.classList.remove('open'); scrim.classList.remove('open'); drawerOpen = false;
    const done = () => { if (!drawerOpen) { drawer.hidden = true; scrim.hidden = true; } };
    reduceMotion ? done() : setTimeout(done, 380);
    if (openId) { const p = byId.get(openId); p.g.classList.remove('sel'); p.link.classList.remove('on'); }
    const back = openId ? byId.get(openId).g : returnFocus;
    openId = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }
  const step = d => { if (!openId) return; const i = order.indexOf(openId) + d; if (i >= 0 && i < order.length) openPerson(order[i]); };
  $('#d-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  $('#d-prev').addEventListener('click', () => step(-1));
  $('#d-next').addEventListener('click', () => step(1));
  document.addEventListener('keydown', e => {
    if (!drawerOpen) return;
    if (e.key === 'Escape') closeDrawer();
    else if (e.key === 'ArrowLeft' && openId) step(-1);
    else if (e.key === 'ArrowRight' && openId) step(1);
    else if (e.key === 'Tab') {
      const f = $$('button:not(:disabled), a[href]', drawer).filter(x => x.offsetParent !== null); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- Start ---------- */
  function size() { W = innerWidth; H = innerHeight; }
  addEventListener('resize', size);
  size();
  // remembered view (per browser), then the opening move: start far out and drift in
  let saved = '2d'; try { saved = localStorage.getItem('tsi-view') || '2d'; } catch {}
  setMode(saved === '3d' ? '3d' : '2d', false);
  Object.assign(cam, { x: 0, y: restY(), k: fitK() * (reduceMotion ? 1 : .45), rot: reduceMotion ? 0 : -.6, yaw: reduceMotion ? 0 : -1.2 });
  if (!reduceMotion) flyTo({ x: 0, y: restY(), k: fitK(), rot: 0, yaw: 0 }, 2200);
  requestAnimationFrame(frame);
  const h = location.hash.slice(1);
  if (byId.has(h)) setTimeout(() => openPerson(h), reduceMotion ? 0 : 900);
  else if (h === 'about') openAbout();

  /* ---------- Ambient embers ---------- */
  (function embers() {
    const cv = $('#embers'), ctx = cv.getContext('2d'); if (!ctx) return;
    let w, hh, parts = [];
    const make = init => ({ x: Math.random() * w, y: init ? Math.random() * hh : hh + 10, r: .6 + Math.random() * 1.7, vy: .1 + Math.random() * .3, sw: Math.random() * 6.28, d: .2 + Math.random() * .8, a: .12 + Math.random() * .4 });
    function rs() { const dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; hh = innerHeight; cv.width = w * dpr; cv.height = hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); parts = Array.from({ length: Math.round(Math.min(80, w * hh / 18000)) }, () => make(true)); }
    let px = cam.x, py = cam.y;
    function draw(t) {
      ctx.clearRect(0, 0, w, hh);
      const dx = cam.x - px, dy = cam.y - py; px = cam.x; py = cam.y; // parallax with panning
      for (const p of parts) {
        if (!reduceMotion) { p.y -= p.vy * p.d - dy * p.d * .15; p.x += dx * p.d * .15; p.sw += .01; }
        if (p.y < -10) Object.assign(p, make(false)); if (p.y > hh + 20) p.y = -5;
        if (p.x < -10) p.x = w + 5; if (p.x > w + 10) p.x = -5;
        const x = p.x + Math.sin(p.sw + t / 3000) * 6 * p.d;
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 4);
        g.addColorStop(0, `rgba(242,177,52,${p.a * p.d})`); g.addColorStop(1, 'rgba(242,177,52,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, p.y, p.r * 4, 0, 6.283); ctx.fill();
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }
    rs(); addEventListener('resize', rs); requestAnimationFrame(draw);
  })();
})();
