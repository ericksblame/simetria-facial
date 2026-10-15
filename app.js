import { FaceLandmarker, FilesetResolver } from './vendor/vision_bundle.mjs';
import {
  analyze, aggregate, evaluate, amount, fmt, METRICS, ZONES, LANDMARKS as IDX, STATUS_LABEL,
} from './measure.js';
import { GENERAL, BY_ZONE } from './recs.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const video = $('video');

const HISTORY_KEY = 'simetria-facial.historial.v1';
const LIVE_FRAMES = 20;      // fotogramas para suavizar la lectura en vivo
const CAPTURE_FRAMES = 45;   // fotogramas válidos para una medición guardada (≈ 2–3 s)
const CAPTURE_MIN_FRAMES = 15; // si el equipo va lento, basta con esto tras CAPTURE_MIN_MS
const CAPTURE_MIN_MS = 4000;
const CAPTURE_TIMEOUT = 15000;

const state = {
  landmarker: null,
  runningMode: 'VIDEO',
  mode: 'idle', // 'idle' | 'camera' | 'photo'
  stream: null,
  lastVideoTime: -1,
  buffer: [],
  lastAnalysis: null,
  current: null,      // { metrics, source }
  currentEval: null,
  capture: null,      // { frames, startedAt }
  photo: null,        // { img, analysis }
  lastUi: 0,
  recsKey: '',
  showMesh: true,
};

// ---------- Modelo ----------

async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks('./vendor/wasm');
  const options = delegate => ({
    baseOptions: { modelAssetPath: './models/face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
  try {
    state.landmarker = await FaceLandmarker.createFromOptions(vision, options('GPU'));
  } catch (e) {
    console.warn('GPU no disponible, uso CPU', e);
    state.landmarker = await FaceLandmarker.createFromOptions(vision, options('CPU'));
  }
  setStatus('Listo. Enciende la cámara o analiza una foto.');
}

async function setRunningMode(mode) {
  if (state.runningMode === mode) return;
  await state.landmarker.setOptions({ runningMode: mode });
  state.runningMode = mode;
}

// ---------- Cámara ----------

async function startCamera() {
  if (!state.landmarker) return;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    setStatus('No se pudo abrir la cámara. Revisa el permiso del navegador (en Mac: Ajustes del Sistema → Privacidad → Cámara; en iPhone: Ajustes → Apps → Safari → Cámara).');
    return;
  }
  video.srcObject = state.stream;
  await video.play();
  await setRunningMode('VIDEO');
  setCanvasSize(video.videoWidth, video.videoHeight);
  state.mode = 'camera';
  state.photo = null;
  state.buffer = [];
  state.lastVideoTime = -1;
  $('stageEmpty').hidden = true;
  $('btnCamera').textContent = 'Apagar cámara';
  $('btnCapture').textContent = 'Medir y guardar';
  $('btnCapture').disabled = false;
  setStatus('Cámara encendida. Mira de frente con la cara relajada.');
  scheduleLoop();
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  state.stream = null;
  video.srcObject = null;
  state.mode = 'idle';
  cancelCapture();
  $('btnCamera').textContent = 'Encender cámara';
  $('btnCapture').disabled = true;
  $('hint').hidden = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('stageEmpty').hidden = false;
  setStatus('Cámara apagada.');
}

function loop() {
  if (state.mode !== 'camera') return;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    const res = state.landmarker.detectForVideo(video, performance.now());
    onCameraResult(res);
  }
  scheduleLoop();
}

// requestAnimationFrame se detiene si la ventana no se está pintando; el temporizador evita que la medición se quede colgada.
function scheduleLoop() {
  let done = false;
  const tick = () => { if (!done) { done = true; loop(); } };
  requestAnimationFrame(tick);
  setTimeout(tick, 100);
}

function onCameraResult(res) {
  const a = res.faceLandmarks && res.faceLandmarks.length
    ? analyze(res.faceLandmarks[0], canvas.width, canvas.height, res.facialTransformationMatrixes?.[0])
    : null;
  state.lastAnalysis = a;

  if (a && a.valid) {
    state.buffer.push(a.metrics);
    if (state.buffer.length > LIVE_FRAMES) state.buffer.shift();
    if (state.capture) {
      state.capture.frames.push(a.metrics);
      const n = state.capture.frames.length, elapsed = performance.now() - state.capture.startedAt;
      if (n >= CAPTURE_FRAMES || (n >= CAPTURE_MIN_FRAMES && elapsed >= CAPTURE_MIN_MS)) finishCapture();
    }
  }
  if (state.capture) updateCaptureProgress();

  showHint(!a ? 'No veo ninguna cara' : a.issues[0] || '');

  const now = performance.now();
  if (now - state.lastUi > 200 && state.buffer.length >= 5) {
    state.lastUi = now;
    setCurrent(aggregate(state.buffer), 'la lectura en vivo');
  }
  draw(video, a, true);
}

