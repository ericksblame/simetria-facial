// Geometría de la simetría facial a partir de los 478 puntos de MediaPipe Face Landmarker.
//
// Convenciones:
// - "Derecho/izquierdo" es siempre el lado real de la persona, no el de la pantalla.
//   En el fotograma original de la cámara (sin espejo), el lado derecho de la persona
//   aparece a la izquierda de la imagen; los índices 33, 133, 61… son de su lado derecho.
// - La línea media se ajusta con puntos de la frente y el puente nasal; todo se gira
//   para que esa línea quede vertical, así la inclinación de la cabeza no cuenta como asimetría.
// - Las distancias se expresan como % de la distancia entre los centros de los ojos
//   (≈ 63 mm en un adulto), para que no dependan de lo cerca que estés de la cámara.

export const IPD_MM = 63;

const IDX = {
  midline: [10, 151, 9, 8, 168, 6],
  rEye: { outer: 33, inner: 133, top: 159, bottom: 145 },
  lEye: { outer: 263, inner: 362, top: 386, bottom: 374 },
  rBrow: [70, 63, 105, 66, 107],
  lBrow: [300, 293, 334, 296, 336],
  rMouth: 61,
  lMouth: 291,
  lipCenter: [0, 17, 13, 14],
  innerLips: [13, 14],
  noseTip: 1,
  chin: 152,
  rJaw: [58, 172, 136, 150],
  lJaw: [288, 397, 365, 379],
};
export const LANDMARKS = IDX;

const DEG = 180 / Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// unit: 'ipd' = % de la distancia entre ojos (se muestra en mm aprox.), 'pct' = % relativo, 'deg' = grados
// green / amber: hasta dónde es "habitual" / "leve"; limit: a partir de aquí la puntuación de esa métrica es 0.
export const METRICS = {
  eyeHeight: {
    label: 'Altura de los ojos', unit: 'ipd', green: 2, amber: 4.5, limit: 8,
    describe: v => sided(v, 'El ojo derecho está', 'El ojo izquierdo está', 'más alto', 'ipd', 0.8),
  },
  eyeOpening: {
    label: 'Apertura de los ojos', unit: 'pct', green: 12, amber: 25, limit: 45,
    describe: v => sided(v, 'El ojo derecho está', 'El ojo izquierdo está', 'más abierto', 'pct', 4),
  },
  browHeight: {
    label: 'Altura de las cejas', unit: 'ipd', green: 3, amber: 6, limit: 10,
    describe: v => sided(v, 'La ceja derecha está', 'La ceja izquierda está', 'más alta', 'ipd', 1),
  },
  mouthCorners: {
    label: 'Altura de las comisuras', unit: 'ipd', green: 3, amber: 6, limit: 10,
    describe: v => sided(v, 'La comisura derecha está', 'La comisura izquierda está', 'más alta', 'ipd', 1),
  },
  mouthCenter: {
    label: 'Centro de la boca', unit: 'ipd', green: 3, amber: 6, limit: 10,
    describe: v => shifted(v, 'La boca está desplazada', 'ipd', 'Centrada', 1),
  },
  jawWidth: {
    label: 'Anchura de cada mitad', unit: 'pct', green: 8, amber: 15, limit: 25,
    describe: v => sided(v, 'La mitad derecha es', 'La mitad izquierda es', 'más ancha', 'pct', 3),
  },
  chin: {
    label: 'Posición del mentón', unit: 'ipd', green: 4, amber: 8, limit: 14,
    describe: v => shifted(v, 'El mentón está desplazado', 'ipd', 'Centrado', 1.5),
  },
  nose: {
    label: 'Punta de la nariz', unit: 'ipd', green: 3, amber: 6, limit: 10,
    describe: v => shifted(v, 'La punta está desplazada', 'ipd', 'Centrada', 1),
  },
  headTilt: {
    label: 'Inclinación lateral', unit: 'deg', green: 3, amber: 6, limit: 12,
    describe: v => Math.abs(v) < 1
      ? 'La cabeza está recta.'
      : `La cabeza está inclinada ${amount(v, 'deg')} hacia tu hombro ${v > 0 ? 'derecho' : 'izquierdo'}.`,
  },
};

