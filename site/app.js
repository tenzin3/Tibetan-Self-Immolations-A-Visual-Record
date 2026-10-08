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
  const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return d ? `${d} ${MONTHS[m - 1]} ${y}` : m ? `${MONTHS[m - 1]} ${y}` : String(y); };
  const shortDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
  const cls = p => p.outcome === 'died' ? 'died' : p.outcome === 'survived' ? 'survived' : 'other';
  const fold = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hash = (id, salt) => { let h = 2166136261 ^ salt; for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  people.forEach(p => { p.search = fold([p.name, ...(p.aliases || []), p.location, p.affiliation, p.region, p.date.slice(0, 4)].join(' ')); });

  /* ---------- Header figures ---------- */
  $('#stats').innerHTML = `<b>${meta.people}</b> people · <b>${meta.died}</b> reported dead · <b>${meta.events}</b> incidents · ${meta.first_year}–${meta.last_year}`;

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

  /* ---------- Build SVG ---------- */
  const svg = $('#graph'), world = $('#world'), gLinks = $('#links'), gNodes = $('#nodes'), gYears = $('#years'), gHub = $('#hub');

  // faint dashed thread tracing the spiral (time)
  {
    const pts = []; const th0 = R0 / b - .6;
    for (let th = th0; th <= theta; th += .05) { const q = at(th); pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
    $('#thread').setAttribute('d', 'M' + pts.join('L'));
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
    const g = el('g', { class: `node ${cls(p)}`, id: p.id, tabindex: '0', role: 'button', 'aria-label': `${p.name}, ${fmtDate(p.date)}. ${p.outcome_label}.` }, gNodes);
    g.dataset.id = p.id;
    const upright = el('g', {}, g);
    const pop = el('g', { class: 'pop' }, upright);
    el('circle', { class: 'halo', r: NODE_R * 1.9 }, pop);
    el('circle', { class: 'ring', r: NODE_R }, pop);
    if (p.portrait && p.portrait.file) {
      el('image', { href: p.portrait.file, x: -NODE_R + 1, y: -NODE_R + 1, width: (NODE_R - 1) * 2, height: (NODE_R - 1) * 2, 'clip-path': 'url(#clip-circle)', preserveAspectRatio: 'xMidYMid slice' }, pop);
    } else {
      el('text', { class: 'ini', y: 1 }, pop).textContent = p.initials;
    }
    const lines = splitName(p.name);
    lines.forEach((ln, i) => { el('text', { class: 'nm', y: NODE_R + 13 + i * 11 }, upright).textContent = ln; });
    el('text', { class: 'dt', y: NODE_R + 13 + lines.length * 11 }, upright).textContent = shortDate(p.date);
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
  el('text', { class: 'big', y: 10 }, gHub).textContent = meta.people;
  el('text', { class: 'sub', y: 32 }, gHub).textContent = 'LIVES';
  el('text', { class: 'yrs', y: -36 }, gHub).textContent = `${meta.first_year} – ${meta.last_year}`;
  el('text', { class: 'yrs', y: 52 }, gHub).textContent = 'about this record';

  /* ---------- Camera ---------- */
  const cam = { x: 0, y: 0, k: 1, rot: 0 }; // rot in radians
  let W = innerWidth, H = innerHeight, tween = null;
  const K_MIN = .18, K_MAX = 5;
  const fitK = () => Math.max(K_MIN, Math.min(W, H - (W < 640 ? 230 : 120)) / (2 * EXTENT));
  const clampK = k => Math.min(K_MAX, Math.max(K_MIN, k));
  function zoomAt(sx, sy, factor) {
    const k2 = clampK(cam.k * factor), f = k2 / cam.k;
    const vx = sx - W / 2 - cam.x, vy = sy - H / 2 - cam.y;
    cam.x = sx - W / 2 - f * vx; cam.y = sy - H / 2 - f * vy; cam.k = k2;
  }
  function rotateAt(sx, sy, d) {
    const c = Math.cos(d), s = Math.sin(d), px = W / 2 + cam.x - sx, py = H / 2 + cam.y - sy;
    cam.x = sx - W / 2 + (c * px - s * py); cam.y = sy - H / 2 + (s * px + c * py); cam.rot += d;
  }
  const hubScreen = () => [W / 2 + cam.x, H / 2 + cam.y];
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function flyTo(target, ms = 750) {
    if (reduceMotion) { Object.assign(cam, target); return; }
    tween = { from: { ...cam }, to: target, t0: performance.now(), ms };
  }
  function viewFor(p, k) {
    // put person p at the visible centre (left of the drawer on wide screens)
    const offX = W > 640 && drawerOpen ? -Math.min(440, W) / 2 : 0, offY = W <= 640 && drawerOpen ? -H * .3 : 0;
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return { k, rot: cam.rot, x: offX - k * (c * p.wx - s * p.wy), y: offY - k * (s * p.wx + c * p.wy) };
  }
  const resetView = () => flyTo({ x: 0, y: W <= 640 ? 60 : 10, k: fitK(), rot: 0 }, 900);

  /* ---------- Render loop ---------- */
  let spinning = !reduceMotion, interacting = false, drawerOpen = false, lastT = performance.now(), lastRotDeg = null, lastLod = '';
  const SPIN = 0.045; // radians per second
  function frame(t) {
    const dt = Math.min(64, t - lastT); lastT = t;
    if (tween) {
      const u = Math.min(1, (t - tween.t0) / tween.ms), e = ease(u);
      for (const key of ['x', 'y', 'k', 'rot']) cam[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
      if (u >= 1) tween = null;
    } else if (spinning && !interacting && !drawerOpen) {
      const [hx, hy] = hubScreen(); rotateAt(hx, hy, SPIN * dt / 1000);
    }
    const deg = cam.rot * 180 / Math.PI;
    world.setAttribute('transform', `translate(${(W / 2 + cam.x).toFixed(2)} ${(H / 2 + cam.y).toFixed(2)}) scale(${cam.k.toFixed(4)}) rotate(${deg.toFixed(3)})`);
    const counter = `rotate(${(-deg).toFixed(3)})`;
    const rotChanged = deg !== lastRotDeg; lastRotDeg = deg;
    for (const p of people) {
      let x = p.wx, y = p.wy;
      if (!reduceMotion) { x += Math.sin(t * p.sp1 + p.ph1) * 4; y += Math.cos(t * p.sp2 + p.ph2) * 4; }
      p.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      if (rotChanged) p.upright.setAttribute('transform', counter);
      if (!reduceMotion || !p.linkDone) {
        // gentle swirl: control point trails behind the person, like a spiral arm
        const cr = p.wr * .55, ca = p.wa - .42;
        p.link.setAttribute('d', `M0,0Q${(cr * Math.cos(ca)).toFixed(1)},${(cr * Math.sin(ca)).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`);
        p.linkDone = true;
      }
    }
    if (rotChanged) { yearMarks.forEach(m => m.g.setAttribute('transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) ${counter}`)); gHub.setAttribute('transform', counter); }
    const lod = cam.k < .42 ? 'far' : cam.k < .75 ? 'mid' : '';
    if (lod !== lastLod) { svg.classList.toggle('far', lod === 'far'); svg.classList.toggle('mid', lod === 'mid'); lastLod = lod; }
    requestAnimationFrame(frame);
  }

  /* ---------- Pointer: drag = pan, Shift+drag = rotate, two fingers = pinch zoom + twist ---------- */
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
    if (downInfo.shift || e.shiftKey) {
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

  // hover highlight of a person's line
  gNodes.addEventListener('pointerover', e => { const n = e.target.closest('.node'); if (n) byId.get(n.dataset.id).link.classList.add('on'); });
  gNodes.addEventListener('pointerout', e => { const n = e.target.closest('.node'); if (n && n.dataset.id !== openId) byId.get(n.dataset.id).link.classList.remove('on'); });
  gNodes.addEventListener('focusin', e => { const n = e.target.closest('.node'); if (n) byId.get(n.dataset.id).link.classList.add('on'); });
  gNodes.addEventListener('focusout', e => { const n = e.target.closest('.node'); if (n && n.dataset.id !== openId) byId.get(n.dataset.id).link.classList.remove('on'); });
  gNodes.addEventListener('keydown', e => { const n = e.target.closest('.node'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPerson(n.dataset.id); } });
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
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || drawerOpen) return;
    const map = { '+': () => zoomBtn(1.4), '=': () => zoomBtn(1.4), '-': () => zoomBtn(1 / 1.4), '_': () => zoomBtn(1 / 1.4), '[': () => rotBtn(-Math.PI / 8), ']': () => rotBtn(Math.PI / 8), '0': resetView,
      ArrowLeft: () => { cam.x += 60; }, ArrowRight: () => { cam.x -= 60; }, ArrowUp: () => { cam.y += 60; }, ArrowDown: () => { cam.y -= 60; } };
    if (e.key === ' ' && !e.target.closest('button, .node, .hub')) { e.preventDefault(); setSpin(!spinning); return; }
    if (map[e.key] && !e.target.closest('button') ) { e.preventDefault(); tween = null; map[e.key](); }
  });
  function hintQuiet() { $('#hint').classList.add('quiet'); }

  /* ---------- Search & outcome filter ---------- */
  const OUTCOMES = [['', 'Everyone'], ['died', 'Died'], ['survived', 'Survived'], ['other', 'Custody, injured, unknown']];
  $('#chips').innerHTML = OUTCOMES.map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === ''}">${l} <b>${k ? people.filter(p => cls(p) === k).length : people.length}</b></button>`).join('');
  let outcomeKey = '', matches = [];
  function applyFilters() {
    const q = fold($('#q').value.trim());
    matches = [];
    people.forEach(p => {
      const ok = (!q || p.search.includes(q)) && (!outcomeKey || cls(p) === outcomeKey);
      const filtering = q || outcomeKey;
      p.g.classList.toggle('dim', !ok); p.link.classList.toggle('dim', !ok);
      p.g.classList.toggle('match', !!(ok && q)); p.link.classList.toggle('match', !!(ok && filtering));
      if (ok) matches.push(p);
    });
    const c = $('#count');
    if (!q && !outcomeKey) { c.textContent = ''; return; }
    c.innerHTML = matches.length
      ? `${matches.length} of ${people.length} · <button type="button" id="go-first">Show ${esc(matches[0].name)}</button>`
      : 'No one matches. Try another spelling.';
    const gf = $('#go-first'); if (gf) gf.addEventListener('click', () => openPerson(matches[0].id));
  }
  $('#q').addEventListener('input', applyFilters);
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && matches.length && $('#q').value.trim()) openPerson(matches[0].id); });
  $$('.chip').forEach(c => c.addEventListener('click', () => { outcomeKey = c.dataset.k; $$('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); applyFilters(); }));

  /* ---------- Drawer: one person, or the "about" page ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  let openId = null, returnFocus = null;
  const faceHTML = p => `<div class="face ${cls(p)}">${p.portrait && p.portrait.file ? `<img src="${esc(p.portrait.file)}" alt="Portrait of ${esc(p.name)}">` : `<span aria-hidden="true">${esc(p.initials)}</span>`}</div>`;
  const fact = (label, value, extra, wide) => value || value === 0 ? `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${esc(value)}${extra ? `<small>${esc(extra)}</small>` : ''}</dd></div>` : '';

  function personHTML(p) {
    const parents = [p.father && `Father: ${p.father}`, p.mother && `Mother: ${p.mother}`].filter(Boolean).join(' · ');
    const dateCorr = p.corrections.find(c => c.field === 'incident date');
    let death = '';
    if (p.outcome === 'died') {
      death = p.death_date ? fmtDate(p.death_date) : 'Date not given';
      if (p.days_until_death === 0) death += ', the same day';
      else if (p.days_until_death > 0) death += `, ${p.days_until_death} day${p.days_until_death === 1 ? '' : 's'} later`;
    }
    const others = (p.shared_with || []).map(id => byId.get(id)).filter(Boolean);
    return `
      <div class="d-head">${faceHTML(p)}
        <div><p class="eyebrow">Record ${p.position} of ${people.length}</p>
          <h2 id="d-name">${esc(p.name)}</h2>
          ${p.aliases.length ? `<p class="aka">Also recorded as ${esc(p.aliases.join(', '))}</p>` : ''}
          <span class="pill ${cls(p)}">${esc(p.outcome_label)}</span></div></div>
      <dl class="facts">
        ${fact('Date of protest', fmtDate(p.date), dateCorr ? `Corrected; CTA lists ${dateCorr.original}` : '')}
        ${fact('Age', p.age, p.age_is_approximate ? 'Approximate, as published' : '')}
        ${fact('Gender', p.gender || 'Not stated')}
        ${fact('Province', p.region)}
        ${p.outcome === 'died' ? fact('Died', death) : fact('Status as reported', p.status_as_published)}
        ${fact('Place of protest', p.location, '', true)}
        ${fact('Monastery, village or occupation', p.affiliation, '', true)}
        ${parents ? fact('Parents', parents, '', true) : ''}
      </dl>
      ${others.length ? `<div class="d-section"><h3>Same day, same place</h3><div class="together">${others.map(o => `<button type="button" data-go="${o.id}">${esc(o.name)}</button>`).join('')}</div></div>` : ''}
      ${p.corrections.length || p.notes.length || p.checks.length ? `<div class="d-section"><h3>Notes on this record</h3>
        ${p.corrections.map(c => `<p class="note"><span class="cert">${esc(c.certainty)} certainty correction</span><br><b>${esc(c.field)}</b>: CTA gives “${esc(c.original)}”; shown here as “${esc(c.field.includes('date') ? fmtDate(c.used) : c.used)}”. ${esc(c.evidence)}</p>`).join('')}
        ${p.checks.map(c => `<p class="note">${esc(c)}</p>`).join('')}
        ${p.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}</div>` : ''}
      <div class="d-section"><h3>Sources</h3>
        ${p.sources.map(s => `<a class="src" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener">${esc(s.title)}<small>${esc(s.publisher)} ↗</small></a>`).join('')}
        ${p.portrait ? `<p class="fine">Portrait: ${esc(p.portrait.credit || 'credit not given')}${p.portrait.source_url ? ` · <a href="${esc(safeURL(p.portrait.source_url))}" target="_blank" rel="noopener">original</a>` : ''}</p>` : ''}
      </div>
      <p class="fine">As published by CTA: <span class="raw">${esc(p.date_as_published)} · ${esc(p.status_as_published)}</span>. The status describes what was reported at the time.</p>`;
  }

  function aboutHTML() {
    const years = []; for (let y = meta.first_year; y <= meta.last_year; y++) years.push(y);
    const per = y => people.filter(p => +p.date.slice(0, 4) === y).length, max = Math.max(...years.map(per));
    return `<div class="about">
      <p class="eyebrow">About this record</p>
      <h2 id="d-name">${meta.people} people, ${meta.first_year}–${meta.last_year}</h2>
      <p>Every circle is one person recorded by the <a href="${esc(meta.source_url)}" target="_blank" rel="noopener">Central Tibetan Administration</a> as having set themselves on fire in protest. All of them are linked to this centre. They are placed on a spiral of time: the earliest, Tapey in February 2009, sits nearest the centre, and the most recent, in March 2022, sits on the outer edge.</p>
      <div class="d-section"><h3>People by year</h3><div class="yearbars">${years.map(y => `<div><span>${y}</span><i style="width:${per(y) ? Math.max(2, per(y) / max * 100) : 0}%"></i><span>${per(y)}</span></div>`).join('')}</div></div>
      <div class="d-section"><h3>Reading the graph</h3><ul>
        <li>Amber ring: died (${meta.died}). Green ring: survived. Dashed ring: in custody, injured with no later report, or unknown.</li>
        <li>Outcomes describe what the source reported at the time, not anyone's situation today.</li>
        <li>Names and dates appear as you zoom in. Hover or focus a person to light their line to the centre.</li>
        <li>Drag to move. Scroll or pinch to zoom. Shift + drag, Shift + scroll, a two-finger twist, or the ⟲ ⟳ buttons rotate. Keys: + − zoom, [ ] rotate, arrows move, 0 resets, space starts or stops the slow rotation.</li>
      </ul></div>
      <div class="d-section"><h3>Scope and review</h3>
      <p>The table was transcribed on ${fmtDate(meta.retrieved)}. ${meta.corrections_applied} fields were corrected after review against contemporary reports; each person's panel shows the original value, the value used, and the evidence.</p>
      <p>The International Campaign for Tibet counts 159 people inside Tibet and China since 2009, plus 11 in exile. Exile cases and the 30 March 2022 report of Tsering Samdup are not yet included.</p>
      <p>${meta.with_portrait ? `${meta.with_portrait} people have a verified portrait; everyone else is shown by their initials.` : 'No portraits have been added yet, so each person is shown by their initials. A portrait appears once a verified photograph is registered for that record.'}</p>
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
  // opening move: start far out and drift in to the full view
  Object.assign(cam, { x: 0, y: W <= 640 ? 60 : 10, k: fitK() * (reduceMotion ? 1 : .45), rot: reduceMotion ? 0 : -.6 });
  if (!reduceMotion) flyTo({ x: 0, y: W <= 640 ? 60 : 10, k: fitK(), rot: 0 }, 2200);
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