// ---------- Foto ----------

async function analyzePhoto(file) {
  if (!state.landmarker || !file) return;
  if (state.mode === 'camera') stopCamera();
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    setStatus('No se pudo abrir esa imagen.');
    return;
  }
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  setCanvasSize(Math.round(img.width * scale), Math.round(img.height * scale));
  await setRunningMode('IMAGE');
  const res = state.landmarker.detect(img);
  state.mode = 'photo';
  $('stageEmpty').hidden = true;
  if (!res.faceLandmarks || !res.faceLandmarks.length) {
    state.photo = { img, analysis: null };
    draw(img, null, false);
    showHint('No encuentro ninguna cara en la foto');
    $('btnCapture').disabled = true;
    return;
  }
  const a = analyze(res.faceLandmarks[0], canvas.width, canvas.height, res.facialTransformationMatrixes?.[0]);
  const metrics = robustPhotoMetrics(img, a.metrics);
  state.photo = { img, analysis: a, metrics };
  state.lastAnalysis = a;
  setCurrent(metrics, 'la foto');
  showHint(a.valid ? '' : `${a.issues[0]} (la medición puede no ser fiable)`);
  draw(img, a, false);
  $('btnCapture').textContent = 'Guardar esta medición';
  $('btnCapture').disabled = false;
  setStatus('Foto analizada. «Derecho» e «izquierdo» son tu lado real solo si la foto no está en modo espejo.');
}

// Una sola detección tiene bastante ruido. Repetimos con la foto algo girada, escalada y en espejo,
// y nos quedamos con la mediana. El espejo además anula cualquier sesgo del modelo hacia un lado de la imagen.
const PHOTO_VARIANTS = [[0, 1], [-3, 1], [3, 1], [0, 0.85], [-3, 0.85], [3, 0.85]];

function robustPhotoMetrics(img, baseMetrics) {
  const W = canvas.width, H = canvas.height;
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d');
  const frames = [baseMetrics];
  for (const flip of [false, true]) {
    for (const [deg, scale] of PHOTO_VARIANTS) {
      if (!flip && deg === 0 && scale === 1) continue; // ya es baseMetrics
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#808080';
      g.fillRect(0, 0, W, H);
      g.translate(W / 2, H / 2);
      if (flip) g.scale(-1, 1);
      g.rotate(deg * Math.PI / 180);
      g.scale(scale, scale);
      g.drawImage(img, -W / 2, -H / 2, W, H);
      const res = state.landmarker.detect(off);
      if (!res.faceLandmarks || !res.faceLandmarks.length) continue;
      const m = analyze(res.faceLandmarks[0], W, H, null).metrics;
      // Girar la imagen +deg (sentido horario) cambia la inclinación medida en −deg; lo compensamos.
      // Con espejo, el giro se aplica antes de reflejar y en pantalla queda en sentido contrario.
      m.headTilt += flip ? -deg : deg;
      // En espejo, cada lado pasa a ser el otro: todas las métricas cambian de signo.
      if (flip) for (const k in m) if (m[k] !== null) m[k] = -m[k];
      frames.push(m);
    }
  }
  return aggregate(frames);
}

// ---------- Medir y guardar ----------

function startCapture() {
  if (state.mode === 'photo' && state.photo?.metrics) {
    saveMeasurement(state.photo.metrics, 'foto');
    return;
  }
  if (state.mode !== 'camera') return;
  state.capture = { frames: [], startedAt: performance.now() };
  $('btnCapture').disabled = true;
  $('progress').hidden = false;
  updateCaptureProgress();
}