export const ZONES = [
  { id: 'ojos', name: 'Ojos', metrics: ['eyeHeight', 'eyeOpening'] },
  { id: 'cejas', name: 'Cejas', metrics: ['browHeight'] },
  { id: 'boca', name: 'Boca y comisuras', metrics: ['mouthCorners', 'mouthCenter'] },
  { id: 'mandibula', name: 'Mandíbula y mentón', metrics: ['jawWidth', 'chin'] },
  { id: 'nariz', name: 'Nariz', metrics: ['nose'] },
  { id: 'postura', name: 'Postura de la cabeza', metrics: ['headTilt'], posture: true },
];

export function fmt(x, digits = 1) {
  return x.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function amount(v, unit) {
  const a = Math.abs(v);
  if (unit === 'ipd') return `≈ ${fmt(a * IPD_MM / 100)} mm`;
  if (unit === 'pct') return `${fmt(a, 0)} %`;
  return `${fmt(a, 1)}°`;
}

// Por debajo de `tiny` la diferencia es menor que el error de medición: no tiene sentido darle un lado.
function sided(v, rightSubject, leftSubject, comparative, unit, tiny) {
  if (Math.abs(v) < tiny) return 'Prácticamente igual en ambos lados.';
  return `${v > 0 ? rightSubject : leftSubject} ${amount(v, unit)} ${comparative}.`;
}

function shifted(v, subject, unit, centered, tiny) {
  if (Math.abs(v) < tiny) return `${centered} respecto a la línea media.`;
  return `${subject} ${amount(v, unit)} hacia tu ${v > 0 ? 'derecha' : 'izquierda'}.`;
}

// Analiza un fotograma. `lm` son los puntos normalizados de MediaPipe; W y H, el tamaño en píxeles.
export function analyze(lm, W, H, matrix) {
  const P = lm.map(p => ({ x: p.x * W, y: p.y * H, z: p.z * W }));

  // Línea media: ajuste por mínimos cuadrados x = a + b·y con puntos de la frente y el puente nasal.
  const mid = IDX.midline.map(i => P[i]);
  const cx = mid.reduce((s, p) => s + p.x, 0) / mid.length;
  const cy = mid.reduce((s, p) => s + p.y, 0) / mid.length;
  let sxy = 0, syy = 0;
  for (const p of mid) { sxy += (p.y - cy) * (p.x - cx); syy += (p.y - cy) ** 2; }
  const b = syy > 1e-6 ? sxy / syy : 0;
  const n = Math.hypot(b, 1);
  const d = { x: b / n, y: 1 / n }; // dirección de la línea media, de la frente hacia el mentón
  const c = { x: cx, y: cy };

  // Gira todos los puntos para que la línea media sea el eje x = 0.
  const Q = P.map(p => {
    const rx = p.x - c.x, ry = p.y - c.y;
    return { x: rx * d.y - ry * d.x, y: rx * d.x + ry * d.y };
  });
  const avg = idxs => {
    let x = 0, y = 0;
    for (const i of idxs) { x += Q[i].x; y += Q[i].y; }
    return { x: x / idxs.length, y: y / idxs.length };
  };
  const dist = (i, j) => Math.hypot(Q[i].x - Q[j].x, Q[i].y - Q[j].y);

  const eyeR = avg([IDX.rEye.outer, IDX.rEye.inner]);
  const eyeL = avg([IDX.lEye.outer, IDX.lEye.inner]);
  const ipd = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y);
  const k = 100 / ipd;

  const m = {};
  m.eyeHeight = (eyeL.y - eyeR.y) * k;

  const oR = dist(IDX.rEye.top, IDX.rEye.bottom), oL = dist(IDX.lEye.top, IDX.lEye.bottom);
  const wR = dist(IDX.rEye.outer, IDX.rEye.inner), wL = dist(IDX.lEye.outer, IDX.lEye.inner);
  const blinking = (oR + oL) / (wR + wL) < 0.15;
  m.eyeOpening = blinking ? null : (oR - oL) / ((oR + oL) / 2) * 100;

  const bR = avg(IDX.rBrow), bL = avg(IDX.lBrow);
  m.browHeight = (bL.y - bR.y) * k;

  m.mouthCorners = (Q[IDX.lMouth].y - Q[IDX.rMouth].y) * k;
  m.mouthCenter = -avg(IDX.lipCenter).x * k;
  m.nose = -Q[IDX.noseTip].x * k;
  m.chin = -Q[IDX.chin].x * k;

  const jR = IDX.rJaw.reduce((s, i) => s - Q[i].x, 0) / IDX.rJaw.length;
  const jL = IDX.lJaw.reduce((s, i) => s + Q[i].x, 0) / IDX.lJaw.length;
  m.jawWidth = (jR - jL) / ((jR + jL) / 2) * 100;

  m.headTilt = Math.atan2(d.x, d.y) * DEG;

  // Orientación de la cabeza: hace falta mirar de frente para que la medición 2D sea fiable.
  let yaw = null, pitch = null;
  if (matrix && matrix.data && matrix.data.length === 16) {
    const a = matrix.data; // 4x4 en orden por columnas
    const R = (r, col) => a[col * 4 + r];
    const s = Math.hypot(R(0, 0), R(1, 0), R(2, 0)) || 1;
    yaw = Math.asin(clamp(-R(2, 0) / s, -1, 1)) * DEG;
    pitch = Math.atan2(R(2, 1), R(2, 2)) * DEG;
  }
  if (yaw === null) {
    const l = P[234], r = P[454];
    yaw = Math.atan2(r.z - l.z, r.x - l.x) * DEG;
  }

  const mouthOpen = dist(IDX.innerLips[0], IDX.innerLips[1]) * k > 6;

  const issues = [];
  let valid = true;
  if (ipd < 30) { issues.push('Acércate un poco a la cámara'); valid = false; }
  if (Math.abs(yaw) > 7) { issues.push('Gira la cara hacia la cámara y mira de frente'); valid = false; }
  if (pitch !== null && Math.abs(pitch) > 12) { issues.push('Pon la cámara a la altura de los ojos y mira de frente'); valid = false; }
  if (mouthOpen) issues.push('Cierra la boca y relaja la cara');
  if (Math.abs(m.headTilt) > 8) issues.push('Endereza un poco la cabeza');

  return {
    metrics: m,
    pose: { yaw, pitch, roll: m.headTilt },
    valid,
    issues,
    geom: { P, c, d, ipd, faceLen: Math.hypot(P[IDX.chin].x - P[10].x, P[IDX.chin].y - P[10].y) },
  };
}

