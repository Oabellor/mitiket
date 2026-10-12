/* AEtickets OCR — lectura de tickets 100% local (Tesseract.js + español).
   Expone window.AEOCR = { read(dataUrl) -> {text, importe, fecha, concepto}, parse(text) } */
(function (root) {
  'use strict';

  // ---------- ANALIZADOR DE TEXTO ----------
  const MESES = { ENE: 1, ENERO: 1, FEB: 2, FEBRERO: 2, MAR: 3, MARZO: 3, ABR: 4, ABRIL: 4, MAY: 5, MAYO: 5,
    JUN: 6, JUNIO: 6, JUL: 7, JULIO: 7, AGO: 8, AGOSTO: 8, SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SETIEMBRE: 9,
    OCT: 10, OCTUBRE: 10, NOV: 11, NOVIEMBRE: 11, DIC: 12, DICIEMBRE: 12 };

  // Palabra -> peso. Las marcas pesan más que las palabras genéricas.
  const CONCEPTOS = {
    Gasolina: { GASOLINA: 3, GASOLEO: 3, 'GASÓLEO': 3, DIESEL: 3, 'DIÉSEL': 3, CARBURANTE: 3, 'SIN PLOMO': 3, SURTIDOR: 3,
      'ESTACION DE SERVICIO': 3, 'ESTACIÓN DE SERVICIO': 3, 'E.S.': 1, LITROS: 2, LTS: 1, REPSOL: 4, CEPSA: 4, MOEVE: 4,
      DISA: 4, SHELL: 4, GALP: 4, PETROPRIX: 4, PLENOIL: 4, BALLENOIL: 4, BP: 2, 'EFITEC': 3, 'ADBLUE': 2 },
    Hotel: { HOTEL: 4, HOSTAL: 4, APARTHOTEL: 4, ALOJAMIENTO: 3, 'HABITACION': 3, 'HABITACIÓN': 3, NOCHES: 2, NOCHE: 1,
      'CHECK-IN': 3, 'CHECK IN': 3, 'CHECK-OUT': 3, HUESPED: 3, 'HUÉSPED': 3, RECEPCION: 1, 'RECEPCIÓN': 1, BOOKING: 3,
      'TASA TURISTICA': 3, 'TASA TURÍSTICA': 3, PENSION: 2, 'PENSIÓN': 2, RESORT: 3 },
    Restaurante: { RESTAURANTE: 4, BAR: 2, CAFETERIA: 3, 'CAFETERÍA': 3, MESA: 2, COMENSALES: 3, CAMARERO: 3, CAMARERA: 3,
      MENU: 2, 'MENÚ': 2, TERRAZA: 1, CERVEZA: 2, CAÑA: 2, AGUA: 1, VINO: 2, CAFE: 1, 'CAFÉ': 1, POSTRE: 2, TASCA: 3,
      GUACHINCHE: 4, PIZZERIA: 3, 'PIZZERÍA': 3, ASADOR: 3, MARISQUERIA: 3, 'MARISQUERÍA': 3, TABERNA: 3, BOCADILLO: 2,
      RACION: 2, 'RACIÓN': 2, PAPAS: 1, REFRESCO: 2, COMIDA: 1, CENA: 1 },
    Taxi: { TAXI: 5, LICENCIA: 2, 'BAJADA DE BANDERA': 4, CARRERA: 2, TAXIMETRO: 4, 'TAXÍMETRO': 4, CABIFY: 4, UBER: 4,
      FREENOW: 4, 'FREE NOW': 4 },
    Vuelo: { VUELO: 4, BINTER: 5, IBERIA: 5, VUELING: 5, RYANAIR: 5, 'AIR EUROPA': 5, CANARYFLY: 5, 'EASYJET': 5,
      'TARJETA DE EMBARQUE': 5, EMBARQUE: 3, BOARDING: 4, AEROPUERTO: 2, LOCALIZADOR: 3, BILLETE: 2, PASAJERO: 2 },
    Parking: { PARKING: 5, APARCAMIENTO: 5, ESTACIONAMIENTO: 4, 'ZONA AZUL': 4, 'ZONA VERDE': 3, ESTANCIA: 2, SABA: 4,
      EMPARK: 4, APK: 1, 'HORA ENTRADA': 3, 'HORA SALIDA': 3, PLAZA: 1 },
    Peaje: { PEAJE: 5, AUTOPISTA: 4, 'VIA-T': 4, 'VÍA-T': 4, AUDASA: 5, ABERTIS: 5, AUMAR: 5, ACESA: 5, CABINA: 1 }
  };

  const NO_TOTAL = /SUBTOTAL|SUB-TOTAL|SUB TOTAL|BASE|IVA|I\.V\.A|IGIC|I\.G\.I\.C|IMPUESTO|CUOTA|DTO|DESCUENTO|CAMBIO|ENTREGADO|EFECTIVO RECIB|PROPINA/;
  const ES_TOTAL = /TOTAL|IMPORTE|A PAGAR|TOT\.|SUMA|PAGADO|TARJETA|VISA|MASTERCARD/;

  function norm(s) {
    return (s || '').toUpperCase().replace(/[“”"']/g, '').replace(/€/g, ' EUR ');
  }

  // Números con 2 decimales: 12,50 · 1.234,50 · 12.50 · 12 ,50 (OCR mete espacios)
  function amounts(line) {
    const out = [];
    const re = /(\d{1,3}(?:[.\s]\d{3})*|\d+)\s?[,.]\s?(\d{2})(?!\d)/g;
    let m;
    while ((m = re.exec(line))) {
      const ent = m[1].replace(/[.\s]/g, '');
      const v = parseFloat(ent + '.' + m[2]);
      if (!isNaN(v)) out.push({ v, i: m.index });
    }
    return out;
  }

  function findImporte(text) {
    const lines = norm(text).split(/\n/).map(l => l.trim()).filter(Boolean);
    const cands = [];
    lines.forEach((l, idx) => {
      if (!ES_TOTAL.test(l)) return;
      let nums = amounts(l);
      if (!nums.length && lines[idx + 1]) nums = amounts(lines[idx + 1]);
      if (!nums.length) return;
      const v = nums[nums.length - 1].v;
      if (v <= 0 || v > 20000) return;
      let score = 1;
      if (/TOTAL/.test(l)) score += 3;
      if (/TOTAL\s*(A PAGAR|EUR|EUROS|COMPRA|FACTURA|TICKET|\(|:|$)/.test(l)) score += 2;
      if (/IMPORTE/.test(l)) score += 1;
      if (NO_TOTAL.test(l)) score -= 5;
      cands.push({ v, score, idx });
    });
    if (cands.length) {
      // Mejor puntuación; a igualdad, el mayor importe (el total suele ser >= parciales)
      cands.sort((a, b) => b.score - a.score || b.v - a.v);
      if (cands[0].score > 0) return cands[0].v.toFixed(2);
    }
    // Plan B: el mayor importe razonable del ticket
    let max = 0;
    lines.forEach(l => {
      if (/TEL|CIF|NIF|N\.I\.F|C\.I\.F|FACTURA N|TICKET N|NUM|Nº|CP|CÓDIGO/.test(l)) return;
      amounts(l).forEach(a => { if (a.v < 5000 && a.v > max) max = a.v; });
    });
    return max > 0 ? max.toFixed(2) : '';
  }

  function validDate(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    const now = new Date();
    const diffDays = (now - dt) / 864e5;
    if (diffDays < -2 || diffDays > 730) return null; // ni futuro ni de hace más de 2 años
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function findFecha(text) {
    const t = norm(text);
    const found = [];
    let m;
    const reNum = /(\d{1,2})\s?[\/\-.]\s?(\d{1,2})\s?[\/\-.]\s?(\d{4}|\d{2})(?!\d)/g;
    while ((m = reNum.exec(t))) {
      const r = validDate(+m[3], +m[2], +m[1]);
      if (r) found.push({ r, i: m.index });
    }
    const reIso = /(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g;
    while ((m = reIso.exec(t))) {
      const r = validDate(+m[1], +m[2], +m[3]);
      if (r) found.push({ r, i: m.index });
    }
    const reTxt = /(\d{1,2})\s*(?:DE\s+)?([A-ZÁÉÍÓÚ]{3,10})\.?\s*(?:DE\s+)?(\d{4}|\d{2})(?!\d)/g;
    while ((m = reTxt.exec(t))) {
      const mes = MESES[m[2]];
      if (!mes) continue;
      const r = validDate(+m[3], mes, +m[1]);
      if (r) found.push({ r, i: m.index });
    }
    if (!found.length) return '';
    // Si la línea dice FECHA, se prioriza; si no, la primera que aparezca
    const fechaIdx = t.search(/FECHA/);
    if (fechaIdx >= 0) {
      found.sort((a, b) => Math.abs(a.i - fechaIdx) - Math.abs(b.i - fechaIdx));
    } else {
      found.sort((a, b) => a.i - b.i);
    }
    return found[0].r;
  }

  function findConcepto(text) {
    const t = ' ' + norm(text).replace(/\s+/g, ' ') + ' ';
    let best = '', bestScore = 0;
    for (const [concepto, words] of Object.entries(CONCEPTOS)) {
      let s = 0;
      for (const [w, peso] of Object.entries(words)) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(^|[^A-ZÁÉÍÓÚÑ])' + esc + '(?=[^A-ZÁÉÍÓÚÑ]|$)', 'g');
        const n = (t.match(re) || []).length;
        if (n) s += peso * Math.min(n, 3);
      }
      if (s > bestScore) { bestScore = s; best = concepto; }
    }
    return bestScore >= 3 ? best : '';
  }

  function parse(text) {
    return { importe: findImporte(text), fecha: findFecha(text), concepto: findConcepto(text) };
  }

  // ---------- MOTOR OCR ----------
  let workerPromise = null;
  function base() {
    const s = document.querySelector('script[src*="aetocr.js"]');
    return new URL('./', s ? s.src : location.href + 'ocr/').href;
  }
  function getWorker() {
    if (!workerPromise) {
      const b = base();
      workerPromise = Tesseract.createWorker('spa', 1, {
        workerPath: b + 'worker.min.js',
        corePath: b,
        langPath: b,
        gzip: true,
        cacheMethod: 'none'
      }).catch(e => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  // Reescala y pasa a escala de grises: más rápido y más preciso en tickets
  function prep(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1400;
        const sc = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 140)); // más contraste, papel más blanco
          p[i] = p[i + 1] = p[i + 2] = g;
        }
        ctx.putImageData(d, 0, 0);
        res(c);
      };
      img.onerror = rej;
      img.src = dataUrl;
    });
  }

  async function read(dataUrl) {
    const [w, canvas] = await Promise.all([getWorker(), prep(dataUrl)]);
    const { data } = await w.recognize(canvas);
    const text = data.text || '';
    return Object.assign({ text }, parse(text));
  }

  root.AEOCR = { read, parse, warmup: () => getWorker().catch(() => {}) };
})(typeof window !== 'undefined' ? window : globalThis);