function updateCaptureProgress() {
  const c = state.capture;
  const elapsed = performance.now() - c.startedAt;
  const p = Math.min(1, Math.max(c.frames.length / CAPTURE_FRAMES, Math.min(elapsed / CAPTURE_MIN_MS, c.frames.length / CAPTURE_MIN_FRAMES)));
  $('progressBar').style.width = `${p * 100}%`;
  $('progressText').textContent = c.frames.length ? 'Midiendo… quédate quieto y relajado' : 'Esperando a que mires de frente…';
  if (elapsed > CAPTURE_TIMEOUT) {
    cancelCapture();
    setStatus('No se pudo medir: la cara no estuvo de frente el tiempo suficiente. Inténtalo de nuevo.');
  }
}

function cancelCapture() {
  state.capture = null;
  $('progress').hidden = true;
  if (state.mode === 'camera') $('btnCapture').disabled = false;
}

function finishCapture() {
  const metrics = aggregate(state.capture.frames);
  cancelCapture();
  saveMeasurement(metrics, 'camara');
}

function saveMeasurement(metrics, source) {
  const ev = evaluate(metrics);
  const entry = { t: new Date().toISOString(), source, score: ev.score, metrics };
  const history = loadHistory();
  history.push(entry);
  saveHistory(history);
  setCurrent(metrics, 'la medición guardada');
  renderHistory();
  setStatus(`Medición guardada (${ev.score}/100).`);
}

// ---------- Dibujo ----------

const COLORS = { ok: '#3fbf7f', leve: '#f2b33d', marcada: '#f0665c', none: '#9b9a94' };

function setCanvasSize(w, h) {
  canvas.width = w;
  canvas.height = h;
  $('stage').style.aspectRatio = `${w} / ${h}`;
}

function draw(src, a, mirror) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, 0, 0, W, H);
  if (a) drawOverlay(a);
  ctx.restore();
}

function drawOverlay(a) {
  const { P, c, d, ipd, faceLen } = a.geom;
  const per = state.currentEval?.per || {};
  const col = key => COLORS[per[key]?.status || 'none'];
  const lw = Math.max(1.5, ipd / 60);
  const perp = { x: d.y, y: -d.x };

  const line = (p, q, color, width = lw, dash = []) => {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
  };
  const dot = (p, color, r = lw * 2) => {
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = lw * 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
  };
  const poly = (idxs, color) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    idxs.forEach((i, n) => (n ? ctx.lineTo(P[i].x, P[i].y) : ctx.moveTo(P[i].x, P[i].y)));
    ctx.stroke();
  };
  const mean = idxs => ({
    x: idxs.reduce((s, i) => s + P[i].x, 0) / idxs.length,
    y: idxs.reduce((s, i) => s + P[i].y, 0) / idxs.length,
  });
  const along = (p, v, t) => ({ x: p.x + v.x * t, y: p.y + v.y * t });
  // Proyección de un punto sobre la línea media.
  const onMid = p => along(c, d, (p.x - c.x) * d.x + (p.y - c.y) * d.y);
  // Línea de referencia: perpendicular a la línea media (lo que sería "a nivel").
  const level = (p, q, key) => {
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const half = Math.hypot(q.x - p.x, q.y - p.y) / 2 + ipd * 0.12;
    line(along(m, perp, -half), along(m, perp, half), 'rgba(255,255,255,0.55)', lw * 0.7, [lw * 3, lw * 3]);
    line(p, q, col(key), lw * 1.2);
  };

  if (state.showMesh) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    const r = Math.max(0.8, lw * 0.45);
    for (let i = 0; i < Math.min(P.length, 468); i++) ctx.fillRect(P[i].x - r / 2, P[i].y - r / 2, r, r);
  }

  // Línea media
  line(along(c, d, -faceLen * 0.45), along(c, d, faceLen * 1.05), 'rgba(120,220,255,0.9)', lw, [lw * 4, lw * 3]);

  // Cejas
  poly(IDX.rBrow, col('browHeight'));
  poly(IDX.lBrow, col('browHeight'));
  level(mean(IDX.rBrow), mean(IDX.lBrow), 'browHeight');

  // Ojos
  const eR = mean([IDX.rEye.outer, IDX.rEye.inner]), eL = mean([IDX.lEye.outer, IDX.lEye.inner]);
  level(eR, eL, 'eyeHeight');
  for (const e of [IDX.rEye, IDX.lEye]) {
    line(P[e.top], P[e.bottom], col('eyeOpening'), lw);
    for (const i of [e.outer, e.inner]) dot(P[i], col('eyeHeight'), lw * 1.6);
  }

  // Boca
  level(P[IDX.rMouth], P[IDX.lMouth], 'mouthCorners');
  dot(P[IDX.rMouth], col('mouthCorners'));
  dot(P[IDX.lMouth], col('mouthCorners'));
  const lip = mean(IDX.lipCenter);
  line(onMid(lip), lip, col('mouthCenter'), lw);
  dot(lip, col('mouthCenter'), lw * 1.6);

  // Nariz y mentón: desplazamiento horizontal respecto a la línea media
  for (const [i, key] of [[IDX.noseTip, 'nose'], [IDX.chin, 'chin']]) {
    line(onMid(P[i]), P[i], col(key), lw);
    dot(P[i], col(key));
  }

  // Mandíbula
  poly(IDX.rJaw, col('jawWidth'));
  poly(IDX.lJaw, col('jawWidth'));
  for (const i of [...IDX.rJaw, ...IDX.lJaw]) dot(P[i], col('jawWidth'), lw * 1.4);
}