export function median(values) {
  const v = values.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}

// Mediana de cada métrica sobre varios fotogramas (quita parpadeos y temblores).
export function aggregate(frames) {
  const out = {};
  for (const key of Object.keys(METRICS)) out[key] = median(frames.map(f => f[key]));
  return out;
}

export function statusOf(key, v) {
  if (v === null || v === undefined) return 'none';
  const def = METRICS[key], a = Math.abs(v);
  if (a < def.green) return 'ok';
  if (a < def.amber) return 'leve';
  return 'marcada';
}

const STATUS_RANK = { none: -1, ok: 0, leve: 1, marcada: 2 };

export function metricScore(key, v) {
  const def = METRICS[key], a = Math.abs(v), free = def.green * 0.5;
  return 100 * clamp(1 - Math.max(0, a - free) / (def.limit - free), 0, 1);
}

export function evaluate(metrics) {
  if (!metrics) return null;
  const per = {};
  const scores = [];
  for (const key of Object.keys(METRICS)) {
    const v = metrics[key];
    const has = v !== null && v !== undefined;
    per[key] = { v: has ? v : null, status: statusOf(key, v), score: has ? metricScore(key, v) : null };
    if (has && key !== 'headTilt') scores.push(per[key].score);
  }
  const zones = ZONES.map(z => {
    let status = 'none', severity = 0;
    for (const key of z.metrics) {
      const p = per[key];
      if (STATUS_RANK[p.status] > STATUS_RANK[status]) status = p.status;
      if (p.v !== null) severity = Math.max(severity, Math.abs(p.v) / METRICS[key].limit);
    }
    return { ...z, status, severity };
  });
  const score = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null;
  return { per, zones, score };
}

export const STATUS_LABEL = { ok: 'Habitual', leve: 'Leve', marcada: 'Marcada', none: 'Sin dato' };
