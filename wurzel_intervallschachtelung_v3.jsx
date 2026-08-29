import React, { useState, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Konstanten                                                         */
/* ------------------------------------------------------------------ */

const FLAECHEN = [2, 3, 5, 16, 20, 50];
const EPS = 0.001;    // Abbruchbreite des Intervalls
const MAXZ = 2000;    // maximaler Zoomfaktor

/* Startgrenzen: größte ganze Zahl mit lo·lo < A, kleinste mit hi·hi > A */
function startGrenzen(a) {
  let lo = Math.floor(Math.sqrt(a));
  while (lo * lo >= a) lo -= 1;
  let hi = Math.ceil(Math.sqrt(a));
  while (hi * hi <= a) hi += 1;
  return [lo, hi];
}

const istQuadratzahl = (a) => Number.isInteger(Math.sqrt(a));

function startMeldung(a) {
  const [lo, hi] = startGrenzen(a);
  return {
    kind: "start",
    text:
      `Wir wissen schon: ${lo} · ${lo} = ${lo * lo} ist zu wenig, ` +
      `${hi} · ${hi} = ${hi * hi} ist zu viel. ` +
      `Die gesuchte Seitenlänge liegt also zwischen ${lo} und ${hi}.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Zahlen: deutsche Schreibweise                                      */
/* ------------------------------------------------------------------ */

function fmt(x, maxDec = 6) {
  if (x === null || x === undefined || !isFinite(x)) return "–";
  let s = x.toFixed(maxDec);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

function fmtFix(x, dec) {
  return x.toFixed(dec).replace(".", ",");
}

function parseNumber(str) {
  const t = String(str).trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/*  Animation: weiche Übergänge per requestAnimationFrame              */
/* ------------------------------------------------------------------ */

function useAnimated(target, duration = 450) {
  const [value, setValue] = useState(target);
  const cur = useRef(target);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || cur.current === target) {
      cur.current = target;
      setValue(target);
      return;
    }

    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;

    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      cur.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        cur.current = target;
        setValue(target);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/* ------------------------------------------------------------------ */
/*  Zahlenstrahl: passende Schrittweite                                */
/* ------------------------------------------------------------------ */

function niceStep(width, count = 4) {
  const raw = width / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let m = 10;
  if (norm < 1.5) m = 1;
  else if (norm < 3) m = 2;
  else if (norm < 7) m = 5;
  return m * mag;
}

/* Text auf eine Breite umbrechen (für die Bild-Ausgabe) */
function umbrechen(ctx, text, maxW) {
  const worte = String(text).split(" ");
  const zeilen = [];
  let z = "";
  for (const w of worte) {
    const test = z ? z + " " + w : w;
    if (z && ctx.measureText(test).width > maxW) {
      zeilen.push(z);
      z = w;
    } else {
      z = test;
    }
  }
  if (z) zeilen.push(z);
  return zeilen;
}

/* ------------------------------------------------------------------ */
/*  Hauptkomponente                                                    */
/* ------------------------------------------------------------------ */

export default function Wurzelsuche() {
  const [A, setA] = useState(20);
  const [lo, setLo] = useState(() => startGrenzen(20)[0]);
  const [hi, setHi] = useState(() => startGrenzen(20)[1]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState(() => startMeldung(20));
  const [exakt, setExakt] = useState(null);      // getroffener Wert oder null
  const [zoom, setZoom] = useState(1);
  const [anleitungOffen, setAnleitungOffen] = useState(true);
  const [bild, setBild] = useState(null);        // Daten-URL der Bildvorschau
  const inputRef = useRef(null);

  const [SLO, SHI] = startGrenzen(A);
  const SEED = { s: SLO, sq: SLO * SLO, tooBig: false };
  const SEED_ROWS = [
    { s: SLO, sq: SLO * SLO, tooBig: false },
    { s: SHI, sq: SHI * SHI, tooBig: true },
  ];

  const last = history.length > 0 ? history[history.length - 1] : SEED;
  const width = hi - lo;
  const done = exakt !== null || width < EPS;

  /* animierte Werte */
  const aSide = useAnimated(last.s);
  const aLo = useAnimated(lo);
  const aHi = useAnimated(hi);
  const padBase = width > 0 ? width * 0.28 : 0.1;
  const aVLo = useAnimated(lo - padBase);
  const aVHi = useAnimated(hi + padBase);
  const z = useAnimated(zoom, 300);

  const rows = [
    ...SEED_ROWS.map((r, i) => ({ ...r, label: "Start", key: "s" + i })),
    ...history.map((r, i) => ({ ...r, label: String(i + 1), key: "h" + i })),
  ];

  /* ---------------- Logik ---------------- */

  function waehleFlaeche(neu) {
    const [nlo, nhi] = startGrenzen(neu);
    setA(neu);
    setLo(nlo);
    setHi(nhi);
    setHistory([]);
    setInput("");
    setExakt(null);
    setZoom(1);
    setBild(null);
    setMsg(startMeldung(neu));
  }

  function pruefen() {
    const v = parseNumber(input);

    if (v === null) {
      setMsg({ kind: "abgelehnt", text: "Bitte gib eine Zahl ein — zum Beispiel 4,5." });
      return;
    }

    if (v <= lo) {
      setMsg({
        kind: "abgelehnt",
        text:
          `${fmt(v)} liegt nicht mehr im Suchbereich. Wir wissen schon: ` +
          `${fmt(lo)} · ${fmt(lo)} = ${fmt(lo * lo)}, und das ist weniger als ${A}. ` +
          `Die Seite muss also länger als ${fmt(lo)} sein.`,
      });
      return;
    }

    if (v >= hi) {
      setMsg({
        kind: "abgelehnt",
        text:
          `${fmt(v)} liegt nicht mehr im Suchbereich. Wir wissen schon: ` +
          `${fmt(hi)} · ${fmt(hi)} = ${fmt(hi * hi)}, und das ist mehr als ${A}. ` +
          `Die Seite muss also kürzer als ${fmt(hi)} sein.`,
      });
      return;
    }

    const sq = v * v;

    /* Volltreffer (nur bei Quadratzahlen möglich) */
    if (sq === A) {
      setHistory((h) => [...h, { s: v, sq, tooBig: null, loBefore: lo, hiBefore: hi }]);
      setLo(v);
      setHi(v);
      setExakt(v);
      setInput("");
      setMsg({
        kind: "exakt",
        text: `${fmt(v)} · ${fmt(v)} = ${fmt(sq)} — genau ${A}. Volltreffer!`,
      });
      return;
    }

    const tooBig = sq > A;

    setHistory((h) => [...h, { s: v, sq, tooBig, loBefore: lo, hiBefore: hi }]);
    if (tooBig) setHi(v);
    else setLo(v);

    setMsg({
      kind: tooBig ? "zuGross" : "zuKlein",
      text: tooBig
        ? `${fmt(v)} · ${fmt(v)} = ${fmt(sq)} — das ist mehr als ${A}. Deine Seite ist noch zu lang. ` +
          `Neue Obergrenze: ${fmt(v)}.`
        : `${fmt(v)} · ${fmt(v)} = ${fmt(sq)} — das ist weniger als ${A}. Deine Seite ist noch zu kurz. ` +
          `Neue Untergrenze: ${fmt(v)}.`,
    });

    setInput("");
    if (inputRef.current) inputRef.current.focus();
  }

  function zurueck() {
    if (history.length === 0) return;
    const letzte = history[history.length - 1];
    setLo(letzte.loBefore);
    setHi(letzte.hiBefore);
    setHistory((h) => h.slice(0, -1));
    setExakt(null);
    setMsg({
      kind: "info",
      text:
        `Der Versuch ${fmt(letzte.s)} wurde zurückgenommen. Der Suchbereich ist wieder von ` +
        `${fmt(letzte.loBefore)} bis ${fmt(letzte.hiBefore)}.`,
    });
    setInput("");
  }

  function neustart() {
    waehleFlaeche(A);
  }

  function mitteVorschlagen() {
    setInput(fmt((lo + hi) / 2, 6));
    if (inputRef.current) inputRef.current.focus();
  }

  /* ---------------- Tabelle als Bild ---------------- */

  function fussText() {
    if (exakt !== null) {
      return (
        `Ergebnis: Die Seitenlänge ist genau ${fmt(exakt)}, denn ${fmt(exakt)} · ${fmt(exakt)} = ${A}. ` +
        `Man schreibt dafür √${A} = ${fmt(exakt)}.`
      );
    }
    if (width < EPS && istQuadratzahl(A)) {
      return (
        `Ergebnis: ${fmt(lo)} < s < ${fmt(hi)}. Die gesuchte Zahl ist genau ${fmt(Math.sqrt(A))}, ` +
        `denn ${fmt(Math.sqrt(A))} · ${fmt(Math.sqrt(A))} = ${A}. Man schreibt √${A} = ${fmt(Math.sqrt(A))}.`
      );
    }
    if (width < EPS) {
      return (
        `Ergebnis: ${fmt(lo)} < s < ${fmt(hi)}. Diese Zahl heißt Quadratwurzel aus ${A}, ` +
        `geschrieben √${A} ≈ ${fmtFix(Math.sqrt(A), 4)}. Sie lässt sich weder als Bruch noch als ` +
        `abbrechende Dezimalzahl schreiben.`
      );
    }
    return `Zwischenstand: ${fmt(lo)} < s < ${fmt(hi)}, Breite des Suchbereichs ${fmt(width, 8)}.`;
  }

  function tabelleAlsBild() {
    const cols = [
      { t: "Nr.", w: 90, a: "left" },
      { t: "Seite s", w: 200, a: "right" },
      { t: "s · s", w: 210, a: "right" },
      { t: "Ziel A", w: 120, a: "right" },
      { t: "Ergebnis", w: 200, a: "right" },
    ];
    const pad = 34;
    const innerW = cols.reduce((a, c) => a + c.w, 0);
    const W = innerW + pad * 2;
    const rowH = 40;
    const kopfH = 118;

    const mess = document.createElement("canvas").getContext("2d");
    mess.font = "16px 'Segoe UI', system-ui, sans-serif";
    const fussZeilen = umbrechen(mess, fussText(), innerW);

    const tabH = rowH * (rows.length + 1);
    const H = kopfH + tabH + 26 + fussZeilen.length * 24 + pad;

    const cv = document.createElement("canvas");
    const s = 2;
    cv.width = W * s;
    cv.height = H * s;
    const ctx = cv.getContext("2d");
    ctx.scale(s, s);
    ctx.textBaseline = "middle";

    /* Hintergrund */
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    /* Kopf */
    ctx.fillStyle = "#1F2933";
    ctx.font = "700 24px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Intervallschachtelung: Seitenlänge eines Quadrats", pad, 40);
    ctx.fillStyle = "#5B6670";
    ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(
      `Gesucht: die Seite s mit s · s = ${A}` +
      `   ·   ${new Date().toLocaleDateString("de-DE")}`,
      pad, 68
    );

    /* Spaltenüberschriften */
    let y = kopfH;
    ctx.fillStyle = "#F2F5F6";
    ctx.fillRect(pad, y - rowH / 2, innerW, rowH);
    ctx.fillStyle = "#5B6670";
    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    let x = pad;
    cols.forEach((c) => {
      if (c.a === "left") {
        ctx.textAlign = "left";
        ctx.fillText(c.t, x + 12, y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(c.t, x + c.w - 12, y);
      }
      x += c.w;
    });

    /* Zeilen */
    rows.forEach((r, i) => {
      y += rowH;
      if (i % 2 === 1) {
        ctx.fillStyle = "#FAFBFB";
        ctx.fillRect(pad, y - rowH / 2, innerW, rowH);
      }
      ctx.strokeStyle = "#EDF0F2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y - rowH / 2 + 0.5);
      ctx.lineTo(pad + innerW, y - rowH / 2 + 0.5);
      ctx.stroke();

      const seed = r.label === "Start";
      const werte = [
        r.label,
        fmt(r.s),
        fmt(r.sq),
        String(A),
        r.tooBig === null ? "genau" : r.tooBig ? "zu groß" : "zu klein",
      ];

      x = pad;
      werte.forEach((w, k) => {
        ctx.fillStyle = seed ? "#7B858E" : "#1F2933";
        ctx.font =
          (k === 4 && !seed ? "700 " : "") + "16px 'Segoe UI', system-ui, sans-serif";
        if (cols[k].a === "left") {
          ctx.textAlign = "left";
          ctx.fillText(w, x + 12, y);
        } else {
          ctx.textAlign = "right";
          ctx.fillText(w, x + cols[k].w - 12, y);
        }
        x += cols[k].w;
      });
    });

    /* Abschlusslinie und Fußtext */
    y += rowH / 2;
    ctx.strokeStyle = "#D8DEE3";
    ctx.beginPath();
    ctx.moveTo(pad, y + 0.5);
    ctx.lineTo(pad + innerW, y + 0.5);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#1F2933";
    ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
    let fy = y + 30;
    fussZeilen.forEach((zeile) => {
      ctx.fillText(zeile, pad, fy);
      fy += 24;
    });

    /* Speichern anbieten */
    const url = cv.toDataURL("image/png");
    setBild(url);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `intervallschachtelung_A${A}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      /* Vorschau bleibt als Rückfallebene */
    }
  }

  /* ---------------- Zeichnung: Quadrate ---------------- */

  const OX = 56;              // gemeinsame linke untere Ecke
  const OY = 268;
  const U = 220 / SHI;        // Pixel pro Längeneinheit, passend zur Fläche

  const zielSeite = Math.sqrt(A);
  const zielPx = zielSeite * U;
  const seitePx = aSide * U;

  /* Lupe: Brennpunkt ist die rechte obere Ecke des Zielquadrats */
  const Fx = OX + zielPx;
  const Fy = OY - zielPx;
  const CX = 168, CY = 150;
  const tAnchor = 1 - 1 / z;
  const ax = Fx + (CX - Fx) * tAnchor;
  const ay = Fy + (CY - Fy) * tAnchor;
  const gTransform = `translate(${ax - Fx * z} ${ay - Fy * z}) scale(${z})`;
  const gezoomt = z > 1.05;

  const diff = Math.abs(last.s - zielSeite);
  function autoZoom() {
    const px = diff * U;
    const ziel = px > 1e-9 ? 40 / px : MAXZ;
    setZoom(Math.min(MAXZ, Math.max(1, ziel)));
  }
  const sliderWert = Math.round((100 * Math.log(zoom)) / Math.log(MAXZ));

  /* ---------------- Zeichnung: Zahlenstrahl ---------------- */

  const NX0 = 26, NX1 = 314;
  const spann = Math.max(aVHi - aVLo, 1e-12);
  const xOf = (v) => NX0 + ((v - aVLo) / spann) * (NX1 - NX0);

  const step = niceStep(Math.max(width + 2 * padBase, 1e-9));
  const dec = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  const ticks = [];
  {
    const start = Math.ceil(aVLo / step) * step;
    for (let t = start; t <= aVHi + step * 0.001 && ticks.length < 12; t += step) {
      ticks.push(Math.round(t / step) * step);
    }
  }
  const bandX = xOf(aLo);
  const bandW = Math.max(xOf(aHi) - xOf(aLo), 3);

  /* ---------------- Darstellung ---------------- */

  return (
    <div className="qw-root">
      <style>{`
        .qw-root {
          --akzent: #0B6E75;
          --akzent-hell: rgba(11,110,117,0.22);
          --grau: #8A9199;
          --grau-hell: #E9ECEF;
          --text: #1F2933;
          --gedimmt: #5B6670;
          --linie: #D8DEE3;
          background: #F6F8F8;
          color: var(--text);
          font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
          padding: 18px;
          min-height: 100%;
          box-sizing: border-box;
          font-size: 16px;
          line-height: 1.45;
        }
        .qw-root * { box-sizing: border-box; }
        .qw-h1 { font-size: 21px; font-weight: 700; margin: 0 0 2px; }
        .qw-sub { color: var(--gedimmt); margin: 0 0 14px; font-size: 15px; }
        .qw-grid {
          display: grid;
          grid-template-columns: minmax(0,1fr) minmax(0,1.05fr);
          gap: 18px;
          align-items: start;
        }
        @media (max-width: 760px) { .qw-grid { grid-template-columns: minmax(0,1fr); } }
        .qw-karte {
          background: #FFFFFF;
          border: 1px solid var(--linie);
          border-radius: 10px;
          padding: 14px;
        }
        .qw-karte + .qw-karte { margin-top: 16px; }
        .qw-titel {
          font-size: 13px; font-weight: 700; letter-spacing: .06em;
          text-transform: uppercase; color: var(--gedimmt); margin: 0 0 10px;
        }
        .qw-kopfzeile {
          display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
        }
        .qw-anleitung { margin-bottom: 16px; }
        .qw-anleitung ol { margin: 0; padding-left: 22px; }
        .qw-anleitung li { margin-bottom: 7px; }
        .qw-anleitung li:last-child { margin-bottom: 0; }
        .qw-anleitung .ziel {
          margin: 0 0 10px; padding: 10px 12px; border-radius: 8px;
          background: #EAF3F4; border-left: 5px solid var(--akzent);
        }
        .qw-wahl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .qw-wahl-btn {
          font: inherit; font-variant-numeric: tabular-nums;
          padding: 8px 14px; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--linie); background: #fff; color: var(--text);
        }
        .qw-wahl-btn:hover { background: #F0F3F4; }
        .qw-wahl-btn[aria-pressed="true"] {
          background: var(--akzent); border-color: var(--akzent); color: #fff; font-weight: 700;
        }
        .qw-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .qw-chip {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 14px; padding: 5px 10px; border-radius: 6px;
          background: #F2F5F6; font-variant-numeric: tabular-nums;
        }
        .qw-chip i { width: 13px; height: 13px; border-radius: 3px; display: inline-block; }
        .qw-chip.grau i { background: var(--grau-hell); border: 2px solid var(--grau); }
        .qw-chip.akz  i { background: var(--akzent-hell); border: 2px solid var(--akzent); }
        .qw-svg { width: 100%; height: auto; display: block; }
        .qw-zoom {
          display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
          margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--linie);
        }
        .qw-zoom input[type=range] { flex: 1 1 130px; min-width: 110px; accent-color: var(--akzent); }
        .qw-zoom-wert {
          font-variant-numeric: tabular-nums; font-size: 14px; color: var(--gedimmt); min-width: 72px;
        }
        .qw-bereich {
          font-size: 24px; font-weight: 700; text-align: center;
          font-variant-numeric: tabular-nums; margin: 6px 0 2px;
        }
        .qw-breite { text-align: center; color: var(--gedimmt); font-size: 14px; margin-bottom: 6px; }
        .qw-eingabe { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .qw-eingabe input {
          flex: 1 1 130px; min-width: 110px;
          font-size: 22px; font-variant-numeric: tabular-nums;
          padding: 10px 12px; border: 2px solid var(--linie); border-radius: 8px;
          background: #fff; color: var(--text);
        }
        .qw-eingabe input:focus { outline: 3px solid rgba(11,110,117,.35); border-color: var(--akzent); }
        .qw-btn {
          font: inherit; font-size: 16px; padding: 11px 16px; border-radius: 8px;
          border: 1px solid var(--linie); background: #fff; color: var(--text); cursor: pointer;
        }
        .qw-btn:hover { background: #F0F3F4; }
        .qw-btn:focus-visible { outline: 3px solid rgba(11,110,117,.45); }
        .qw-btn-haupt { background: var(--akzent); border-color: var(--akzent); color: #fff; font-weight: 600; }
        .qw-btn-haupt:hover { background: #095A60; }
        .qw-btn-klein { padding: 7px 12px; font-size: 15px; }
        .qw-btn:disabled { opacity: .45; cursor: default; }
        .qw-btnzeile { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .qw-rueck {
          margin-top: 12px; padding: 12px 14px; border-radius: 8px;
          background: #F2F5F6; border-left: 5px solid var(--grau); font-size: 16px;
        }
        .qw-rueck.zuGross { border-left-color: #B4560A; background: #FDF3EA; }
        .qw-rueck.zuKlein { border-left-color: var(--akzent); background: #EAF3F4; }
        .qw-rueck.exakt   { border-left-color: #1B7F3B; background: #ECF6EF; }
        .qw-rueck.abgelehnt { border-left-color: #6B7280; background: #F1F2F4; }
        .qw-pfeil { font-weight: 700; margin-right: 6px; }
        .qw-tab { width: 100%; border-collapse: collapse; font-size: 15px; }
        .qw-tab th {
          text-align: right; font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
          color: var(--gedimmt); padding: 6px 8px; border-bottom: 1px solid var(--linie);
          white-space: nowrap;
        }
        .qw-tab th:first-child, .qw-tab td:first-child { text-align: left; }
        .qw-tab td {
          text-align: right; padding: 7px 8px; border-bottom: 1px solid #F0F2F3;
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .qw-tab td.ziel { color: var(--gedimmt); }
        .qw-tab tr.seed td { color: var(--gedimmt); }
        .qw-scroll { max-height: 280px; overflow: auto; }
        .qw-vorschau { margin-top: 12px; }
        .qw-vorschau img {
          width: 100%; height: auto; display: block;
          border: 1px solid var(--linie); border-radius: 8px; background: #fff;
        }
        .qw-hinweis { font-size: 14px; color: var(--gedimmt); margin: 8px 0 0; }
        .qw-ende {
          margin-top: 14px; padding: 14px; border-radius: 10px;
          background: #EAF3F4; border: 1px solid var(--akzent);
        }
        .qw-ende h3 { margin: 0 0 6px; font-size: 18px; }
        .qw-ende p { margin: 0 0 6px; }
      `}</style>

      <h1 className="qw-h1">Wie lang ist die Seite?</h1>
      <p className="qw-sub">
        Ein Quadrat hat den Flächeninhalt A = {A}. Grenze die Seitenlänge s Schritt für Schritt ein.
      </p>

      {/* ---------------- Anleitung ---------------- */}
      <div className="qw-karte qw-anleitung">
        <div className="qw-kopfzeile">
          <p className="qw-titel">So gehst du vor</p>
          <button
            className="qw-btn qw-btn-klein"
            onClick={() => setAnleitungOffen((o) => !o)}
            aria-expanded={anleitungOffen}
          >
            {anleitungOffen ? "Ausblenden" : "Anleitung zeigen"}
          </button>
        </div>

        {anleitungOffen && (
          <>
            <p className="ziel">
              Gesucht ist die Zahl, die mit sich selbst multipliziert {A} ergibt. Ausrechnen kannst du
              sie noch nicht — aber du kannst sie so eng einkreisen, wie du willst.
            </p>
            <ol>
              <li>
                Oben wählst du den Flächeninhalt. Der Suchbereich startet zwischen den beiden ganzen
                Zahlen, die zu klein und zu groß sind.
              </li>
              <li>
                Tippe eine Zahl aus dem Suchbereich ein und drücke <strong>Prüfen</strong>. Das
                farbige Quadrat verändert sich sofort und zeigt, ob es aus dem grauen Rahmen ragt
                oder darin verschwindet.
              </li>
              <li>
                Ist s · s größer als {A}, war deine Seite zu lang — deine Zahl wird zur neuen{" "}
                <strong>Obergrenze</strong>. Ist s · s kleiner, wird sie zur neuen{" "}
                <strong>Untergrenze</strong>. Der Bereich schrumpft also bei jedem Versuch.
              </li>
              <li>
                Zahlen außerhalb des Bereichs werden abgelehnt: die hast du längst ausgeschlossen.
                Mit <strong>Mitte vorschlagen</strong> halbierst du den Bereich, mit{" "}
                <strong>Zurück</strong> nimmst du einen Versuch zurück.
              </li>
              <li>
                Wird der Unterschied zu klein zum Sehen, hilft die <strong>Lupe</strong> unter dem
                Bild. Fertig bist du, wenn der Suchbereich schmaler als 0,001 ist.
              </li>
              <li>
                Am Ende speicherst du deine Tabelle mit{" "}
                <strong>Tabelle als Bild speichern</strong> für deine Mappe.
              </li>
            </ol>
          </>
        )}
      </div>

      <div className="qw-karte" style={{ marginBottom: 16 }}>
        <p className="qw-titel">Flächeninhalt wählen</p>
        <div className="qw-wahl">
          {FLAECHEN.map((f) => (
            <button
              key={f}
              className="qw-wahl-btn"
              aria-pressed={f === A}
              onClick={() => waehleFlaeche(f)}
            >
              A = {f}
            </button>
          ))}
        </div>
      </div>

      <div className="qw-grid">
        {/* ---------------- linke Spalte ---------------- */}
        <div>
          <div className="qw-karte">
            <p className="qw-titel">Die beiden Quadrate übereinander</p>

            <div className="qw-chips">
              <span className="qw-chip grau"><i />Zielquadrat · A = {A} · s = ?</span>
              <span className="qw-chip akz">
                <i />Dein Quadrat · s = {fmt(last.s)} · s · s = {fmt(last.sq)}
              </span>
            </div>

            <svg className="qw-svg" viewBox="0 0 320 320" role="img"
              aria-label={`Zielquadrat mit Fläche ${A} und dein Quadrat mit Seitenlänge ${fmt(last.s)}`}>
              <defs>
                <clipPath id="qw-clip">
                  <rect x="2" y="2" width="316" height="316" />
                </clipPath>
              </defs>

              <g clipPath="url(#qw-clip)">
                <g transform={gTransform}>
                  <rect x={OX} y={OY - zielPx} width={zielPx} height={zielPx}
                    fill="var(--grau-hell)" stroke="var(--grau)" strokeWidth="2"
                    vectorEffect="non-scaling-stroke" />
                  <rect x={OX} y={OY - seitePx} width={seitePx} height={seitePx}
                    fill="var(--akzent-hell)" stroke="var(--akzent)" strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke" />
                  <rect x={OX} y={OY - zielPx} width={zielPx} height={zielPx}
                    fill="none" stroke="var(--grau)" strokeWidth="2"
                    vectorEffect="non-scaling-stroke" />
                </g>
              </g>

              {!gezoomt && (
                <g>
                  <text x={OX} y={OY - zielPx - 8} fontSize="15" fill="#5B6670"
                    paintOrder="stroke" stroke="#fff" strokeWidth="4">A = {A}</text>
                  <text x={OX - 8} y={OY - zielPx / 2} fontSize="15" fill="#5B6670" textAnchor="end"
                    paintOrder="stroke" stroke="#fff" strokeWidth="4">s = ?</text>
                  <text x={OX + 10} y={OY - 16} fontSize="16" fill="var(--akzent)" fontWeight="700"
                    paintOrder="stroke" stroke="#fff" strokeWidth="4">
                    s · s = {fmt(last.sq)}
                  </text>

                  <line x1={OX} y1={OY + 16} x2={OX + seitePx} y2={OY + 16}
                    stroke="var(--akzent)" strokeWidth="1.5" />
                  <line x1={OX} y1={OY + 11} x2={OX} y2={OY + 21}
                    stroke="var(--akzent)" strokeWidth="1.5" />
                  <line x1={OX + seitePx} y1={OY + 11} x2={OX + seitePx} y2={OY + 21}
                    stroke="var(--akzent)" strokeWidth="1.5" />
                  <text x={OX + seitePx / 2} y={OY + 36} fontSize="16" fill="var(--akzent)"
                    textAnchor="middle" fontWeight="700">s = {fmt(last.s)}</text>
                </g>
              )}

              {gezoomt && (
                <text x="10" y="20" fontSize="13" fill="#5B6670">
                  Lupe auf die rechte obere Ecke · {fmt(z, z < 10 ? 1 : 0)}-fach
                </text>
              )}
            </svg>

            <div className="qw-zoom">
              <label htmlFor="qw-zoomregler" style={{ fontSize: 14, color: "var(--gedimmt)" }}>
                Lupe
              </label>
              <input
                id="qw-zoomregler"
                type="range"
                min="0"
                max="100"
                value={sliderWert}
                onChange={(e) => setZoom(Math.pow(MAXZ, Number(e.target.value) / 100))}
              />
              <span className="qw-zoom-wert">{fmt(zoom, zoom < 10 ? 1 : 0)}-fach</span>
              <button className="qw-btn qw-btn-klein" onClick={autoZoom}>Unterschied zeigen</button>
              <button className="qw-btn qw-btn-klein" onClick={() => setZoom(1)}>Ganzes Quadrat</button>
            </div>
          </div>

          <div className="qw-karte">
            <p className="qw-titel">Dein nächster Versuch</p>

            {!done && (
              <div className="qw-eingabe">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  value={input}
                  placeholder={`zwischen ${fmt(lo)} und ${fmt(hi)}`}
                  aria-label="Seitenlänge eingeben"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") pruefen(); }}
                />
                <button className="qw-btn qw-btn-haupt" onClick={pruefen}>Prüfen</button>
              </div>
            )}

            <div className="qw-btnzeile">
              {!done && (
                <button className="qw-btn" onClick={mitteVorschlagen}>Mitte vorschlagen</button>
              )}
              <button className="qw-btn" onClick={zurueck} disabled={history.length === 0}>Zurück</button>
              <button className="qw-btn" onClick={neustart}>Neu starten</button>
            </div>

            <div className={"qw-rueck " + msg.kind} aria-live="polite">
              {msg.kind === "zuGross" && <span className="qw-pfeil">▲ zu groß</span>}
              {msg.kind === "zuKlein" && <span className="qw-pfeil">▼ zu klein</span>}
              {msg.kind === "exakt" && <span className="qw-pfeil">● genau</span>}
              {msg.text}
            </div>

            {done && (
              <div className="qw-ende">
                {exakt !== null ? (
                  <>
                    <h3>Genau getroffen</h3>
                    <p>
                      {fmt(exakt)} · {fmt(exakt)} = {A}. Die Seite ist also genau {fmt(exakt)} lang —
                      hier musst du gar nicht weiter eingrenzen.
                    </p>
                    <p>
                      Man schreibt dafür √{A} = {fmt(exakt)}. Bei {A} geht die Quadratwurzel auf, weil {A} eine
                      Quadratzahl ist. Probier zum Vergleich einmal eine andere Fläche.
                    </p>
                  </>
                ) : istQuadratzahl(A) ? (
                  <>
                    <h3>Hier geht es auf</h3>
                    <p>
                      Der Suchbereich ist schmaler als 0,001: s liegt zwischen {fmt(lo)} und {fmt(hi)}.
                    </p>
                    <p>
                      Die gesuchte Zahl ist genau {fmt(Math.sqrt(A))}, denn {fmt(Math.sqrt(A))} ·{" "}
                      {fmt(Math.sqrt(A))} = {A}. Man schreibt √{A} = {fmt(Math.sqrt(A))}. Gib den Wert
                      direkt ein, dann triffst du exakt.
                    </p>
                  </>
                ) : (
                  <>
                    <h3>Genau genug — und trotzdem nie fertig</h3>
                    <p>
                      Der Suchbereich ist jetzt schmaler als 0,001: s liegt zwischen {fmt(lo)} und {fmt(hi)}.
                    </p>
                    <p>
                      Diese Zahl heißt <strong>Quadratwurzel aus {A}</strong>, geschrieben √{A} ≈{" "}
                      {fmtFix(Math.sqrt(A), 4)}. Sie lässt sich weder als Bruch noch als abbrechende
                      Dezimalzahl schreiben. Du kannst den Bereich immer weiter halbieren und wirst nie
                      exakt bei {A} landen.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------------- rechte Spalte ---------------- */}
        <div>
          <div className="qw-karte">
            <p className="qw-titel">Suchbereich auf dem Zahlenstrahl</p>

            <div className="qw-bereich qw-zahl">
              {exakt !== null ? `s = ${fmt(exakt)}` : `${fmt(lo)} < s < ${fmt(hi)}`}
            </div>
            <div className="qw-breite qw-zahl">Breite des Bereichs: {fmt(width, 8)}</div>

            <svg className="qw-svg" viewBox="0 0 340 110" role="img"
              aria-label={`Suchbereich von ${fmt(lo)} bis ${fmt(hi)}`}>
              <rect x={bandX} y={44} width={bandW} height={22}
                fill="var(--akzent-hell)" stroke="var(--akzent)" strokeWidth="1.5" />
              <line x1={NX0} y1={66} x2={NX1} y2={66} stroke="#9AA3AB" strokeWidth="1.5" />

              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1={xOf(t)} y1={66} x2={xOf(t)} y2={73} stroke="#9AA3AB" strokeWidth="1.5" />
                  <text x={xOf(t)} y={90} fontSize="13" fill="#5B6670" textAnchor="middle">
                    {fmtFix(t, dec)}
                  </text>
                </g>
              ))}

              <line x1={bandX} y1={36} x2={bandX} y2={70} stroke="var(--akzent)" strokeWidth="2.5" />
              <line x1={bandX + bandW} y1={36} x2={bandX + bandW} y2={70}
                stroke="var(--akzent)" strokeWidth="2.5" />

              {history.length > 0 && <circle cx={xOf(aSide)} cy={55} r="4.5" fill="var(--akzent)" />}

              <text x={NX0} y={24} fontSize="13" fill="#5B6670">Untergrenze</text>
              <text x={NX1} y={24} fontSize="13" fill="#5B6670" textAnchor="end">Obergrenze</text>
            </svg>
          </div>

          <div className="qw-karte">
            <div className="qw-kopfzeile">
              <p className="qw-titel">Alle Versuche</p>
              <button className="qw-btn qw-btn-klein" onClick={tabelleAlsBild}>
                Tabelle als Bild speichern
              </button>
            </div>

            <div className="qw-scroll">
              <table className="qw-tab">
                <thead>
                  <tr>
                    <th>Nr.</th>
                    <th>Seite s</th>
                    <th>s · s</th>
                    <th>Ziel A</th>
                    <th>Ergebnis</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.label === "Start" ? "seed" : ""}>
                      <td>{r.label}</td>
                      <td>{fmt(r.s)}</td>
                      <td>{fmt(r.sq)}</td>
                      <td className="ziel">{A}</td>
                      <td>
                        {r.tooBig === null ? "● genau" : r.tooBig ? "▲ zu groß" : "▼ zu klein"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {bild && (
              <div className="qw-vorschau">
                <img src={bild} alt="Vorschau der gespeicherten Tabelle" />
                <p className="qw-hinweis">
                  Falls der Download nicht startet: Bild lange antippen beziehungsweise mit der rechten
                  Maustaste anklicken und „Bild speichern unter“ wählen.
                </p>
                <div className="qw-btnzeile">
                  <a
                    className="qw-btn qw-btn-klein"
                    href={bild}
                    download={`intervallschachtelung_A${A}.png`}
                    style={{ textDecoration: "none" }}
                  >
                    Bild speichern
                  </a>
                  <button className="qw-btn qw-btn-klein" onClick={() => setBild(null)}>
                    Vorschau schließen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