// ---------- Resultados ----------

function setCurrent(metrics, source) {
  state.current = { metrics, source };
  state.currentEval = evaluate(metrics);
  renderResults();
}

function renderResults() {
  const ev = state.currentEval;
  if (!ev) return;
  const score = ev.score;
  const ring = $('scoreRing');
  ring.style.setProperty('--p', score ?? 0);
  ring.style.setProperty('--c', score >= 85 ? 'var(--ok)' : score >= 70 ? 'var(--mild)' : 'var(--strong)');
  $('scoreValue').textContent = score ?? '–';
  $('scoreSource').textContent = `Según ${state.current.source}`;

  $('zones').innerHTML = ZONES.map(z => {
    const zone = ev.zones.find(x => x.id === z.id);
    const rows = z.metrics.map(key => {
      const p = ev.per[key], def = METRICS[key];
      if (p.v === null) {
        return `<div class="metric"><span class="label">${def.label}</span><span class="value">–</span>
          <span class="desc muted">Sin dato (¿ojos cerrados?)</span></div>`;
      }
      const fill = Math.min(1, Math.abs(p.v) / def.limit) * 100;
      return `<div class="metric">
        <span class="label">${def.label}</span><span class="value">${amount(p.v, def.unit)}</span>
        <div class="meter" title="Verde hasta ${fmt(def.green, def.unit === 'deg' ? 0 : 1)}, ámbar hasta ${fmt(def.amber, def.unit === 'deg' ? 0 : 1)}"><i style="width:${fill}%;background:var(--${cssStatus(p.status)})"></i></div>
        <span class="desc">${def.describe(p.v)}</span>
      </div>`;
    }).join('');
    const note = z.posture ? '<p class="muted small" style="margin:6px 0 0">Es postura, no forma de la cara: no cuenta en la puntuación.</p>' : '';
    return `<div class="zone${z.posture ? ' posture' : ''}">
      <div class="zone-head"><h3>${z.name}</h3><span class="badge ${zone.status}">${STATUS_LABEL[zone.status]}</span></div>
      ${rows}${note}
    </div>`;
  }).join('');

  renderRecs();
}

const cssStatus = s => ({ ok: 'ok', leve: 'mild', marcada: 'strong', none: 'muted' }[s]);

function recCard(r) {
  return `<div class="rec${r.pro ? ' pro' : ''}">
    ${r.pro ? '<span class="rec-tag">Profesional</span>' : ''}
    <h4>${r.title}</h4><p>${r.how}</p><p class="effect">Qué esperar: ${r.effect}</p>
  </div>`;
}

function renderRecs() {
  const ev = state.currentEval;
  const flagged = ev ? ev.zones.filter(z => z.status === 'leve' || z.status === 'marcada').sort((a, b) => b.severity - a.severity) : [];
  const key = flagged.map(z => z.id + z.status).join('|') + (ev ? '' : 'none');
  if (key === state.recsKey) return;
  state.recsKey = key;

  if (!ev) {
    $('recsIntro').textContent = 'Mide tu cara para ver recomendaciones según tus zonas con más diferencia.';
  } else if (!flagged.length) {
    $('recsIntro').textContent = 'Todas las zonas están dentro de lo habitual. No hace falta nada especial: con los hábitos generales es suficiente.';
  } else {
    const names = flagged.map(z => z.name.toLowerCase()).join(', ');
    $('recsIntro').textContent = `Zonas con más diferencia, de mayor a menor: ${names}. Empieza por la primera y no hagas más de 2–3 ejercicios a la vez.`;
  }

  let html = flagged.map(z => {
    const zr = BY_ZONE[z.id];
    const strong = z.status === 'marcada' && !z.posture
      ? recCard({
        title: 'Diferencia marcada',
        how: 'Si la has notado hace poco o va a más, consúltala con un médico. Si siempre ha estado ahí, suele ser estructural y los ejercicios cambiarán poco.',
        effect: 'Un profesional puede decirte la causa y si tiene tratamiento.',
        pro: true,
      })
      : '';
    return `<div class="rec-group">
      <h3>${z.name} <span class="badge ${z.status}">${STATUS_LABEL[z.status]}</span></h3>
      <p class="muted small">${zr.intro}</p>
      <div class="rec-list">${strong}${zr.items.map(recCard).join('')}</div>
    </div>`;
  }).join('');
  html += `<div class="rec-group"><h3>Hábitos generales</h3>
    <p class="muted small">Útiles para todo el mundo. Son la base; los ejercicios de arriba son un complemento.</p>
    <div class="rec-list">${GENERAL.map(recCard).join('')}</div></div>`;
  $('recs').innerHTML = html;
}

// ---------- Historial ----------

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { setStatus('No se pudo guardar el historial en este navegador.'); }
}

function fillMetricSelect() {
  const sel = $('historyMetric');
  sel.innerHTML = '<option value="score">Puntuación global</option>' +
    Object.entries(METRICS).map(([k, d]) => `<option value="${k}">${ZONES.find(z => z.metrics.includes(k)).name}: ${d.label.toLowerCase()}</option>`).join('');
}

const dateFmt = t => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const dateTimeFmt = t => new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function renderHistory() {
  const h = loadHistory();
  renderChart(h);
  renderSuddenChange(h);
  $('historyBody').innerHTML = h.length
    ? h.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => {
      const ev = evaluate(e.metrics);
      const worst = ev.zones.filter(z => !z.posture).sort((a, b) => b.severity - a.severity)[0];
      return `<tr><td>${dateTimeFmt(e.t)}${e.source === 'foto' ? ' · foto' : ''}</td><td>${e.score}</td>
        <td>${worst.name} <span class="badge ${worst.status}">${STATUS_LABEL[worst.status]}</span></td>
        <td><button data-del="${i}" title="Borrar esta medición">Borrar</button></td></tr>`;
    }).join('')
    : '<tr><td colspan="4" class="muted">Todavía no hay mediciones guardadas.</td></tr>';
}

function renderChart(h) {
  const el = $('chart');
  if (!h.length) { el.innerHTML = ''; return; }
  const key = $('historyMetric').value;
  const isScore = key === 'score';
  const def = METRICS[key];
  const pts = h.map(e => ({ t: new Date(e.t).getTime(), v: isScore ? e.score : (e.metrics[key] === null ? null : Math.abs(e.metrics[key])) }))
    .filter(p => p.v !== null);
  if (!pts.length) { el.innerHTML = '<p class="muted small">Sin datos de esta métrica.</p>'; return; }

  const Wd = 760, Ht = 220, L = 44, R = 16, T = 12, B = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const yMax = isScore ? 100 : Math.max(def.limit, ...pts.map(p => p.v)) * 1.05;
  // Con menos de dos días de datos, repartir los puntos por orden; después, por fecha real.
  const byOrder = t1 - t0 < 2 * 86400000;
  const xs = new Map(pts.map((p, i) => [p.t, byOrder
    ? (pts.length > 1 ? i / (pts.length - 1) : 0)
    : (p.t - t0) / (t1 - t0)]));
  const x = t => L + xs.get(t) * (Wd - L - R);
  const y = v => T + (1 - v / yMax) * (Ht - T - B);

  let bands = '';
  if (!isScore) {
    bands = `<rect class="band-ok" x="${L}" width="${Wd - L - R}" y="${y(def.green)}" height="${y(0) - y(def.green)}"/>
      <rect class="band-mild" x="${L}" width="${Wd - L - R}" y="${y(def.amber)}" height="${y(def.green) - y(def.amber)}"/>
      <rect class="band-strong" x="${L}" width="${Wd - L - R}" y="${T}" height="${y(def.amber) - T}"/>`;
  }
  const ticks = isScore ? [0, 25, 50, 75, 100] : [0, def.green, def.amber, def.limit].filter(v => v <= yMax);
  const tickLabel = v => isScore ? v : def.unit === 'ipd' ? `${fmt(v * 63 / 100)} mm` : def.unit === 'pct' ? `${fmt(v, 0)} %` : `${fmt(v, 0)}°`;
  const grid = ticks.map(v => `<line class="axis" x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="gridtext" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tickLabel(v)}</text>`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map(p => `<circle class="dot" cx="${x(p.t)}" cy="${y(p.v)}" r="3.5"><title>${dateTimeFmt(p.t)}: ${isScore ? p.v : tickLabel(p.v)}</title></circle>`).join('');
  const xlabels = `<text class="gridtext" x="${L}" y="${Ht - 8}">${dateFmt(t0)}</text>` +
    (pts.length > 1 ? `<text class="gridtext" x="${Wd - R}" y="${Ht - 8}" text-anchor="end">${dateFmt(pts[pts.length - 1].t)}</text>` : '');
  const caption = isScore ? 'Más alto = más simétrico.' : 'Más bajo = más simétrico. Franjas: verde habitual, ámbar leve, rojo marcada.';
  el.innerHTML = `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Evolución">${bands}${grid}
    ${pts.length > 1 ? `<path class="line" d="${path}"/>` : ''}${dots}${xlabels}</svg>
    <p class="muted small" style="margin:4px 0 0">${caption}</p>`;
}

// Avisa si una zona pasó a "marcada" con un salto grande respecto a la medición anterior (≤ 30 días).
function renderSuddenChange(h) {
  const el = $('alert');
  el.hidden = true;
  if (h.length < 2) return;
  const cur = h[h.length - 1], prev = h[h.length - 2];
  if (new Date(cur.t) - new Date(prev.t) > 30 * 86400000) return;
  const changed = Object.keys(METRICS).filter(k => {
    if (k === 'headTilt') return false;
    const a = cur.metrics[k], b = prev.metrics[k];
    if (a === null || b === null) return false;
    const def = METRICS[k];
    return Math.abs(a) >= def.amber && Math.abs(a) - Math.abs(b) > def.amber - def.green;
  });
  if (!changed.length) return;
  const names = changed.map(k => `${ZONES.find(z => z.metrics.includes(k)).name.toLowerCase()} (${METRICS[k].label.toLowerCase()})`).join(', ');
  el.innerHTML = `<strong>Cambio grande respecto a la medición anterior:</strong> ${names}. Repite la medición con buena luz y mirando de frente. Si el cambio se confirma y también lo ves en el espejo, consúltalo con un médico. Si ha aparecido de golpe (boca o párpado caídos, dificultad para hablar), llama a emergencias.`;
  el.hidden = false;
}

function exportHistory() {
  const blob = new Blob([JSON.stringify(loadHistory(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `simetria-facial-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- UI ----------

function setStatus(text) { $('status').textContent = text; }
function showHint(text) {
  const el = $('hint');
  el.hidden = !text;
  el.textContent = text;
}

$('btnCamera').addEventListener('click', () => (state.mode === 'camera' ? stopCamera() : startCamera()));
$('fileInput').addEventListener('change', e => { analyzePhoto(e.target.files[0]); e.target.value = ''; });
$('btnCapture').addEventListener('click', startCapture);
$('chkMesh').addEventListener('change', e => {
  state.showMesh = e.target.checked;
  if (state.mode === 'photo' && state.photo) draw(state.photo.img, state.photo.analysis, false);
});
$('historyMetric').addEventListener('change', () => renderChart(loadHistory()));
$('btnExport').addEventListener('click', exportHistory);
$('btnClear').addEventListener('click', () => {
  if (!loadHistory().length) return;
  if (confirm('¿Borrar todo el historial de mediciones? No se puede deshacer.')) { saveHistory([]); renderHistory(); }
});
$('historyBody').addEventListener('click', e => {
  const i = e.target.dataset?.del;
  if (i === undefined) return;
  const h = loadHistory();
  h.splice(Number(i), 1);
  saveHistory(h);
  renderHistory();
});

fillMetricSelect();
renderHistory();
renderRecs();
$('btnCamera').disabled = true;
loadModel()
  .then(() => { $('btnCamera').disabled = false; })
  .catch(e => { console.error(e); setStatus('No se pudo cargar el modelo de puntos faciales. Recarga la página; en el Mac, ábrela con «Abrir Simetria.command».'); });

// Para pruebas desde la consola.
window.__simetria = { state, analyze, evaluate, analyzePhoto };
