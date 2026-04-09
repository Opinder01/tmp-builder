// src/Editor.jsx
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useNavigate } from "react-router-dom";



import {
  GoogleMap,
  useLoadScript,
  OverlayViewF,
  PolylineF,
  PolygonF,
} from "@react-google-maps/api";
import SignSupportActions from "./components/SignSupportActions";
import SignSupportConnector from "./components/SignSupportConnector";
import SignSupportItem from "./components/SignSupportItem";
import {
  getSignCatalog,
  getSignById,
  DEFAULT_SIGN_WIDTH_PX,
  DEFAULT_SIGN_HEIGHT_PX,
} from "./signCatalog";

const GMAP_LIBRARIES = ["places", "geometry"];

/**
 * Pointer delta in map-div / CSS pixels → local sign axes (local +x = right, +y = down
 * before rotate). Matches inverse of CSS rotate(rotDeg) ([[cos,-sin],[sin,cos]]).
 */
function signPointerDeltaToLocalDxDy(dx, dy, rotDeg) {
  const th = (Number(rotDeg) || 0) * (Math.PI / 180);
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return {
    dlx: cos * dx + sin * dy,
    dly: -sin * dx + cos * dy,
  };
}

/**
 * Opposite-corner-pinned resize: if visual size changes by (dW, dH) px, center shifts by
 * this offset in the same pixel space (for translate / latLngToPx commit). Works for any aspect ratio.
 */
function signResizeCenterOffsetPx(corner, dW, dH, rotDeg) {
  const c = corner ?? "se";
  const xS = { se: 1, sw: -1, ne: 1, nw: -1, e: 1, w: -1, n: 0, s: 0 }[c] ?? 0;
  const yS = { se: 1, sw: 1, ne: -1, nw: -1, e: 0, w: 0, n: -1, s: 1 }[c] ?? 0;
  const lx = (xS * dW) / 2;
  const ly = (yS * dH) / 2;
  const th = (Number(rotDeg) || 0) * (Math.PI / 180);
  const co = Math.cos(th);
  const si = Math.sin(th);
  return { x: lx * co - ly * si, y: lx * si + ly * co };
}

/** Corner drag in local axes: return new visual width/height in float map px. */
function signApplyCornerDeltaToVisualWH(corner, w0f, h0f, dlx, dly) {
  const k = corner ?? "se";
  let wf = w0f;
  let hf = h0f;
  if (k === "se") {
    wf = w0f + dlx;
    hf = h0f + dly;
  } else if (k === "sw") {
    wf = w0f - dlx;
    hf = h0f + dly;
  } else if (k === "ne") {
    wf = w0f + dlx;
    hf = h0f - dly;
  } else if (k === "nw") {
    wf = w0f - dlx;
    hf = h0f - dly;
  } else if (k === "e") wf = w0f + dlx;
  else if (k === "w") wf = w0f - dlx;
  else if (k === "s") hf = h0f + dly;
  else if (k === "n") hf = h0f - dly;
  return { wf, hf };
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function standMarkerIcon(type, selected) {
  const stroke = selected ? "#2563EB" : "#000";
  const fill = "#000";

  if (type === "windmaster") {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">
  <circle cx="22" cy="42" r="18" fill="${fill}"/>
  <circle cx="74" cy="42" r="18" fill="${fill}"/>
  <rect x="10" y="56" width="76" height="8" fill="${fill}"/>
  ${selected ? `<rect x="2" y="18" width="92" height="48" rx="3" fill="none" stroke="${stroke}" stroke-width="2" opacity="0.9"/>` : ""}
</svg>`;
    return {
      url: svgDataUrl(svg),
      scaledSize: new window.google.maps.Size(40, 28),
      anchor: new window.google.maps.Point(20, 14),
    };
  }

  // tripod (default)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="10" y="10" width="44" height="10" rx="1.5" fill="${fill}"/>
  <rect x="30" y="20" width="4" height="30" fill="${fill}"/>
  ${selected ? `<rect x="9" y="9" width="46" height="48" rx="3" fill="none" stroke="${stroke}" stroke-width="2" opacity="0.9"/>` : ""}
</svg>`;
  return {
    url: svgDataUrl(svg),
    scaledSize: new window.google.maps.Size(28, 28),
    anchor: new window.google.maps.Point(14, 14),
  };
}


function NorthArrowSVG() {
  return (
    <svg viewBox="23 8 54 54" width="100%" height="100%">
      <path d="M50 10 L75 60 L50 48 L25 60 Z" fill="#000" />
    </svg>
  );
}
function metersPerPixelAtLat(lat, zoom) {
  // Web Mercator ground resolution (meters per pixel) at given latitude & zoom
  const latRad = (lat * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
}

function pickNiceMeters(maxMeters) {
  if (!isFinite(maxMeters) || maxMeters <= 0) return 20;

  const exp = Math.floor(Math.log10(maxMeters));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 5, 10];

  let best = candidates[0] * base;
  for (const c of candidates) {
    const v = c * base;
    if (v <= maxMeters) best = v;
  }
  return best;
}

// Plan Scale bar (transparent background — map visible through)
function ScaleBarSVG() {
  return (
    <img
      src="/scale-bar.svg"
      alt="Plan Scale"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "fill",
        background: "transparent",
      }}
    />
  );
}
function MapScrollbars({ mapRef }) {
  const K = 14; // ✅ virtual canvas size = 10x viewport (change 8–14 if needed)

  const [ui, setUi] = React.useState({
    trackW: 0,
    trackH: 0,
    thumbW: 80,
    thumbH: 80,
    thumbX: 0,
    thumbY: 0,
  });

  const dragRef = React.useRef(null);
  // Stable reference for thumb position: set once, not on every recalc, so dx/dy change as user pans
  const displayOriginRef = React.useRef(null); // { lat, lng }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const worldSize = (z) => 256 * Math.pow(2, z);

  // Mercator helpers
  const latLngToWorld = (lat, lng, z) => {
    const s = worldSize(z);
    const x = ((lng + 180) / 360) * s;
    const sin = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
    return { x, y };
  };

  const worldToLatLng = (x, y, z) => {
    const s = worldSize(z);
    const lng = (x / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / s;
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    return { lat, lng };
  };

  const recalc = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const div = map.getDiv?.();
    if (!div) return;

    const c = map.getCenter?.();
    if (!c) return;

    // Initialize display origin only once so thumb moves as user pans
    if (!displayOriginRef.current) displayOriginRef.current = { lat: c.lat(), lng: c.lng() };
    const origin = displayOriginRef.current;

    const z = map.getZoom?.() ?? 18;

    const viewW = div.clientWidth;
    const viewH = div.clientHeight;

    const trackW = Math.max(0, viewW - 18 - 34);
    const trackH = Math.max(0, viewH - 18 - 34);

    const docW = viewW * K;
    const docH = viewH * K;

    const thumbW = clamp((viewW / docW) * trackW, 40, trackW || 40);
    const thumbH = clamp((viewH / docH) * trackH, 40, trackH || 40);

    // center delta in "world pixels" at current zoom
    const wo = latLngToWorld(origin.lat, origin.lng, z);
    const wc = latLngToWorld(c.lat(), c.lng(), z);

    const dx = wc.x - wo.x;
    const dy = wc.y - wo.y;

    // clamp motion to virtual doc range
    const maxDx = (docW - viewW) / 2;
    const maxDy = (docH - viewH) / 2;

    const dxClamped = clamp(dx, -maxDx, maxDx);
    const dyClamped = clamp(dy, -maxDy, maxDy);

    // Convert doc position -> thumb position
    const rangeX = Math.max(1, trackW - thumbW);
    const rangeY = Math.max(1, trackH - thumbH);

    const thumbX = ((dxClamped + maxDx) / (2 * maxDx)) * rangeX;
    const thumbY = ((dyClamped + maxDy) / (2 * maxDy)) * rangeY;

    setUi({ trackW, trackH, thumbW, thumbH, thumbX, thumbY });
  }, [mapRef]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    recalc();

    const idle = map.addListener("idle", recalc);
    const zoom = map.addListener("zoom_changed", recalc);

    const div = map.getDiv?.();
    let ro;
    if (div && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => recalc());
      ro.observe(div);
    }

    return () => {
      idle?.remove?.();
      zoom?.remove?.();
      if (ro) ro.disconnect();
    };
  }, [mapRef, recalc]);

  const setCenterFromThumb = (axis, newThumbPos) => {
    const map = mapRef.current;
    if (!map) return;

    const div = map.getDiv?.();
    if (!div) return;

    const c = map.getCenter?.();
    if (!c) return;
    if (!displayOriginRef.current) displayOriginRef.current = { lat: c.lat(), lng: c.lng() };
    const origin = displayOriginRef.current;

    const z = map.getZoom?.() ?? 18;

    const viewW = div.clientWidth;
    const viewH = div.clientHeight;

    const docW = viewW * K;
    const docH = viewH * K;

    const maxDx = (docW - viewW) / 2;
    const maxDy = (docH - viewH) / 2;

    const rangeX = Math.max(1, ui.trackW - ui.thumbW);
    const rangeY = Math.max(1, ui.trackH - ui.thumbH);

    const wo = latLngToWorld(origin.lat, origin.lng, z);
    const wcCurrent = latLngToWorld(c.lat(), c.lng(), z);
    // Preserve the axis we're not changing so we don't snap back
    let wc = { x: wcCurrent.x, y: wcCurrent.y };

    if (axis === "x") {
      const t = clamp(newThumbPos, 0, rangeX) / rangeX; // 0..1
      const dx = -maxDx + t * (2 * maxDx);
      wc.x = wo.x + dx;
    } else {
      const t = clamp(newThumbPos, 0, rangeY) / rangeY;
      const dy = -maxDy + t * (2 * maxDy);
      wc.y = wo.y + dy;
    }

    const ll = worldToLatLng(wc.x, wc.y, z);
    map.setCenter(ll);
  };

  const onThumbDown = (axis, e) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startThumbX: ui.thumbX,
      startThumbY: ui.thumbY,
    };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;

      if (d.axis === "x") {
        const dx = ev.clientX - d.startX;
        setCenterFromThumb("x", d.startThumbX + dx);
      } else {
        const dy = ev.clientY - d.startY;
        setCenterFromThumb("y", d.startThumbY + dy);
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const page = (axis, dir) => {
    const map = mapRef.current;
    if (!map) return;

    const div = map.getDiv?.();
    if (!div) return;

    const amt = axis === "x" ? div.clientWidth * 0.8 : div.clientHeight * 0.8;
    if (axis === "x") map.panBy(dir * amt, 0);
    else map.panBy(0, dir * amt);
  };

  const onTrackDown = (axis, e) => {
    // don't page if clicking thumb
    if (e.target?.dataset?.thumb === "1") return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (axis === "x") {
      const clickX = e.clientX - rect.left;
      const thumbCenter = ui.thumbX + ui.thumbW / 2;
      page("x", clickX < thumbCenter ? -1 : 1);
    } else {
      const clickY = e.clientY - rect.top;
      const thumbCenter = ui.thumbY + ui.thumbH / 2;
      page("y", clickY < thumbCenter ? -1 : 1);
    }
  };

return (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,

      // ✅ IMPORTANT: overlay itself must NOT steal clicks
      pointerEvents: "none",
      zIndex: 500,
    }}
  >
    {/* bottom scrollbar */}
    <div
      onMouseDown={(e) => onTrackDown("x", e)}
      style={{
        position: "absolute",
        left: 18,
        right: 34,
        bottom: 10,
        height: 14,
        background: "rgba(255,255,255,0.75)",
        border: "1px solid rgba(0,0,0,0.25)",
        borderRadius: 8,
        userSelect: "none",

        // ✅ bar itself is clickable
        pointerEvents: "auto",
      }}
    >
      <div
        data-thumb="1"
        onMouseDown={(e) => onThumbDown("x", e)}
        style={{
          position: "absolute",
          left: ui.thumbX,
          top: 2,
          height: 10,
          width: ui.thumbW,
          background: "rgba(0,0,0,0.35)",
          borderRadius: 6,
          cursor: "ew-resize",
        }}
        title="Drag to pan left/right"
      />
    </div>

    {/* right scrollbar */}
    <div
      onMouseDown={(e) => onTrackDown("y", e)}
      style={{
        position: "absolute",
        top: 18,
        bottom: 34,
        right: 10,
        width: 14,
        background: "rgba(255,255,255,0.75)",
        border: "1px solid rgba(0,0,0,0.25)",
        borderRadius: 8,
        userSelect: "none",

        // ✅ bar itself is clickable
        pointerEvents: "auto",
      }}
    >
      <div
        data-thumb="1"
        onMouseDown={(e) => onThumbDown("y", e)}
        style={{
          position: "absolute",
          top: ui.thumbY,
          left: 2,
          width: 10,
          height: ui.thumbH,
          background: "rgba(0,0,0,0.35)",
          borderRadius: 6,
          cursor: "ns-resize",
        }}
        title="Drag to pan up/down"
      />
    </div>
  </div>
);
} 


/** =========================
 * Plan Elements → Cones grid
 * ========================= */
const CONE_ITEMS = [
  { id: "barrel", label: "Barrel" },
  { id: "barrier", label: "Barrier" },
  { id: "bollard", label: "Bollard" },
  { id: "cone", label: "Cone" },
  { id: "ped_tape", label: "Pedestrian Tape" },
  { id: "type1", label: "Type 1 Barricade" },
  { id: "type2", label: "Type 2 Barricade" },
];

// Centralized sizing / spacing for cones‑section tools so they look natural on the map.
const CONE_VISUAL = {
  barrel: {
    // larger than a cone, but not huge
    markerSize: 8, // px in icon wrapper
    spacingPx: 22,
  },
  bollard: {
    // slim / small vertical marker
    markerSize: 5,
    spacingPx: 14,
  },
  cone: {
    // standard traffic cone
    markerSize: 8,
    spacingPx: 18,
  },
  type1: {
    // Type 1 barricade, wider than cone but not dominating
    markerSize: 11,
    spacingPx: 24,
  },
  type2: {
    // slightly more substantial than Type 1
    markerSize: 12,
    spacingPx: 26,
  },
  default: {
    markerSize: 7,
    spacingPx: 18,
  },
  barrier: {
    // dashed barrier line styling
    repeatPx: 12,
    strokeWeight: 1.8,
  },
  ped_tape: {
    // pedestrian tape line styling
    repeatPx: 10,
    redStrokeWeight: 2.4,
    whiteStrokeWeight: 2.0,
  },
};

/** =========================
 * Plan Elements → Work Area
 * ========================= */
const WORK_AREA_ITEMS = [
  { id: "work_area", label: "Work Area" },
];

/** =========================
 * Measurements panel items
 * ========================= */
const MEAS_ITEMS = [
  { id: "distance", label: "Distance Marker" },
  { id: "combined", label: "Combined Distance Marker" },
];

/** =========================
 * Signs: generated from central catalog (signCatalog.js)
 * ========================= */
const SIGN_ITEMS = getSignCatalog();

/** =========================
 * Cones spacing (real‑world meters)
 * ========================= */
// Default spacing for cones, barrels, bollards: 2.9 m. If speed known, BC TMM: speed(km/h)/10.
const DEFAULT_CONE_SPACING_M = 2.9;

// Per‑tool multipliers. cone/barrel/bollard use 2.9 m; barricades use wider spacing.
const CONE_SPACING_MULTIPLIER = {
  cone: 1,        // 2.9 m
  bollard: 1,     // 2.9 m
  barrel: 1,      // 2.9 m
  type1: 2.0,     // barricades spaced wider
  type2: 2.2,
  default: 1,
};

const getConeSpacingMeters = (typeId, speedKmH) => {
  const base =
    Number.isFinite(speedKmH) && speedKmH > 0
      ? Math.max(1, speedKmH / 10)
      : DEFAULT_CONE_SPACING_M;
  const mult = CONE_SPACING_MULTIPLIER[typeId] ?? CONE_SPACING_MULTIPLIER.default;
  return base * mult;
};
const MIN_MOVE_PX = 2;

const WORKAREA_STROKE = "#39D353";  // parrot green
const WORKAREA_FILL_OPACITY = 0.22; // transparent fill
const WORKAREA_STROKE_OPACITY = 0.9;
const WORKAREA_STROKE_WEIGHT = 3;
const WORKAREA_POLY_OPTS = {
  strokeColor: WORKAREA_STROKE,
  strokeOpacity: WORKAREA_STROKE_OPACITY,
  strokeWeight: WORKAREA_STROKE_WEIGHT,
  fillColor: WORKAREA_STROKE,       // ✅ IMPORTANT (if missing → you get default blue)
  fillOpacity: WORKAREA_FILL_OPACITY,
  clickable: false,
  draggable: false,
  editable: false,
  zIndex: 5,
};


/** =========================
 * Click vs double click guard
 * ========================= */
const CLICK_DELAY_MS = 220;

/** =========================
 * Measurements: skip tiny segments
 * ========================= */
const MIN_SEGMENT_METERS = 0.001;
/** =========================
 * Fonts for Insert text
 * ========================= */
const FONT_FAMILIES = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
];

/** =========================
 * Title Box layout constants
 * ========================= */
const TITLE_HEADER_H = 44; // ✅ controls the header height (where vertical line can exist)

/** =========================
 * Cursor: Pencil (data URL SVG)
 * ========================= */
const PENCIL_CURSOR = (() => {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <g transform="translate(6,3) rotate(25 10 10)">
        <path d="M3 19 L5 21 L18 8 L16 6 Z" fill="#f4c542" stroke="#111" stroke-width="1"/>
        <path d="M16 6 L18 8 L20 6 L18 4 Z" fill="#111"/>
        <path d="M3 19 L2 22 L5 21 Z" fill="#e2e2e2" stroke="#111" stroke-width="1"/>
      </g>
    </svg>
  `);
  return `url("data:image/svg+xml,${svg}") 3 26, crosshair`;
})();

/** =========================
 * Canvas-like rotate icon (neutral → blue when active)
 * ========================= */
function RotateIcon({ active = false, style }) {
  const stroke = active ? "#2563EB" : "#111827";
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" style={{ pointerEvents: "none", ...style }}>
      <path
        d="M7.5 7.5A6.5 6.5 0 0 1 18 10"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18 10V6.7M18 10h-3.3"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 16.5A6.5 6.5 0 0 1 6 14"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 14v3.3M6 14h3.3"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** =========================
 * Geometry helpers
 * ========================= */
function toRad(d) {
  return (d * Math.PI) / 180;
}
function haversineMeters(a, b) {
  const R = 6371000;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const __LL_CACHE = new Map();

function cachedLatLng(lat, lng) {
  const key = `${lat.toFixed(7)},${lng.toFixed(7)}`;
  const hit = __LL_CACHE.get(key);
  if (hit) return hit;
  const obj = { lat, lng };
  __LL_CACHE.set(key, obj);
  return obj;
}

function midpointLatLng(a, b) {
  const lat = (a.lat + b.lat) / 2;
  const lng = (a.lng + b.lng) / 2;
  return cachedLatLng(lat, lng);
}

function formatMeters(m) {
  if (m < 10) return `${m.toFixed(2)} m`;
  if (m < 100) return `${m.toFixed(1)} m`;
  return `${Math.round(m)} m`;
}
function nearlySameLatLng(a, b, epsMeters = MIN_SEGMENT_METERS) {
  if (!a || !b) return false;
  return haversineMeters(a, b) < epsMeters;
}

/** pixel helpers */
function distPx(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function lerpPx(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function resamplePolylinePx(points, spacingPx) {
  if (points.length < 2) return [];
  const out = [];
  let carry = 0;
  out.push(points[0]);

  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let segLen = distPx(a, b);
    if (segLen < 0.0001) continue;

    while (carry + segLen >= spacingPx) {
      const need = spacingPx - carry;
      const t = need / segLen;
      const p = lerpPx(a, b, t);
      out.push(p);
      a = p;
      segLen = distPx(a, b);
      carry = 0;
    }

    carry += segLen;
  }

  return out;
}

// Great‑circle distance in meters between two lat/lng points.
function distMetersLL(a, b) {
  if (!a || !b) return 0;
  const gm = window.google?.maps;
  if (gm?.geometry?.spherical?.computeDistanceBetween) {
    return gm.geometry.spherical.computeDistanceBetween(
      new gm.LatLng(a.lat, a.lng),
      new gm.LatLng(b.lat, b.lng)
    );
  }
  const R = 6378137; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(la1) * Math.cos(la2) * sin2 * sin2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// Resample a polyline in real‑world meters, returning new lat/lng points.
function resamplePolylineMetersLL(points, spacingMeters) {
  if (!points || points.length < 2 || !Number.isFinite(spacingMeters) || spacingMeters <= 0) {
    return [];
  }
  const out = [];
  let carry = 0;
  out.push(points[0]);

  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let segLen = distMetersLL(a, b);
    if (segLen < 0.001) continue;

    while (carry + segLen >= spacingMeters) {
      const need = spacingMeters - carry;
      const t = need / segLen;
      const p = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
      out.push(p);
      a = p;
      segLen = distMetersLL(a, b);
      carry = 0;
    }

    carry += segLen;
  }

  return out;
}

/** =========================
 * Icons / Shapes
 * ========================= */
function TriangleCone({ strokeScale = 1 }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <path
        d="M12 4 L20 20 H4 L12 4Z"
        fill="#F59E0B"
        stroke="#111"
        strokeWidth={1.1 * strokeScale}
      />
    </svg>
  );
}
function BarricadeType1({ strokeScale = 1 }) {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%">
      <rect
        x="7"
        y="12"
        width="18"
        height="10"
        rx="2"
        fill="#ffffff"
        stroke="#111"
        strokeWidth={1.1 * strokeScale}
      />
      <path d="M10 14 L14 12" stroke="#F59E0B" strokeWidth={2.6 * strokeScale} />
      <path d="M16 16 L22 13" stroke="#F59E0B" strokeWidth={2.6 * strokeScale} />
      <path
        d="M10 20 L22 14"
        stroke="#F59E0B"
        strokeWidth={2.6 * strokeScale}
        opacity="0.95"
      />
      <path
        d="M11 22 L9 28"
        stroke="#111"
        strokeWidth={1.8 * strokeScale}
        strokeLinecap="round"
      />
      <path
        d="M21 22 L23 28"
        stroke="#111"
        strokeWidth={1.8 * strokeScale}
        strokeLinecap="round"
      />
    </svg>
  );
}
function BarricadeType2({ strokeScale = 1 }) {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%">
      <rect
        x="6"
        y="12"
        width="20"
        height="10"
        rx="2"
        fill="#ffffff"
        stroke="#111"
        strokeWidth={1.2 * strokeScale}
      />
      <rect
        x="8"
        y="10"
        width="16"
        height="3"
        rx="1.5"
        fill="#E5E7EB"
        stroke="#111"
        strokeWidth={1.0 * strokeScale}
      />
      <path d="M9 16 L15 13" stroke="#F59E0B" strokeWidth={2.6 * strokeScale} />
      <path d="M13 20 L23 14" stroke="#F59E0B" strokeWidth={2.6 * strokeScale} />
      <path
        d="M8 18 L12 16"
        stroke="#F59E0B"
        strokeWidth={2.6 * strokeScale}
        opacity="0.95"
      />
      <path
        d="M11 22 L9 28"
        stroke="#111"
        strokeWidth={1.8 * strokeScale}
        strokeLinecap="round"
      />
      <path
        d="M21 22 L23 28"
        stroke="#111"
        strokeWidth={1.8 * strokeScale}
        strokeLinecap="round"
      />
    </svg>
  );
}
function Dot({ size = 8, strokeScale = 1 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "#F97316",
        border: `${1.4 * strokeScale}px solid #111`,
        boxSizing: "border-box",
      }}
    />
  );
}
function MarkerVisual({ typeId, strokeScale = 1, scale = 1 }) {
  const cfg = CONE_VISUAL[typeId] || CONE_VISUAL.default;
  // Render at the target pixel size directly so SVG re-rasterizes at correct
  // resolution instead of being CSS-scaled from a cached small bitmap.
  const sz = Math.max(2, Math.round(cfg.markerSize * scale));

  if (typeId === "barrel") return <Dot size={sz} strokeScale={strokeScale} />;
  if (typeId === "bollard") return <Dot size={sz} strokeScale={strokeScale} />;
  if (typeId === "cone") {
    return (
      <div style={{ width: sz, height: sz }}>
        <TriangleCone strokeScale={strokeScale} />
      </div>
    );
  }
  if (typeId === "type1") {
    return (
      <div style={{ width: sz, height: sz }}>
        <BarricadeType1 strokeScale={strokeScale} />
      </div>
    );
  }
  if (typeId === "type2") {
    return (
      <div style={{ width: sz, height: sz }}>
        <BarricadeType2 strokeScale={strokeScale} />
      </div>
    );
  }
  return <Dot size={sz} strokeScale={strokeScale} />;
}

/** =========================
 * Dimension line helpers
 * ========================= */
function DimensionSegment({
  a,
  b,
  opacity = 1,
  zIndex = 20,
  scale = 1,
  pixelLen = null,
}) {
  // Paper-like behaviour: graphics don't explode with zoom.
  const lineWeight = 1.4; // px, constant

  const isShort = pixelLen != null && pixelLen < 24;

  const baseOptions = {
    strokeColor: "#111",
    strokeOpacity: 0.9 * opacity,
    strokeWeight: lineWeight,
    clickable: false,
    zIndex,
    strokeLinecap: "round",
  };

  // Clean professional style:
  // - trimmed dimension line
  // - small arrowheads at both ends, aligned with the line
  const arrowScale = 2.4; // constant small arrow size
  const arrowPath = window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW;

  const arrowIcon = {
    path: arrowPath,
    fillColor: "#111",
    fillOpacity: 1,
    strokeWeight: 0,
    scale: arrowScale,
  };

  function trimPoint(start, end, px) {
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const len = Math.hypot(dx, dy);
    if (!len) return start;

    const t = Math.min(0.18, Math.max(0.02, px / 600));
    return {
      lat: start.lat + dy * t,
      lng: start.lng + dx * t,
    };
  }

  if (isShort) {
    // For very short spans, just a clean line
    return <PolylineF path={[a, b]} options={baseOptions} />;
  }

  // Trim a little space so arrows sit neatly at the ends
  const trimPx = 10;
  const a2 = trimPoint(a, b, trimPx);
  const b2 = trimPoint(b, a, trimPx);

  return (
    <>
      {/* trimmed center line */}
      <PolylineF path={[a2, b2]} options={baseOptions} />

      {/* arrow at B */}
      <PolylineF
        path={[a2, b]}
        options={{
          ...baseOptions,
          strokeOpacity: 0,
          icons: [{ icon: arrowIcon, offset: "100%" }],
        }}
      />

      {/* arrow at A */}
      <PolylineF
        path={[b2, a]}
        options={{
          ...baseOptions,
          strokeOpacity: 0,
          icons: [{ icon: arrowIcon, offset: "100%" }],
        }}
      />
    </>
  );
}
function SmallDimensionSegment({
  a,
  b,
  opacity = 1,
  zIndex = 20,
  scale = 1,
}) {
  const baseOptions = {
    strokeColor: "#111",
    strokeOpacity: 0.8 * opacity,
    // Simple clean line for small distance marker – no arrows, no ticks.
    // Keep a slightly thinner but constant stroke so it reads well at any zoom.
    strokeWeight: 1.1,
    clickable: false,
    zIndex,
    strokeLinecap: "round",
  };

  return (
    <PolylineF
      path={[a, b]}
      options={{
        ...baseOptions,
      }}
    />
  );
}
function MeasureLabel({
  position,
  text,
  opacity = 1,
  fontScale = 1,
  rotateDeg = 0,
  offsetY = 0,
 useTopAnchor = false,
  onDblClick,
  isEditing = false,
  editValue = "",
  onEditChange,
  onEditCommit,
  onEditCancel,
}) {
  const inputRef = React.useRef(null);
  React.useEffect(() => {
  if (!isEditing) return;
  const el = inputRef.current;
  if (!el) return;

  // keep focus even if OverlayView causes a blur
  const raf = requestAnimationFrame(() => {
    el.focus();
    // put caret at end
    const n = el.value?.length ?? 0;
    try { el.setSelectionRange(n, n); } catch {}
  });

  return () => cancelAnimationFrame(raf);
}, [isEditing, editValue]);
  return (
    <OverlayViewF position={position} mapPaneName="overlayMouseTarget">
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isEditing) onDblClick?.();
        }}
        style={{
  transform: useTopAnchor
  ? `translate(-50%, ${offsetY}px) rotate(${rotateDeg}deg)`
  : `translate(-50%, calc(-50% + ${offsetY}px)) rotate(${rotateDeg}deg)`,
  
  transformOrigin: "center",
  background: "#fff",
  border: "1px solid #777",
  borderRadius: "1px",
  padding: "2px 6px",
  fontSize: 4 * fontScale,
  fontWeight: 500,
  lineHeight: 1,
  color: "#111",
  position: "relative",
  zIndex: 9999,
  whiteSpace: "nowrap",
  pointerEvents: "auto",
  opacity,
  display: "inline-block",
  userSelect: "none",
}}
      >
        
        {!isEditing ? (
          text
        ) : (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
  e.stopPropagation();
  onEditChange?.(e.target.value);
}}
onKeyDownCapture={(e) => {
  // ✅ stop events before Google Maps sees them
  e.stopPropagation();
  e.nativeEvent?.stopImmediatePropagation?.();
}}
onKeyUpCapture={(e) => {
  e.stopPropagation();
  e.nativeEvent?.stopImmediatePropagation?.();
}}
onKeyDown={(e) => {
  // ✅ block Google Maps from seeing ANY typing keys
  e.stopPropagation();
  e.nativeEvent?.stopImmediatePropagation?.();

  if (e.key === "Enter") {
    e.preventDefault();
    onEditCommit?.();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    onEditCancel?.();
  }
}}
onKeyUp={(e) => e.stopPropagation()}
onKeyPress={(e) => e.stopPropagation()}
            // ✅ IMPORTANT: do NOT auto-commit on blur (prevents “one letter only” issue)
            onBlur={() => {
  // If we are still editing, immediately regain focus (prevents “one letter only”)
  if (!isEditing) return;
  setTimeout(() => inputRef.current?.focus(), 0);
}}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            // ✅ keep focus even if map tries to steal it
           
            style={{
              fontSize: 9,
              fontWeight: 600,
              border: "1px solid #999",
              borderRadius: 3,
              padding: "0px 3px",
              outline: "none",
              width: "auto",
            }}
          />
        )}
      </div>
    </OverlayViewF>
  );
}



/** =========================
 * Lines for cones (Barrier + Ped Tape)
 * ========================= */
function BarrierPolyline({ path, preview = false }) {
  return (
    <PolylineF
      path={path}
      options={{
        strokeOpacity: 0,
        strokeWeight: CONE_VISUAL.barrier.strokeWeight,
        clickable: false,
        zIndex: preview ? 999 : 10,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: 1,
              strokeWeight: CONE_VISUAL.barrier.strokeWeight,
              strokeColor: "#9CA3AF",
            },
            offset: "0",
            repeat: `${CONE_VISUAL.barrier.repeatPx}px`,
          },
        ],
      }}
    />
  );
}
function PedTapePolyline({ path, preview = false }) {
  return (
    <>
      <PolylineF
        path={path}
        options={{
          strokeOpacity: 1,
          strokeWeight: CONE_VISUAL.ped_tape.whiteStrokeWeight,
          strokeColor: "#ffffff",
          clickable: false,
          zIndex: preview ? 999 : 10,
        }}
      />
      <PolylineF
        path={path}
        options={{
          strokeOpacity: 0,
          strokeWeight: 2,
          clickable: false,
          zIndex: preview ? 1000 : 11,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeWeight: CONE_VISUAL.ped_tape.redStrokeWeight,
                strokeColor: "#DC2626",
              },
              offset: "0",
              repeat: `${CONE_VISUAL.ped_tape.repeatPx}px`,
            },
          ],
        }}
      />
    </>
  );
}

// ─── Custom connector overlay ─────────────────────────────────────────────────
// One instance per sign.  draw() is called by Google Maps on *every* animation
// frame (zoom, pan, tilt) so the SVG coordinates are always in sync with the
// map projection – no React render needed for zoom correctness.
let _ConnectorOverlayClass = null;
function getConnectorOverlayClass() {
  if (_ConnectorOverlayClass) return _ConnectorOverlayClass;
  if (!window.google?.maps?.OverlayView) return null;
  _ConnectorOverlayClass = class SignConnectorOverlay extends window.google.maps.OverlayView {
    constructor() { super(); this._sign = null; this._div = null; this._svg = null; }
    update(sign) { this._sign = sign; if (this.getMap()) this.draw(); }
    onAdd() {
      this._div = document.createElement("div");
      this._div.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
      this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this._svg.style.cssText =
        "position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;";
      this._div.appendChild(this._svg);
      this.getPanes().overlayLayer.appendChild(this._div);
    }
    draw() {
      if (!this._sign || !this._div || !this._svg) return;
      const proj = this.getProjection();
      if (!proj) return;
      const s = this._sign;
      const sCtr = proj.fromLatLngToDivPixel(
        new window.google.maps.LatLng(s.pos.lat, s.pos.lng)
      );
      if (!sCtr) return;
      const currentZoom = this.getMap()?.getZoom?.() ?? 18;
      const signZRef    = s.zRef ?? 18;
      const signW = Math.round((s.wPx ?? 64) * Math.pow(2, currentZoom - signZRef));
      const signH = Math.round((s.hPx ?? 64) * Math.pow(2, currentZoom - signZRef));
      const halfW = signW / 2;
      const halfH = signH / 2;
      // Reproduce centerOverlayOffset() behavior:
      // getPixelPositionOffset uses Math.round(-w/2) and Math.round(-h/2).
      // If w/h are odd, that causes a +/-0.5px shift vs the raw projection center.
      const centerShiftX = halfW - Math.round(halfW);
      const centerShiftY = halfH - Math.round(halfH);
      const sCtrX = sCtr.x + centerShiftX;
      const sCtrY = sCtr.y + centerShiftY;
      // Position container div exactly at the sign visual center (overlay-pane coords)
      this._div.style.left = sCtrX + "px";
      this._div.style.top  = sCtrY + "px";

      const th    = ((s.rotDeg ?? 0) * Math.PI) / 180;
      const stands = s.stands || [];
      // Keep exactly the right number of <line> elements
      while (this._svg.children.length > stands.length)
        this._svg.removeChild(this._svg.lastChild);
      while (this._svg.children.length < stands.length) {
        const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
        ln.setAttribute("stroke", "#111");
        ln.setAttribute("stroke-width", "2");
        ln.setAttribute("stroke-dasharray", "0.01 8");
        ln.setAttribute("stroke-linecap", "round");
        this._svg.appendChild(ln);
      }
      for (let i = 0; i < stands.length; i++) {
        const st   = stands[i];
        const stPx = proj.fromLatLngToDivPixel(
          new window.google.maps.LatLng(st.pos.lat, st.pos.lng)
        );
        const ln = this._svg.children[i];
        if (!stPx) { ln.setAttribute("visibility", "hidden"); continue; }
        ln.setAttribute("visibility", "visible");
        const side = st.type === "tripod" ? -1 : 1;
        ln.setAttribute("x1", (side * halfW * Math.cos(th)).toString());
        ln.setAttribute("y1", (side * halfW * Math.sin(th)).toString());
        // Use sign-aligned center so connector stays attached during zoom.
        ln.setAttribute("x2", (stPx.x - sCtrX).toString());
        ln.setAttribute("y2", (stPx.y - sCtrY).toString());
      }
    }
    onRemove() {
      if (this._div?.parentNode) this._div.parentNode.removeChild(this._div);
      this._div = null; this._svg = null;
    }
  };
  return _ConnectorOverlayClass;
}
// ──────────────────────────────────────────────────────────────────────────────

/** =========================
 * Main Editor
 * ========================= */
export default function Editor() {

const { isLoaded, loadError } = useLoadScript({
  id: "gmap-script",
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  libraries: GMAP_LIBRARIES,
});

const nav = useNavigate();

  const savedLocation = JSON.parse(
    localStorage.getItem("tmp_new_location") || "{}"
  );
useEffect(() => {
  setMapKey((k) => k + 1);
}, [
  savedLocation?.lat,
  savedLocation?.lng,
  savedLocation?.latitude,
  savedLocation?.longitude,
  savedLocation?.position?.lat,
  savedLocation?.position?.lng,
]);



  const center = useMemo(
    () => ({
      lat:
        savedLocation.lat ??
        savedLocation.latitude ??
        savedLocation.position?.lat ??
        49.2827,
      lng:
        savedLocation.lng ??
        savedLocation.longitude ??
        savedLocation.position?.lng ??
        -123.1207,
    }),
    [savedLocation]
  );


const sumBefore = (arr, idx) => {
  let s = 0;
  for (let i = 0; i < idx; i++) s += arr[i];
  return s;
};
function TitleBoxContent({ data, scale: s = 1 }) {
  const logoScale = data?.logoScale ?? 1;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#fff",
        border: `${Math.max(1, 2 * s)}px solid #111`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: 10 * s,
        gap: 6 * s,
        overflow: "hidden",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", gap: 12 * s, alignItems: "flex-start" }}>
        {/* Left logo area */}
        <div
          style={{
            width: 90 * s,
            height: 70 * s,
            border: `${Math.max(1, 1 * s)}px solid #ddd`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {data?.logoDataUrl ? (
            <img
              src={data.logoDataUrl}
              alt="Logo"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                transform: `scale(${logoScale})`,
                transformOrigin: "center center",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div style={{ fontSize: Math.max(8, 11 * s), color: "#666" }}>Logo</div>
          )}
        </div>

        {/* Right text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* ✅ Project label must NEVER disappear */}
          <div style={{ fontWeight: 800, fontSize: Math.max(8, 14 * s), marginBottom: 4 * s }}>
            <span style={{ fontWeight: 900 }}>Project:</span>{" "}
            {data?.project || ""}
          </div>

          <div style={{ fontSize: Math.max(8, 12 * s), lineHeight: 1.3, color: "#111" }}>
            <div>
              <b>Date:</b> {data?.date || ""}
              {"  "} <b>Author:</b> {data?.author || ""}
            </div>
            <div>
              <b>Job Location:</b> {data?.jobLocation || ""}
            </div>
          </div>
        </div>

        {/* ✅ REMOVED: Plan Scale box */}
      </div>

      {/* Divider */}
      <div style={{ height: Math.max(1, 1 * s), background: "#111", opacity: 0.2 }} />

      {/* ✅ Bottom row now shows Comments */}
      <div
  style={{
    fontSize: Math.max(8, 12 * s),
    color: "#111",
    whiteSpace: "pre-wrap",   // ✅ THIS FIXES ENTER KEY
    wordBreak: "break-word",
  }}
>
  <b>Comments:</b> {data?.comments || ""}
</div>

    </div>
  );
}

const [editingLabel, setEditingLabel] = useState(null);
// editingLabel = { kind: "measure", id: "<measureId>", value: "text" }
  /* ================= MAP CONTROLS ================= */
  const mapRef = useRef(null);
  const mapHostRef = useRef(null);
  const lastMapViewRef = React.useRef({ center: null, zoom: null });
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  // Stand movement uses uiDrag (like signs); no marker-native drag.

  const dblClickGuardRef = useRef(false);

  const pictureInputRef = useRef(null);
const [pendingPictureTool, setPendingPictureTool] = useState(null);
// Disable map gestures while dragging overlays (prevents jumpiness)
const lockMapInteractions = React.useCallback((locked) => {
  const m = mapRef.current;
  if (!m) return;

  if (locked) {
    m.setOptions({
      draggable: false,
      gestureHandling: "none",
      scrollwheel: false,
      disableDoubleClickZoom: true,
      keyboardShortcuts: false,
    });
  } else {
    m.setOptions({
      draggable: true,
      gestureHandling: "auto",
      scrollwheel: true,
      disableDoubleClickZoom: false,
      keyboardShortcuts: false,
    });
  }
}, []);
const onPickPicture = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    setPendingPictureTool({
      dataUrl: reader.result,
      wPx: 260,
      hPx: 180,
    });
    setActiveTool("insert:picture");
  };
  reader.readAsDataURL(file);

  e.target.value = "";
};

const titleLogoInputRef = useRef(null);

const uploadInsertTitleLogo = (insertId, file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    setInsertObjects((prev) =>
      prev.map((o) => {
        if (o.id !== insertId) return o;
        const nextData = { ...(o.data || {}) };
        nextData.logoDataUrl = dataUrl;
        if (nextData.logoScale == null) nextData.logoScale = 1;
        return { ...o, data: nextData };
      })
    );
  };
  reader.readAsDataURL(file);
};


  const zoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom((map.getZoom() ?? 18) + 1);
  };
  const zoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom((map.getZoom() ?? 18) - 1);
  };
  const userDidManualResetRef = useRef(false);
  const resetToLocation = () => {
  const map = mapRef.current;
  if (!map) return;

  setMapView({ center, zoom: 18 }); // ✅ makes reset persistent
  map.panTo(center);
  map.setZoom(18);
};

  const [mapView, setMapView] = useState(() => ({
  center: center,  // your existing center variable
  zoom: 18,
}));
useEffect(() => {
  const el = mapHostRef.current;
  if (!el) return;

  const ro = new ResizeObserver(() => {
    const map = mapRef.current;
    if (!map) return;

    try { window.google?.maps?.event?.trigger?.(map, "resize"); } catch {}

    const c = mapView?.center || center;
    if (c) map.panTo(c);
  });

  ro.observe(el);
  return () => ro.disconnect();
}, [mapView?.center, center]);
const [mapLayer, setMapLayer] = useState("roadmap"); // roadmap | satellite | hybrid | terrain

  // ================= Zoom scaling helpers (ground-anchored overlays) =================
  const zoomNow = mapView?.zoom ?? 18;
  // Use integer zoom for plan elements to avoid subpixel jitter during zoom
  const zoomForPlan = Number.isFinite(zoomNow) ? Math.round(zoomNow) : 18;
  const zoomScale = (zRef) => {
  if (!Number.isFinite(zoomNow)) return 1;        // ✅ prevents NaN
  const zr = Number.isFinite(zRef) ? zRef : zoomNow;
  return Math.pow(2, zoomNow - zr);
};
// Plan elements use rounded zoom so scale snaps cleanly and overlays don't jitter
const zoomScalePlan = (zRef) => {
  if (!Number.isFinite(zoomForPlan)) return 1;
  const zr = Number.isFinite(zRef) ? zRef : ELEMENT_BASE_ZOOM;
  return Math.pow(2, zoomForPlan - zr);
};
// ================= Plan element scale: ground-anchored, principal size at zRef =================
const ELEMENT_BASE_ZOOM = 18;
const elementScaleRaw = zoomScale(ELEMENT_BASE_ZOOM);

// Cones: scale with map, cap growth at 1.2x when zoomed in, floor 0.35 when zoomed far out
const elementScale = Math.max(0.35, Math.min(1.2, elementScaleRaw));

// Plan elements (legend, manifest, title, inserts, north arrow): scale WITH the map exactly like signs/buildings.
// Principal size = pixel size at zRef zoom. Uses fractional zoomNow for smooth continuous animation.
// Floor 0.05 prevents zero-px CSS layout when zoomed very far out. No growth cap → "paint on the wall".
const planElementZoomScale = (zRef) => Math.max(0.05, zoomScale(zRef ?? ELEMENT_BASE_ZOOM));
const scalePxPlan = (px, zRef) => (px ?? 0) * planElementZoomScale(zRef ?? ELEMENT_BASE_ZOOM);
// Rounded pixel dimensions for overlay tools to eliminate subpixel jitter during zoom
const scalePxPlanRounded = (px, zRef) => Math.round(scalePxPlan(px, zRef));
const uiScaleFromZRefPlan = (basePx, zRef) => (!basePx ? 1 : scalePxPlan(basePx, zRef) / basePx);
// Content scale: zoom × (box size / ref). When user resizes box, text/inside scales with it.
const contentScalePlan = (wPx, zRef, refW = 200) =>
  planElementZoomScale(zRef ?? ELEMENT_BASE_ZOOM) * ((wPx ?? refW) / refW);

// Center overlays on their lat/lng anchor; use integer pixel offset to prevent vibration/jitter
const centerOverlayOffset = (w, h) => ({
  x: w != null && h != null ? Math.round(-Number(w) / 2) : 0,
  y: w != null && h != null ? Math.round(-Number(h) / 2) : 0,
});

// Same as centerOverlayOffset, but without rounding. Use for the sign support system
// so zoom keeps the visual anchor perfectly stable ("paint on a wall").
const centerOverlayOffsetFloat = (w, h) => ({
  x: w != null && h != null ? -Number(w) / 2 : 0,
  y: w != null && h != null ? -Number(h) / 2 : 0,
});
// ✅ Natural visual behavior on zoom out (prevents dark stacking)
const fx = (() => {
  // tune thresholds if you want
  if (zoomNow >= 18) {
    return {
  shadow: "drop-shadow(0px 2px 2px rgba(0,0,0,0.25))",
  strokeScale: 1,
  ghost: 1
};
  }
  if (zoomNow >= 16) {
    return { shadow: "none", strokeScale: 0.85, ghost: 0.9 };
  }
  return { shadow: "none", strokeScale: 0.7, ghost: 0.85 };
})();
  const scalePx = (px, zRef) => (px ?? 0) * zoomScale(zRef);
  const uiScaleFromZRef = (basePx, zRef) =>
  !basePx ? 1 : scalePx(basePx, zRef) / basePx;
  const unscalePx = (px, zRef) => (px ?? 0) / zoomScale(zRef);
  const MEASURE_BASE_ZOOM = 18;
const measureScale = zoomScale(MEASURE_BASE_ZOOM); // zoom out => <1, zoom in => >1
const getMeasLabelPlacement = (a, b, px = 12) => {
  const map = mapRef.current;
  const proj = map?.getProjection?.();
  if (!map || !proj) return { pos: midpointLatLng(a, b), rotateDeg: 0 };

  const z = map.getZoom?.() ?? mapView.zoom;
  const scale = Math.pow(2, z);

  const aLL = new google.maps.LatLng(a.lat, a.lng);
  const bLL = new google.maps.LatLng(b.lat, b.lng);

  const aW = proj.fromLatLngToPoint(aLL); // world coords
  const bW = proj.fromLatLngToPoint(bLL);

  // convert to pixel coords at current zoom
  const ax = aW.x * scale;
  const ay = aW.y * scale;
  const bx = bW.x * scale;
  const by = bW.y * scale;

  const dx = bx - ax;
  const dy = by - ay;

  const isHorizontal = Math.abs(dx) >= Math.abs(dy);

  const axI = Math.round(ax);
const ayI = Math.round(ay);
const bxI = Math.round(bx);
const byI = Math.round(by);

const mx = (axI + bxI) / 2;
const my = (ayI + byI) / 2;

const outX = mx;
const outY = my + (isHorizontal ? -px : 0);

  // back to world coords, then to latlng
  const outW = new google.maps.Point(outX / scale, outY / scale);
  const outLL = proj.fromPointToLatLng(outW);

  return {
    pos: { lat: outLL.lat(), lng: outLL.lng() },
    rotateDeg: isHorizontal ? -90 : 0,
  };
};
const getSmallDistanceLabelPlacement = (a, b, offsetBelowPx = 10) => {
  const map = mapRef.current;
  const proj = map?.getProjection?.();
  if (!map || !proj) return { pos: midpointLatLng(a, b) };

  const z = map.getZoom?.() ?? mapView.zoom;
  const scale = Math.pow(2, z);
  const aW = proj.fromLatLngToPoint(new google.maps.LatLng(a.lat, a.lng));
  const bW = proj.fromLatLngToPoint(new google.maps.LatLng(b.lat, b.lng));
  const mx = (aW.x + bW.x) / 2 * scale;
  const my = (aW.y + bW.y) / 2 * scale;
  const dx = (bW.x - aW.x) * scale;
  const dy = (bW.y - aW.y) * scale;
  const len = Math.hypot(dx, dy) || 1;
  let perpX = -dy / len, perpY = dx / len;
  if (perpY < 0) { perpX = -perpX; perpY = -perpY; }
  const outX = mx + perpX * offsetBelowPx;
  const outY = my + perpY * offsetBelowPx;
  const outW = new google.maps.Point(outX / scale, outY / scale);
  const outLL = proj.fromPointToLatLng(outW);
  return { pos: { lat: outLL.lat(), lng: outLL.lng() } };
};
const getMeasSegPixelLen = (a, b) => {
  const map = mapRef.current;
  const proj = map?.getProjection?.();
  if (!map || !proj) return null;

  const z = map.getZoom?.() ?? mapView.zoom;
  const scale = Math.pow(2, z);

  const aW = proj.fromLatLngToPoint(new google.maps.LatLng(a.lat, a.lng));
  const bW = proj.fromLatLngToPoint(new google.maps.LatLng(b.lat, b.lng));

  const ax = aW.x * scale, ay = aW.y * scale;
  const bx = bW.x * scale, by = bW.y * scale;

  return Math.hypot(bx - ax, by - ay);
};
const getPixelLen = (a, b) => {
  const map = mapRef.current;
  const proj = map?.getProjection?.();
  if (!map || !proj) return null;

  const z = map.getZoom?.() ?? mapView.zoom;
  const scale = Math.pow(2, z);

  const aW = proj.fromLatLngToPoint(new google.maps.LatLng(a.lat, a.lng));
  const bW = proj.fromLatLngToPoint(new google.maps.LatLng(b.lat, b.lng));

  const ax = aW.x * scale, ay = aW.y * scale;
  const bx = bW.x * scale, by = bW.y * scale;

  return Math.hypot(bx - ax, by - ay);
};
  /* ================= MENU / RIBBON ================= */
  const [activeTab, setActiveTab] = useState("View");
  const [openFileMenu, setOpenFileMenu] = useState(false);
  const fileMenuRef = useRef(null);
  // ✅ Close File menu when clicking OR right-clicking outside
useEffect(() => {
  if (!openFileMenu) return;

  const onDocMouseDown = (e) => {
    const el = fileMenuRef.current;
    if (!el) return;
    if (!el.contains(e.target)) setOpenFileMenu(false);
  };

  const onDocContextMenu = (e) => {
    const el = fileMenuRef.current;
    if (!el) return;
    // ✅ Right-click outside closes the menu
    if (!el.contains(e.target)) setOpenFileMenu(false);
  };

  const onDocKeyDown = (e) => {
    if (e.key === "Escape") setOpenFileMenu(false);
  };

  // capture=true so it still works even if map stops bubbling
  document.addEventListener("mousedown", onDocMouseDown, true);
  document.addEventListener("contextmenu", onDocContextMenu, true);
  document.addEventListener("keydown", onDocKeyDown, true);

  return () => {
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("contextmenu", onDocContextMenu, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
  };
}, [openFileMenu]);
// ================= PROJECT SAVE / OPEN (localStorage, per user) =================
function getProjectsKey() {
  try {
    const user = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    const email = (user?.email || "anonymous").replace(/[^a-zA-Z0-9@._-]/g, "_");
    return `tmp_projects_v1_${email}`;
  } catch {
    return "tmp_projects_v1_anonymous";
  }
}
const PROJECTS_KEY = getProjectsKey();

const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
const [saveAsName, setSaveAsName] = useState("");

const [openDialog, setOpenDialog] = useState(false);
const importFileInputRef = useRef(null);
const [savedProjects, setSavedProjects] = useState([]); // list from localStorage

function loadProjectsList() {
  try {
    const arr = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeProjectsList(arr) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(arr));
}

function refreshProjectsList() {
  setSavedProjects(loadProjectsList());
}

useEffect(() => {
  if (openDialog) refreshProjectsList();
}, [openDialog]);

// color like your reference (teal/blue)
const WORK_AREA_STYLE = {
  strokeColor: "#2AA6B8",
  strokeOpacity: 1,
  strokeWeight: 3,
  fillColor: "#2AA6B8",
  fillOpacity: 0.22,
};

  /* ================= Projection overlay ================= */
  const projectionOverlayRef = useRef(null);
  const [projectionReady, setProjectionReady] = useState(false);
  const connectorOverlaysRef = useRef(new Map()); // signId → SignConnectorOverlay

  // ✅ Create page frame once projection is ready
useEffect(() => {
  if (!projectionReady) return;
  if (!pageFrameBounds) initPageFrameRect();
}, [projectionReady]);

  // Load project when opening from Dashboard (must be after projectionReady is declared)
useEffect(() => {
  if (!projectionReady) return;
  try {
    const raw = localStorage.getItem("currentProjectSnapshot");
    const id = localStorage.getItem("currentProjectId");
    if (!raw || !id) return;
    const snap = JSON.parse(raw);
    if (snap && (snap.editorState || snap.mapView)) {
      applyProjectSnapshot(snap);
    }
  } finally {
    localStorage.removeItem("currentProjectId");
    localStorage.removeItem("currentProjectSnapshot");
  }
}, [projectionReady]); 

  function ensureProjectionOverlay(map) {
    if (!window.google?.maps) return;
    if (projectionOverlayRef.current) return;

    const ov = new window.google.maps.OverlayView();
    ov.onAdd = () => {};
    ov.draw = () => {};
    ov.onRemove = () => {};
    ov.setMap(map);
    projectionOverlayRef.current = ov;

    setTimeout(() => setProjectionReady(true), 0);
  }

  function getProjection() {
    return projectionOverlayRef.current?.getProjection?.() || null;
  }

  function latLngToPx(ll) {
    const proj = getProjection();
    if (!proj || !window.google?.maps) return null;
    const p = proj.fromLatLngToDivPixel(
      new window.google.maps.LatLng(ll.lat, ll.lng)
    );
    return { x: p.x, y: p.y };
  }

  function pxToLatLng(p) {
    const proj = getProjection();
    if (!proj || !window.google?.maps) return null;
    const ll = proj.fromDivPixelToLatLng(
      new window.google.maps.Point(p.x, p.y)
    );
    return { lat: ll.lat(), lng: ll.lng() };
  }
function rectFromTwoPts(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function boundsToRectPx(bounds) {
  if (!bounds) return null;
  const a = latLngToPx(bounds.nw);
  const b = latLngToPx(bounds.se);
  if (!a || !b) return null;
  return rectFromTwoPts(a, b);
}

function rectPxToBounds(rect) {
  if (!rect) return null;
  // Top-left pixel (smaller y) = NW, bottom-right (larger y) = SE
  const nw = pxToLatLng({ x: rect.x, y: rect.y });
  const se = pxToLatLng({ x: rect.x + rect.w, y: rect.y + rect.h });
  if (!nw || !se) return null;
  return { nw, se };
}

/**
 * Recompute a 4-point rectangle when dragging one corner.
 * Uses ONLY: originalGeometryAtDragStart + currentPointerPosition.
 * Opposite corner stays fixed. No use of mutated state.
 *
 * Rectangle corners 0,1,2,3. Opposite pairs: 0↔2, 1↔3.
 * When dragging corner d, fixed = (d+2)%4. Adjacents = (d±1)%4.
 * New rectangle: drag=cursor, fixed=unchanged, adj1/adj2 = (drag.lng, fixed.lat) and (fixed.lng, drag.lat).
 */
function recomputeRectangleFromCornerDrag(originalCorners, dragIdx, cursorLatLng) {
  if (!originalCorners || originalCorners.length !== 4) return null;
  const fixedIdx = (dragIdx + 2) % 4;
  const adj1Idx = (dragIdx + 1) % 4;
  const adj2Idx = (dragIdx + 3) % 4;

  const pDrag = cursorLatLng;
  const pFixed = originalCorners[fixedIdx];

  // Prevent collapse: ensure diagonal has minimum length
  const diagLng = Math.abs(pDrag.lng - pFixed.lng);
  const diagLat = Math.abs(pDrag.lat - pFixed.lat);
  if (diagLng < 1e-10 && diagLat < 1e-10) return null;

  // The two adjacent corners are (fixed.lng, drag.lat) and (drag.lng, fixed.lat).
  // For dragIdx 0 or 2: adj1=(fixed.lng,drag.lat), adj2=(drag.lng,fixed.lat)
  // For dragIdx 1 or 3: adj1=(drag.lng,fixed.lat), adj2=(fixed.lng,drag.lat)
  const cornerA = { lng: pFixed.lng, lat: pDrag.lat };
  const cornerB = { lng: pDrag.lng, lat: pFixed.lat };
  const [adj1, adj2] = (dragIdx === 0 || dragIdx === 2) ? [cornerA, cornerB] : [cornerB, cornerA];

  const nextPath = new Array(4);
  nextPath[dragIdx] = pDrag;
  nextPath[fixedIdx] = { ...pFixed };
  nextPath[adj1Idx] = adj1;
  nextPath[adj2Idx] = adj2;
  return nextPath;
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

/** Fetch Google Maps Static API image as data URL. Throws with clear 403/API errors. */
async function fetchStaticMapAsDataUrl(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Network error loading map image. Check your connection.");
  }
  if (res.status === 403) {
    const msg =
      "Google Maps Static API returned 403 (Forbidden). Common causes:\n\n" +
      "• Maps Static API is not enabled (enable it in Google Cloud Console)\n" +
      "• Billing is not enabled (Maps APIs require a billing account)\n" +
      "• API key restrictions block this request\n" +
      "• API key is invalid or revoked\n\n" +
      "Required API: Maps Static API";
    throw new Error(msg);
  }
  if (!res.ok) {
    throw new Error(`Map API error ${res.status}: ${res.statusText}`);
  }
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Failed to read map image data"));
    r.readAsDataURL(blob);
  });
}

  function clientToDivPx(clientX, clientY) {
    const map = mapRef.current;
    if (!map) return null;
    const rect = map.getDiv().getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }


  /* ================= Active tool ================= */
  const [activeTool, setActiveTool] = useState(null); // "cones" | "measurements" | "signs" | "legend" | "manifest" | "title" | null
  const isConesToolActive = activeTool === "cones";
  const isMeasToolActive = activeTool === "measurements";
  const isSignsToolActive = activeTool === "signs";
  const isTitleToolActive = activeTool === "title";
  const isNorthArrowToolActive = activeTool === "northArrow";
  const isInsertToolActive = typeof activeTool === "string" && activeTool.startsWith("insert:");
  const [workAreas, setWorkAreas] = useState([]);     // saved polygons
  const [selectedWorkAreaId, setSelectedWorkAreaId] = useState(null);
const [isDrawingWorkArea, setIsDrawingWorkArea] = useState(false);
const [workDraft, setWorkDraft] = useState([]);     // points while drawing
const [workHover, setWorkHover] = useState(null);

  /* ================= Cones tool ================= */
  const [conesPanelOpen, setConesPanelOpen] = useState(false);
  const [selectedConeType, setSelectedConeType] = useState("cone");

  const [conesIsDrawing, setConesIsDrawing] = useState(false);
  const conesVerticesRef = useRef([]);
  const [conesVerticesState, setConesVerticesState] = useState([]);
  const [conesHoverPoint, setConesHoverPoint] = useState(null);
  const [conesPreviewSamples, setConesPreviewSamples] = useState([]);
  const [conesFeatures, setConesFeatures] = useState([]); // {id,typeId,path:[latlng...]}

  /* ================= Measurements tool ================= */
  const [measPanelOpen, setMeasPanelOpen] = useState(false);
  const [measMode, setMeasMode] = useState("distance"); // "distance" | "combined"
  const [measEdit, setMeasEdit] = useState(null); // { mid: string, segIndex: number | null }
const [measEditValue, setMeasEditValue] = useState("");
const startEditMeasureLabel = (mid, segIndex, currentText) => {
  // ✅ If already editing this same label, do NOT reset the input value
  if (measEdit?.mid === mid && measEdit?.segIndex === segIndex) return;

  setMeasEdit({ mid, segIndex });
  setMeasEditValue(currentText || "");
};

const cancelEditMeasureLabel = () => {
  setMeasEdit(null);
  setMeasEditValue("");
};

const commitEditMeasureLabel = () => {
  if (!measEdit) return;

  const nextText = (measEditValue || "").trim();

  setMeasurements((prev) =>
    prev.map((m) => {
      if (m.id !== measEdit.mid) return m;

      // Distance mode: store single override
      if (measEdit.segIndex == null) {
        const next = { ...m };
        if (!nextText) {
          delete next.labelOverride;
        } else {
          next.labelOverride = nextText;
        }
        return next;
      }

      // Combined mode: store per-segment override
      const i = measEdit.segIndex;
      const next = { ...m, segOverrides: { ...(m.segOverrides || {}) } };
      if (!nextText) {
        delete next.segOverrides[i];
      } else {
        next.segOverrides[i] = nextText;
      }
      return next;
    })
  );

  cancelEditMeasureLabel();
};
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // ✅ When editing a measurement label, stop Google Map from stealing keyboard focus
  map.setOptions({
    keyboardShortcuts: !measEdit,     // disable while editing
    gestureHandling: measEdit ? "none" : "auto", // optional but helps a lot
  });
}, [measEdit]);
  const [measIsDrawing, setMeasIsDrawing] = useState(false);
  const measVerticesRef = useRef([]);
  const [measVerticesState, setMeasVerticesState] = useState([]);
  const [measHoverPoint, setMeasHoverPoint] = useState(null);
  const [measurements, setMeasurements] = useState([]); // {id, mode, path:[latlng...]}

  /* ================= Signs tool ================= */
  const [signsPanelOpen, setSignsPanelOpen] = useState(false);
  const [signSearch, setSignSearch] = useState("");
  const [showSignCodes, setShowSignCodes] = useState(false);
  const [selectedSignCode, setSelectedSignCode] = useState(
    getSignCatalog()[0]?.code ?? "C-001-1"
  );

  const [placedSigns, setPlacedSigns] = useState([]);
  const [signHoveredId, setSignHoveredId] = useState(null);

  // ── Sync custom connector overlays whenever sign/stand data changes ─────────
  // Must be after placedSigns is declared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projectionReady || !window.google?.maps?.OverlayView) return;
    const ConnectorOverlay = getConnectorOverlayClass();
    if (!ConnectorOverlay) return;
    const overlays = connectorOverlaysRef.current;
    const liveIds  = new Set();
    for (const s of placedSigns) {
      liveIds.add(s.id);
      if (!s.stands?.length) {
        if (overlays.has(s.id)) { overlays.get(s.id).setMap(null); overlays.delete(s.id); }
        continue;
      }
      if (!overlays.has(s.id)) {
        const ov = new ConnectorOverlay();
        ov.setMap(map);
        overlays.set(s.id, ov);
      }
      overlays.get(s.id).update(s);
    }
    for (const [id, ov] of overlays) {
      if (!liveIds.has(id)) { ov.setMap(null); overlays.delete(id); }
    }
  }, [placedSigns, projectionReady]);

  // Cleanup all connector overlays on unmount
  useEffect(() => () => {
    for (const ov of connectorOverlaysRef.current.values()) ov.setMap(null);
    connectorOverlaysRef.current.clear();
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  /* ================= Legend / Manifest / Title Boxes ================= */
  const [legendBoxes, setLegendBoxes] = useState([]);
  const [manifestBoxes, setManifestBoxes] = useState([]);


  const [northArrows, setNorthArrows] = useState([]); // {id, pos:{lat,lng}, wPx, hPx, rotDeg}
  const [scales, setScales] = useState([]); // {id,pos,wPx,hPx,rotDeg}
  // ================= Insert Objects =================
const [insertObjects, setInsertObjects] = useState([]);
const [editingInsertId, setEditingInsertId] = useState(null);
const [editingCell, setEditingCell] = useState(null);

const [selectedInsertId, setSelectedInsertId] = useState(null);
const [lineDraft, setLineDraft] = useState(null);
const [pictureGhostPos, setPictureGhostPos] = useState(null);
const [gridOn, setGridOn] = useState(false);

// lineDraft: { points: LatLngLiteral[], end: LatLngLiteral } — points = committed vertices, end = live cursor


  // Title box uses pixel coords relative to map div
  const [titleBoxes, setTitleBoxes] = useState([]); // {id,x,y,w,h,logoW,locked}
  const [titleBoxDataById, setTitleBoxDataById] = useState({}); // { [id]: {project,job,date,author,revision,comments,logoDataUrl,logoScale} }

  // ================= EXPORT TO PDF (Print Area + Sheet Preview) =================
const [exportMode, setExportMode] = useState(false);
// Export area bounds in lat/lng; auto-initialized from viewport when entering export mode
const [printAreaBounds, setPrintAreaBounds] = useState(null);
// During resize drag, exact pixel rect so handles don't jump (no round-trip through lat/lng)
const [exportLiveRect, setExportLiveRect] = useState(null);
// Export panel options
const [exportPaperSize, setExportPaperSize] = useState("letter");
const [exportOrientation, setExportOrientation] = useState("landscape");
const [exportIncludeTitle, setExportIncludeTitle] = useState(true);
const [exportIncludeLegend, setExportIncludeLegend] = useState(true);
const [exportIncludeNotes, setExportIncludeNotes] = useState(true);
const [exportIncludeNorthArrow, setExportIncludeNorthArrow] = useState(true);
const [exportIncludeScaleBar, setExportIncludeScaleBar] = useState(true);
const exportOverlayRef = useRef(null); // map wrapper ref
const [exportCaptureInProgress, setExportCaptureInProgress] = useState(false);
const [exportPreviewUrl, setExportPreviewUrl]       = useState(null);  // satellite preview data URL
const [exportPreviewLoading, setExportPreviewLoading] = useState(false); // true while fetching preview
const exportResizeRef = useRef(null);  // single source of truth during export resize: { handle, startClientX, startClientY, originalRect }
// Synchronous ref for Generate PDF: always holds the final export bounds (avoids stale React state)
const exportBoundsForPdfRef = useRef(null);
// Ref for export: ensures async exportSelectionToPdf always uses current plan data (avoids stale closure)
const exportPlanDataRef = useRef({});
useEffect(() => {
  exportPlanDataRef.current = {
    workAreas,
    conesFeatures,
    measurements,
    placedSigns,
    legendBoxes,
    manifestBoxes,
    titleBoxes,
    titleBoxDataById,
    northArrows,
    scales,
    insertObjects,
  };
}, [workAreas, conesFeatures, measurements, placedSigns, legendBoxes, manifestBoxes, titleBoxes, titleBoxDataById, northArrows, scales, insertObjects]);
// ================= PAGE FRAME (Permanent export boundary) =================
// ✅ page frame stored in LAT/LNG (so it sticks to the map)
const [pageFrameBounds, setPageFrameBounds] = useState(null); 
// { nw:{lat,lng}, se:{lat,lng} }

// ================= IMPORTED AERIAL LAYER (Invarion-style workflow) =================
// When user clicks "Import Aerial Photo", we fetch a Static Maps image for the current
// page frame and store it here so it can be shown on-screen and reused for export.
const [importedAerial, setImportedAerial] = useState(null);
// importedAerial: { dataUrl, imgW, imgH, center: {lat,lng}, zoom, bounds }

async function importAerialPhotoForFrame() {
  const rect = boundsToRectPx(pageFrameBounds);
  if (!rect) {
    alert("Blue export box is not ready yet. Please wait 1 second and try again.");
    return;
  }

  const map = mapRef.current;
  if (!map) {
    alert("Map not ready. Please wait a moment and try again.");
    return;
  }

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    alert("Missing VITE_GOOGLE_MAPS_API_KEY for Static Maps import.");
    return;
  }

  const zoom = map.getZoom?.() ?? 18;
  const centerPx = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const selCenter = pxToLatLng(centerPx);
  if (!selCenter) {
    alert("Map projection not ready. Wait a second and try again.");
    return;
  }

  const STATIC_MAP_MAX = 640;
  const rawW = Math.max(120, Math.round(rect.w));
  const rawH = Math.max(120, Math.round(rect.h));
  const scaleFit = Math.min(STATIC_MAP_MAX / rawW, STATIC_MAP_MAX / rawH, 1);
  const imgW = Math.max(120, Math.min(STATIC_MAP_MAX, Math.round(rawW * scaleFit)));
  const imgH = Math.max(120, Math.min(STATIC_MAP_MAX, Math.round(rawH * scaleFit)));

  const maptype = ["satellite", "hybrid", "roadmap", "terrain"].includes(mapLayer) ? mapLayer : "satellite";
  const staticUrl =
    "https://maps.googleapis.com/maps/api/staticmap" +
    `?maptype=${maptype}` +
    `&format=png` +
    `&scale=2` +
    `&size=${imgW}x${imgH}` +
    `&center=${selCenter.lat},${selCenter.lng}` +
    `&zoom=${zoom}` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const baseDataUrl = await fetchStaticMapAsDataUrl(staticUrl);
    // Touch the image once so we know it's valid
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("Failed to load imported aerial image."));
      img.src = baseDataUrl;
    });

    setImportedAerial({
      dataUrl: baseDataUrl,
      imgW,
      imgH,
      center: selCenter,
      zoom,
      bounds: pageFrameBounds,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("Import Aerial Photo failed:", err);
    const msg = err instanceof Error ? err.message : (err?.message || String(err));
    alert("Failed to import aerial photo:\n\n" + msg);
  }
}


  /* ================= Selection / Drag ================= */
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [uiDrag, setUiDrag] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, entityType, entityId, typeId }
  const [legendExclusions, setLegendExclusions] = useState(new Set()); // Set of typeId strings hidden from legend
  const [clipboard, setClipboard] = useState(null); // { kind, data }
  // Live rotation accumulator for signs (avoids stale closures + reattaching listeners)
  const rotateSignLiveRef = useRef(null); // { lastAngleDeg: number, accumulatedDeg: number } | null
  const lastPointerMoveTsRef = useRef(0);
  const lastMousePosRef = useRef({ x: 0, y: 0 }); // tracks cursor for paste-at-cursor
  // ================= SCALE SMOOTH DRAG (RAF throttle) =================
const rafScaleRef = React.useRef(null);
const pendingScaleUpdateRef = React.useRef(null);
  const workAreaResizeRafRef = React.useRef(null);
  const workAreaResizePendingRef = React.useRef(null);

function scheduleScaleUpdate(applyFn) {
  pendingScaleUpdateRef.current = applyFn;
  if (rafScaleRef.current) return;

  rafScaleRef.current = requestAnimationFrame(() => {
    rafScaleRef.current = null;
    const fn = pendingScaleUpdateRef.current;
    pendingScaleUpdateRef.current = null;
    if (fn) fn();
  });
}
  // ================= UNDO / REDO HISTORY =================
const undoStackRef = useRef([]);
const redoStackRef = useRef([]);
const isRestoringRef = useRef(false);
const MAX_HISTORY = 80;

const makeSnapshot = () => ({
  // Plan Elements
  workAreas,
  conesFeatures,
  measurements,
  placedSigns,

  // Tools / Inserts
  legendBoxes,
  manifestBoxes,
  titleBoxes,
  titleBoxDataById,
  northArrows,
  scales,
  insertObjects,

  // selection (optional but nice)
  selectedEntity,
  selectedInsertId,
  selectedWorkAreaId,
});

const applySnapshot = (s) => {
  isRestoringRef.current = true;
  try {
    setWorkAreas(s.workAreas ?? []);
    setConesFeatures(s.conesFeatures ?? []);
    setMeasurements(s.measurements ?? []);
    setPlacedSigns(s.placedSigns ?? []);

    setLegendBoxes(s.legendBoxes ?? []);
    setManifestBoxes(s.manifestBoxes ?? []);
    setTitleBoxes(s.titleBoxes ?? []);
    setTitleBoxDataById(s.titleBoxDataById ?? {});
    setNorthArrows(s.northArrows ?? []);
    setScales(s.scales ?? []);
    setInsertObjects(s.insertObjects ?? []);

    setSelectedEntity(s.selectedEntity ?? null);
    setSelectedInsertId(s.selectedInsertId ?? null);
    setSelectedWorkAreaId(s.selectedWorkAreaId ?? null);
  } finally {
    isRestoringRef.current = false;
  }
};

const pushHistory = () => {
  if (isRestoringRef.current) return;
  undoStackRef.current.push(makeSnapshot());
  if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
  redoStackRef.current = []; // new action clears redo
};

const doUndo = React.useCallback(() => {
  if (undoStackRef.current.length === 0) return;
  const current = makeSnapshot();
  const prev = undoStackRef.current.pop();
  redoStackRef.current.push(current);
  applySnapshot(prev);
}, [makeSnapshot, applySnapshot]);

const doRedo = React.useCallback(() => {
  if (redoStackRef.current.length === 0) return;
  const current = makeSnapshot();
  const next = redoStackRef.current.pop();
  undoStackRef.current.push(current);
  applySnapshot(next);
}, [makeSnapshot, applySnapshot]);
// ================= PROJECT SNAPSHOT (Save/Open) =================
function makeProjectSnapshot() {
  const map = mapRef.current;
  const c = map?.getCenter?.();
  const z = map?.getZoom?.();

  const plan = exportPlanDataRef.current;
  const es = {
    workAreas: plan.workAreas ?? [],
    conesFeatures: plan.conesFeatures ?? [],
    measurements: plan.measurements ?? [],
    placedSigns: plan.placedSigns ?? [],
    legendBoxes: plan.legendBoxes ?? [],
    manifestBoxes: plan.manifestBoxes ?? [],
    titleBoxes: plan.titleBoxes ?? [],
    titleBoxDataById: plan.titleBoxDataById ?? {},
    northArrows: plan.northArrows ?? [],
    scales: plan.scales ?? [],
    insertObjects: plan.insertObjects ?? [],
  };

  return {
    version: 1,
    savedAt: Date.now(),
    mapView: {
      center: c ? c.toJSON() : mapView.center,
      zoom: z ?? mapView.zoom,
      mapTypeId: mapLayer,
    },
    pageFrameBounds: pageFrameBounds,
    editorState: es,

  };
}

function applyProjectSnapshot(snap) {
  if (!snap) return;

  // Support both editorState and legacy top-level format
  const es = snap.editorState ?? (snap.workAreas || snap.conesFeatures || snap.legendBoxes ? {
    workAreas: snap.workAreas ?? [],
    conesFeatures: snap.conesFeatures ?? [],
    measurements: snap.measurements ?? [],
    placedSigns: snap.placedSigns ?? [],
    legendBoxes: snap.legendBoxes ?? [],
    manifestBoxes: snap.manifestBoxes ?? [],
    titleBoxes: snap.titleBoxes ?? [],
    titleBoxDataById: snap.titleBoxDataById ?? {},
    northArrows: snap.northArrows ?? [],
    scales: snap.scales ?? [],
    insertObjects: snap.insertObjects ?? [],
  } : null);
  const mv = snap.mapView;
  const pf = snap.pageFrameBounds;

  // 1) Restore drawings AND zoom together in one flushSync commit.
  //    Restoring mapView.zoom here means zoomNow is already the saved value
  //    when signs/cones first render — preventing a blurry frame at the wrong scale.
  if (es) {
    flushSync(() => {
      applySnapshot(es);
      // Restore zoom in the same synchronous commit so the first render uses
      // the correct zoom level and elements scale correctly from the start.
      if (mv?.center && typeof mv.zoom === "number") {
        setMapView({ center: mv.center, zoom: mv.zoom });
        setMapLayer(mv.mapTypeId || "roadmap");
      }
    });
    exportPlanDataRef.current = {
      workAreas: es.workAreas ?? [],
      conesFeatures: es.conesFeatures ?? [],
      measurements: es.measurements ?? [],
      placedSigns: es.placedSigns ?? [],
      legendBoxes: es.legendBoxes ?? [],
      manifestBoxes: es.manifestBoxes ?? [],
      titleBoxes: es.titleBoxes ?? [],
      titleBoxDataById: es.titleBoxDataById ?? {},
      northArrows: es.northArrows ?? [],
      scales: es.scales ?? [],
      insertObjects: es.insertObjects ?? [],
    };
  }

  // 2) Restore blue box
  if (pf?.nw && pf?.se) {
    setPageFrameBounds(pf);
  } else if (snap.pageFrameRect) {
    const b2 = rectPxToBounds(snap.pageFrameRect);
    if (b2) setPageFrameBounds(b2);
  }

  // 3) Sync the actual Google Maps instance to the restored zoom/center
  if (mv?.center && typeof mv.zoom === "number") {
    requestAnimationFrame(() => {
      const map = mapRef.current;
      if (map) {
        map.setMapTypeId?.(mv.mapTypeId || "roadmap");
        map.panTo(mv.center);
        map.setZoom(mv.zoom);
      }
    });
  }
}

const doDelete = React.useCallback(() => {
  // delete selected insert
  if (selectedInsertId) {
    pushHistory();
    setInsertObjects((prev) => prev.filter((o) => o.id !== selectedInsertId));
    setSelectedInsertId(null);
    return;
  }

  // delete selected work area
  if (selectedWorkAreaId) {
    pushHistory();
    setWorkAreas((prev) => prev.filter((w) => w.id !== selectedWorkAreaId));
    setSelectedWorkAreaId(null);
    return;
  }

  // delete “Tools / Signs / Arrow / Scale” via selectedEntity
  if (!selectedEntity) return;

  pushHistory();

  if (selectedEntity.kind === "legend") {
    setLegendBoxes((prev) => prev.filter((b) => b.id !== selectedEntity.id));
  } else if (selectedEntity.kind === "manifest") {
    setManifestBoxes((prev) => prev.filter((b) => b.id !== selectedEntity.id));
  } else if (selectedEntity.kind === "title") {
    const id = selectedEntity.id;
    setTitleBoxes((prev) => prev.filter((b) => b.id !== id));
    setTitleBoxDataById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  } else if (selectedEntity.kind === "northArrow") {
    setNorthArrows((prev) => prev.filter((x) => x.id !== selectedEntity.id));
  } else if (selectedEntity.kind === "scale") {
    setScales((prev) => prev.filter((x) => x.id !== selectedEntity.id));
  } else if (selectedEntity.kind === "sign") {
    setPlacedSigns((prev) => prev.filter((s) => s.id !== selectedEntity.id));
  }

  setSelectedEntity(null);
}, [selectedInsertId, selectedWorkAreaId, selectedEntity]);



  const clickTimerRef = useRef(null);
  const rafRef = useRef(null);
  const pendingMoveRef = useRef(null);
  const tableResizeRef = useRef(null);
  // Stand drag no longer needs extra refs; we use uiDrag + pointermove like signs
  const lastDblClickTsRef = useRef(0);
  const rotateStandGuardRef = useRef(false);


const lastTapRef = useRef({ id: null, t: 0 });

function isDoubleTap(id) {
  const now = Date.now();
  const last = lastTapRef.current;
  const ok = last.id === id && (now - last.t) < 320;
  lastTapRef.current = { id, t: now };
  return ok;
}

function promptEditInsertText(obj) {
  const next = prompt("Edit text:", obj.text || "");
  if (next === null) return;
  setInsertObjects((prev) =>
    prev.map((it) => (it.id === obj.id ? { ...it, text: next } : it))
  );
}


  /* ================= Tool open/close ================= */
  function cancelConesDrawing() {
    setConesIsDrawing(false);
    conesVerticesRef.current = [];
    setConesVerticesState([]);
    setConesHoverPoint(null);
    setConesPreviewSamples([]);
  }

  function cancelMeasDrawing() {
    setMeasIsDrawing(false);
    measVerticesRef.current = [];
    setMeasVerticesState([]);
    setMeasHoverPoint(null);
  }

  function deactivateAllTools() {
    if (conesIsDrawing) cancelConesDrawing();
    if (measIsDrawing) cancelMeasDrawing();
    setActiveTool(null);
    setConesPanelOpen(false);
    setMeasPanelOpen(false);
    setSignsPanelOpen(false);
  }
  function initExportAreaFromViewport() {
  const map = mapRef.current;
  if (!map || !getProjection()) return null;
  const div = map.getDiv?.();
  if (!div) return null;
  const rect = div.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width * 0.85));
  const h = Math.max(150, Math.round(rect.height * 0.85));
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const x = Math.round(centerX - w / 2);
  const y = Math.round(centerY - h / 2);
  return rectPxToBounds({ x, y, w, h });
}

  function beginExportToPdf() {
  if (!mapRef.current) return;
  setOpenFileMenu(false);
  setActiveTab("File");
  setExportMode(true);
  setSelectedEntity(null);
  setSelectedInsertId(null);
  setUiDrag(null);
  setPrintAreaBounds(null);
  setExportLiveRect(null);
  exportBoundsForPdfRef.current = null;
  const tryInit = () => {
    const b = initExportAreaFromViewport();
    if (b) {
      exportBoundsForPdfRef.current = b;
      setPrintAreaBounds(b);
    } else setTimeout(tryInit, 50);
  };
  requestAnimationFrame(() => {
    tryInit();
  });
}

function cancelExportToPdf() {
  setExportMode(false);
  setPrintAreaBounds(null);
  setExportLiveRect(null);
  setUiDrag(null);
  setExportCaptureInProgress(false);
  setExportPreviewUrl(null);
  setExportPreviewLoading(false);
}

async function exportViaScreenshot(selectedRectPx) {
  const el = exportOverlayRef.current;
  if (!el) return null;
  setExportCaptureInProgress(true);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const pixelRatio = window.devicePixelRatio || 1;
    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: false,
      scale: pixelRatio,
      logging: false,
    });
    const r = selectedRectPx;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, r.w);
    cropCanvas.height = Math.max(1, r.h);
    const ctx = cropCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      canvas,
      r.x * pixelRatio, r.y * pixelRatio, r.w * pixelRatio, r.h * pixelRatio,
      0, 0, r.w, r.h
    );
    return cropCanvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    setExportCaptureInProgress(false);
  }
}

/**
 * Build the aerial preview canvas using the EXACT same tiled pipeline as
 * exportSelectionToPdf.  This guarantees:
 *   • Same geographic area (no mismatch between preview and PDF)
 *   • Same zoom / same tile grid → no blur from over-scaling a single small tile
 *   • Same map layer as currently selected (roadmap / satellite / hybrid / terrain)
 *
 * The resulting full-resolution canvas is stored as a JPEG data-URL in
 * exportPreviewUrl and painted directly inside the blue box.
 */
async function loadExportPreview() {
  const bounds = exportBoundsForPdfRef.current ?? printAreaBounds;
  if (!bounds) return;

  const map = mapRef.current;
  if (!map) return;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) { alert("Missing Google Maps API key."); return; }

  setExportPreviewLoading(true);
  setExportPreviewUrl(null);

  try {
    // ── Normalise bounds ────────────────────────────────────────────────────
    const nLat = Math.max(bounds.nw.lat, bounds.se.lat);
    const sLat = Math.min(bounds.nw.lat, bounds.se.lat);
    const wLng = Math.min(bounds.nw.lng, bounds.se.lng);
    const eLng = Math.max(bounds.nw.lng, bounds.se.lng);

    // ── Web-Mercator helpers (identical to exportSelectionToPdf) ────────────
    const worldSize     = (z) => 256 * Math.pow(2, z);
    const latLngToWorld = (lat, lng, z) => {
      const s   = worldSize(z);
      const x   = ((lng + 180) / 360) * s;
      const sin = Math.sin((lat * Math.PI) / 180);
      const y   = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
      return { x, y };
    };
    const worldYToLat = (wy, z) => {
      const t   = wy / worldSize(z);
      const k   = Math.exp((0.5 - t) * 4 * Math.PI);
      const sin = (k - 1) / (k + 1);
      return (Math.asin(Math.max(-1, Math.min(1, sin))) * 180) / Math.PI;
    };

    // ── Map layer: follow the currently selected layer ──────────────────────
    const maptypeRaw = mapLayer === "hybrid_clean" ? "hybrid" : mapLayer;
    const maptype    = ["satellite", "hybrid", "roadmap", "terrain"].includes(maptypeRaw)
                       ? maptypeRaw : "satellite";

    const STATIC_MAP_MAX = 640;
    const GOOGLE_SCALE   = 2;
    const MAX_TILE_COLS  = 3;
    const MAX_TILE_ROWS  = 3;

    // ── Find highest zoom that fits in a 3×3 tile grid (same as PDF export) ─
    const mapCurrentZoom = Math.min(21, map.getZoom?.() ?? 21);
    let zoom = 1, nwWorld, seWorld, boundsPxW, boundsPxH;

    for (let z = mapCurrentZoom; z >= 1; z--) {
      const nw = latLngToWorld(nLat, wLng, z);
      const se = latLngToWorld(sLat, eLng, z);
      const w  = se.x - nw.x;
      const h  = se.y - nw.y;
      // store on every iteration so the last assignment is always valid
      zoom = z; nwWorld = nw; seWorld = se; boundsPxW = w; boundsPxH = h;
      if (Math.ceil(w / STATIC_MAP_MAX) <= MAX_TILE_COLS &&
          Math.ceil(h / STATIC_MAP_MAX) <= MAX_TILE_ROWS) break;
    }

    const imgW    = Math.max(1, Math.round(boundsPxW));
    const imgH    = Math.max(1, Math.round(boundsPxH));
    const numCols = Math.min(MAX_TILE_COLS, Math.max(1, Math.ceil(boundsPxW / STATIC_MAP_MAX)));
    const numRows = Math.min(MAX_TILE_ROWS, Math.max(1, Math.ceil(boundsPxH / STATIC_MAP_MAX)));
    const tileWorldW = boundsPxW / numCols;
    const tileWorldH = boundsPxH / numRows;
    const tileReqW   = Math.min(STATIC_MAP_MAX, Math.ceil(tileWorldW) + 4);
    const tileReqH   = Math.min(STATIC_MAP_MAX, Math.ceil(tileWorldH) + 4);

    // ── Build tile URL list ─────────────────────────────────────────────────
    const tileFetches = [];
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const cx  = nwWorld.x + (col + 0.5) * tileWorldW;
        const cy  = nwWorld.y + (row + 0.5) * tileWorldH;
        const lat = worldYToLat(cy, zoom);
        const lng = (cx / worldSize(zoom)) * 360 - 180;
        const url =
          "https://maps.googleapis.com/maps/api/staticmap" +
          `?maptype=${maptype}&format=png&scale=${GOOGLE_SCALE}` +
          `&size=${tileReqW}x${tileReqH}` +
          `&center=${lat.toFixed(7)},${lng.toFixed(7)}` +
          `&zoom=${zoom}&key=${encodeURIComponent(key)}`;
        tileFetches.push({ row, col, url });
      }
    }

    // ── Create output canvas at full tile resolution ────────────────────────
    const outW = Math.max(1, Math.round(imgW * GOOGLE_SCALE));
    const outH = Math.max(1, Math.round(imgH * GOOGLE_SCALE));
    const canvas = document.createElement("canvas");
    canvas.width  = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // ── Fetch all tiles in parallel then stitch ─────────────────────────────
    const tileResults = await Promise.all(
      tileFetches.map(({ row, col, url }) =>
        fetchStaticMapAsDataUrl(url).then(
          (dataUrl) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload  = () => resolve({ row, col, img });
            img.onerror = () => reject(new Error(`Tile (${col},${row}) failed to load`));
            img.src = dataUrl;
          })
        )
      )
    );

    for (const { row, col, img } of tileResults) {
      const srcX = Math.round(((tileReqW  - tileWorldW) / 2) * GOOGLE_SCALE);
      const srcY = Math.round(((tileReqH  - tileWorldH) / 2) * GOOGLE_SCALE);
      const srcW = Math.round(tileWorldW * GOOGLE_SCALE);
      const srcH = Math.round(tileWorldH * GOOGLE_SCALE);
      const dstX = Math.round(col * tileWorldW * GOOGLE_SCALE);
      const dstY = Math.round(row * tileWorldH * GOOGLE_SCALE);
      ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
    }

    // ── Debug ───────────────────────────────────────────────────────────────
    console.log("[Aerial Preview] NE:", nLat.toFixed(6), eLng.toFixed(6),
                "  SW:", sLat.toFixed(6), wLng.toFixed(6));
    console.log("[Aerial Preview] zoom:", zoom, "  tiles:", numCols, "×", numRows,
                "  canvas:", outW, "×", outH, "px  maptype:", maptype);

    // JPEG at high quality — smaller than PNG, loads faster in the blue-box preview
    setExportPreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
  } catch (e) {
    alert("Could not load aerial preview:\n" + (e instanceof Error ? e.message : String(e)));
  } finally {
    setExportPreviewLoading(false);
  }
}

async function runExportToPdf(selectedRectPx) {
  const dataUrl = await exportViaScreenshot(selectedRectPx);
  if (dataUrl) {
    const orient = exportOrientation === "landscape" ? "l" : "p";
    const format = ["letter", "legal", "tabloid", "a4", "a3"].includes(exportPaperSize) ? exportPaperSize : "letter";
    const pdf = new jsPDF({ orientation: orient, unit: "mm", format });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginH = 4;
    const marginV = 2;
    const frameRect = { x: marginH, y: marginV, w: pageW - marginH * 2, h: pageH - marginV * 2 };
    const imgW = selectedRectPx.w;
    const imgH = selectedRectPx.h;
    const scale = Math.min(frameRect.w / imgW, frameRect.h / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = frameRect.x + (frameRect.w - drawW) / 2;
    const offsetY = frameRect.y + (frameRect.h - drawH) / 2;
    pdf.addImage(dataUrl, "PNG", offsetX, offsetY, drawW, drawH);
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win || win.closed) pdf.save("TMP-export.pdf");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    cancelExportToPdf();
  } else {
    await exportSelectionToPdf(null, selectedRectPx);
  }
}

function resetExportAreaToViewport() {
  const viewportBounds = initExportAreaFromViewport();
  if (viewportBounds) {
    exportBoundsForPdfRef.current = viewportBounds;
    setPrintAreaBounds(viewportBounds);
    setExportLiveRect(null);
  }
}
function initPageFrameRect() {
  if (!getProjection()) {
    setTimeout(initPageFrameRect, 50);
    return;
  }
  const map = mapRef.current;
  if (!map) return;

  const center = map.getCenter?.();
  if (!center) return;

  const centerPx = latLngToPx({ lat: center.lat(), lng: center.lng() });
  if (!centerPx) return;

  const w = 600;
  const h = 450;
  const x = Math.round(centerPx.x - w / 2);
  const y = Math.round(centerPx.y - h / 2);

  const b = rectPxToBounds({ x, y, w, h });
  if (b) setPageFrameBounds(b);
}

async function exportSelectionToPdf(boundsOverride = null, rectOverride = null) {
  try {
  const map = mapRef.current;
  if (!map) {
    alert("Map not ready. Please wait a moment and try again.");
    return;
  }

  let bounds;
  let selectedRectPx;
  if (rectOverride) {
    selectedRectPx = {
      x: Math.round(rectOverride.x),
      y: Math.round(rectOverride.y),
      w: Math.round(rectOverride.w),
      h: Math.round(rectOverride.h),
    };
    // Derive bounds: use viewport interpolation when rect is fully visible (avoids projection offset issues)
    const mapBounds = map.getBounds?.();
    const div = map.getDiv?.();
    const divRect = div?.getBoundingClientRect?.();
    const r = selectedRectPx;
    const vw = divRect?.width ?? 0;
    const vh = divRect?.height ?? 0;
    const fullyVisible = mapBounds && vw > 0 && vh > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh;
    if (fullyVisible) {
      const ne = mapBounds.getNorthEast();
      const sw = mapBounds.getSouthWest();
      const leftFrac = r.x / vw;
      const topFrac = r.y / vh;
      const rightFrac = (r.x + r.w) / vw;
      const bottomFrac = (r.y + r.h) / vh;
      bounds = {
        nw: {
          lat: ne.lat() - topFrac * (ne.lat() - sw.lat()),
          lng: sw.lng() + leftFrac * (ne.lng() - sw.lng()),
        },
        se: {
          lat: ne.lat() - bottomFrac * (ne.lat() - sw.lat()),
          lng: sw.lng() + rightFrac * (ne.lng() - sw.lng()),
        },
      };
    } else {
      bounds = rectPxToBounds(selectedRectPx);
    }
    if (!bounds) {
      alert("Export area is not ready. Could not convert selection to map coordinates.");
      return;
    }
  } else {
    bounds = boundsOverride ?? exportBoundsForPdfRef.current ?? printAreaBounds ?? pageFrameBounds;
    selectedRectPx = bounds ? boundsToRectPx(bounds) : null;
    if (!selectedRectPx || !bounds) {
      alert("Export area is not ready. Please wait a moment and try again.");
      return;
    }
  }

  // Normalize bounds: ensure nw.lat >= se.lat and nw.lng <= se.lng for Static API consistency
  const nwLat = Math.max(bounds.nw.lat, bounds.se.lat);
  const seLat = Math.min(bounds.nw.lat, bounds.se.lat);
  const nwLng = Math.min(bounds.nw.lng, bounds.se.lng);
  const seLng = Math.max(bounds.nw.lng, bounds.se.lng);
  bounds = { nw: { lat: nwLat, lng: nwLng }, se: { lat: seLat, lng: seLng } };

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    alert("Missing VITE_GOOGLE_MAPS_API_KEY for Static Maps export.");
    return;
  }

  // Use ref so export always has current plan data (avoids stale closure during async)
  const plan = exportPlanDataRef.current;
  const workAreas = plan.workAreas ?? [];
  const conesFeatures = plan.conesFeatures ?? [];
  const measurements = plan.measurements ?? [];
  const placedSigns = plan.placedSigns ?? [];
  const legendBoxes = plan.legendBoxes ?? [];
  const manifestBoxes = plan.manifestBoxes ?? [];
  const titleBoxes = plan.titleBoxes ?? [];
  const titleBoxDataById = plan.titleBoxDataById ?? {};
  const northArrows = plan.northArrows ?? [];
  const scales = plan.scales ?? [];
  const insertObjects = plan.insertObjects ?? [];

  // Web Mercator: compute pixel dimensions of selected bounds at each zoom
  const worldSize = (z) => 256 * Math.pow(2, z);
  const latLngToWorldPx = (lat, lng, z) => {
    const s = worldSize(z);
    const x = ((lng + 180) / 360) * s;
    const sin = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
    return { x, y };
  };

  const STATIC_MAP_MAX = 640;
  const GOOGLE_SCALE = 2;

  // ── Tiled high-resolution map fetch ──────────────────────────────────────────
  // Instead of dropping zoom until the whole area fits in one 640px tile, we keep
  // the HIGHEST zoom and fetch a grid of up to 3×3 tiles in parallel.
  // Each tile: 640×640 CSS px → 1280×1280 real px (scale=2).
  // 3×3 grid → up to 3840×3840 px canvas — far sharper than the old single tile.
  const MAX_TILE_COLS = 3;
  const MAX_TILE_ROWS = 3;

  const worldYToLat = (worldY, z) => {
    const s = worldSize(z);
    const t = worldY / s;
    const k = Math.exp((0.5 - t) * 4 * Math.PI);
    const sin = (k - 1) / (k + 1);
    return (Math.asin(Math.max(-1, Math.min(1, sin))) * 180) / Math.PI;
  };

  // Start from the current map zoom for maximum satellite detail.
  const mapCurrentZoom = Math.min(21, map.getZoom?.() ?? 21);
  let zoom = mapCurrentZoom;
  let nwWorld, seWorld, boundsPxW, boundsPxH;

  for (let z = mapCurrentZoom; z >= 1; z--) {
    const nw = latLngToWorldPx(bounds.nw.lat, bounds.nw.lng, z);
    const se = latLngToWorldPx(bounds.se.lat, bounds.se.lng, z);
    const w = Math.abs(se.x - nw.x);
    const h = Math.abs(se.y - nw.y);
    if (Math.ceil(w / STATIC_MAP_MAX) <= MAX_TILE_COLS &&
        Math.ceil(h / STATIC_MAP_MAX) <= MAX_TILE_ROWS) {
      zoom = z; nwWorld = nw; seWorld = se; boundsPxW = w; boundsPxH = h;
      break;
    }
    zoom = z; nwWorld = nw; seWorld = se; boundsPxW = w; boundsPxH = h;
  }

  const imgW = Math.max(1, Math.round(boundsPxW));
  const imgH = Math.max(1, Math.round(boundsPxH));

  const numCols = Math.min(MAX_TILE_COLS, Math.max(1, Math.ceil(boundsPxW / STATIC_MAP_MAX)));
  const numRows = Math.min(MAX_TILE_ROWS, Math.max(1, Math.ceil(boundsPxH / STATIC_MAP_MAX)));

  // World-pixel dimensions of each tile slot
  const tileWorldW = boundsPxW / numCols;
  const tileWorldH = boundsPxH / numRows;

  // CSS-px request size per tile (slight over-fetch so center-crop eliminates edge drift)
  const tileReqW = Math.min(STATIC_MAP_MAX, Math.ceil(tileWorldW) + 4);
  const tileReqH = Math.min(STATIC_MAP_MAX, Math.ceil(tileWorldH) + 4);

  const toPlainLL = (p) => {
    if (!p) return null;
    if (typeof p.lat === "function" && typeof p.lng === "function") return { lat: p.lat(), lng: p.lng() };
    if (typeof p.lat === "number" && typeof p.lng === "number") return { lat: p.lat, lng: p.lng };
    if (typeof p.latitude === "number" && typeof p.longitude === "number") return { lat: p.latitude, lng: p.longitude };
    if (Array.isArray(p) && p.length >= 2) return { lat: p[1], lng: p[0] };
    return null;
  };

  const project = (p) => {
    const ll = toPlainLL(p);
    if (!ll) return null;
    const wp = latLngToWorldPx(ll.lat, ll.lng, zoom);
    const fracX = (seWorld.x - nwWorld.x) !== 0 ? (wp.x - nwWorld.x) / (seWorld.x - nwWorld.x) : 0.5;
    const fracY = (seWorld.y - nwWorld.y) !== 0 ? (wp.y - nwWorld.y) / (seWorld.y - nwWorld.y) : 0.5;
    const px = { x: fracX * imgW, y: fracY * imgH };
    if (!Number.isFinite(px.x) || !Number.isFinite(px.y)) return null;
    return px;
  };

  const maptypeRaw = mapLayer === "hybrid_clean" ? "hybrid" : mapLayer;
  const maptype = ["satellite", "hybrid", "roadmap", "terrain"].includes(maptypeRaw) ? maptypeRaw : "roadmap";

  // Build one URL per tile, centred on its geographic midpoint
  const tileFetches = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cx = nwWorld.x + (col + 0.5) * tileWorldW;
      const cy = nwWorld.y + (row + 0.5) * tileWorldH;
      const lat = worldYToLat(cy, zoom);
      const lng = (cx / worldSize(zoom)) * 360 - 180;
      const url =
        "https://maps.googleapis.com/maps/api/staticmap" +
        `?maptype=${maptype}&format=png&scale=${GOOGLE_SCALE}` +
        `&size=${tileReqW}x${tileReqH}` +
        `&center=${lat.toFixed(7)},${lng.toFixed(7)}` +
        `&zoom=${zoom}&key=${encodeURIComponent(key)}`;
      tileFetches.push({ row, col, url });
    }
  }

  // Output canvas: imgW × imgH world-px, each rendered at GOOGLE_SCALE real px
  const outW = Math.max(1, Math.round(imgW * GOOGLE_SCALE));
  const outH = Math.max(1, Math.round(imgH * GOOGLE_SCALE));

  const canvas = document.createElement("canvas");
  canvas.width  = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = "high";

  // Fetch all tiles in parallel then stitch them onto the canvas
  try {
    const tileResults = await Promise.all(
      tileFetches.map(({ row, col, url }) =>
        fetchStaticMapAsDataUrl(url).then(
          (dataUrl) =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload  = () => resolve({ row, col, img });
              img.onerror = () => reject(new Error(`Map tile (${col},${row}) failed to load`));
              img.src = dataUrl;
            })
        )
      )
    );

    for (const { row, col, img } of tileResults) {
      // Center-crop: the over-fetched pixels on each side = (tileReqW - tileWorldW) / 2
      const srcX = Math.round(((tileReqW  - tileWorldW) / 2) * GOOGLE_SCALE);
      const srcY = Math.round(((tileReqH  - tileWorldH) / 2) * GOOGLE_SCALE);
      const srcW = Math.round(tileWorldW * GOOGLE_SCALE);
      const srcH = Math.round(tileWorldH * GOOGLE_SCALE);
      const dstX = Math.round(col * tileWorldW * GOOGLE_SCALE);
      const dstY = Math.round(row * tileWorldH * GOOGLE_SCALE);
      ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    alert("Export failed — could not load map image:\n\n" + msg + "\n\nFix the issue and try again. Do not export without a proper map.");
    cancelExportToPdf();
    return;
  }

  // Subtle white wash so overlays read cleanly over the aerial imagery
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, outW, outH);

  // scaleToCanvas maps project() world-px coords → canvas px coords
  const scaleToCanvas = outW / imgW; // = GOOGLE_SCALE = 2
  const scaleFactor = 1;
  // Use map's current zoom for overlay sizing so exported elements match what user sees
  const editorZoom = map.getZoom?.() ?? zoom;
  const zoomScaleExport = (zRef) => Math.pow(2, editorZoom - (zRef ?? 18));
  const toCanvas = (px) => px && { x: px.x * scaleToCanvas, y: px.y * scaleToCanvas };
  const IN_BOUNDS_TOLERANCE = 8;
  const inBounds = (px) => px && px.x >= -IN_BOUNDS_TOLERANCE && px.x <= imgW + IN_BOUNDS_TOLERANCE && px.y >= -IN_BOUNDS_TOLERANCE && px.y <= imgH + IN_BOUNDS_TOLERANCE;

  const drawLine = (pts, color, lineWidth) => {
    const c = pts.map(toCanvas).filter(Boolean);
    if (c.length < 2) return;
    ctx.strokeStyle = color || "#111111";
    ctx.lineWidth = lineWidth ?? 2;
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.stroke();
  };

  const drawPolygon = (pts, strokeColor, fillColor, lineWidth) => {
    const c = pts.map(toCanvas).filter(Boolean);
    if (c.length < 3) return;
    ctx.strokeStyle = strokeColor || "#111111";
    ctx.lineWidth = lineWidth ?? 2;
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    ctx.stroke();
  };

  // Work areas (green fill + stroke) – match editor #00c853
  for (const wa of workAreas || []) {
    const pts = (wa?.path || []).map(project).filter(Boolean);
    if (pts.length >= 3) drawPolygon(pts, "#00c853", "rgba(0,200,83,0.12)", 2.5);
  }

  // Measurements: line + distance label
  const drawLabel = (centerPx, text) => {
    if (!centerPx || !text) return;
    const c = toCanvas(centerPx);
    const relaxedTol = 24;
    if (c.x < -relaxedTol || c.x > outW + relaxedTol || c.y < -relaxedTol || c.y > outH + relaxedTol) return;
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#111";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(text, c.x, c.y);
    ctx.fillText(text, c.x, c.y);
  };
  for (const m of measurements || []) {
    const path = m?.path || [];
    const pts = path.map(project).filter(Boolean);
    if (pts.length >= 2) drawLine(pts, "#111111", 2);
    if (m.mode === "distance" && path.length >= 2) {
      const a = toPlainLL(path[0]);
      const b = toPlainLL(path[path.length - 1]);
      if (a && b) {
        const d = distMetersLL(a, b);
        if (d >= 0.1) {
          const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
          const labelPos = project(mid);
          const text = m.labelOverride ?? formatMeters(d);
          drawLabel(labelPos, text);
        }
      }
    }
    if (m.mode === "combined" && path.length >= 2) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = toPlainLL(path[i]);
        const b = toPlainLL(path[i + 1]);
        if (!a || !b) continue;
        const d = distMetersLL(a, b);
        if (d < 0.1) continue;
        const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        const labelPos = project(mid);
        const text = (m.segOverrides && m.segOverrides[i]) ?? formatMeters(d);
        drawLabel(labelPos, text);
      }
    }
  }

  // Cones / barriers / ped_tape: line + triangle markers for cones
  const drawConeTriangle = (centerPx, size = 8) => {
    const c = toCanvas(centerPx);
    if (!c) return;
    const s = size * scaleToCanvas;
    ctx.fillStyle = "#F59E0B";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - s / 2);
    ctx.lineTo(c.x + s / 4, c.y + s / 2);
    ctx.lineTo(c.x - s / 4, c.y + s / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  const drawDotCircle = (centerPx, size, fillColor = "#F59E0B") => {
    const c = toCanvas(centerPx);
    if (!c) return;
    const r = (size * scaleToCanvas) / 2;
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const drawBarricade = (centerPx, size = 10) => {
    const c = toCanvas(centerPx);
    if (!c) return;
    const s = size * scaleToCanvas;
    const w = s * 0.6;
    const h = s * 0.35;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(c.x - w / 2, c.y - h / 2, w, h, 2) ?? ctx.rect(c.x - w / 2, c.y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = Math.max(1, 2 * scaleToCanvas * 0.3);
    ctx.beginPath();
    ctx.moveTo(c.x - w / 2 + w * 0.15, c.y - h / 2 + h * 0.3);
    ctx.lineTo(c.x - w / 2 + w * 0.5, c.y - h / 2 + h * 0.1);
    ctx.moveTo(c.x - w / 2 + w * 0.35, c.y);
    ctx.lineTo(c.x - w / 2 + w * 0.85, c.y - h / 2 + h * 0.5);
    ctx.moveTo(c.x - w / 2 + w * 0.1, c.y + h / 2 - h * 0.2);
    ctx.lineTo(c.x - w / 2 + w * 0.75, c.y - h / 2 + h * 0.7);
    ctx.stroke();
  };
  for (const f of conesFeatures || []) {
    const path = f?.path || [];
    const verts = path.map(project).filter(Boolean);
    if (verts.length < 2) continue;
    if (f.typeId === "barrier") drawLine(verts, "#9CA3AF", 2.5);
    else if (f.typeId === "ped_tape") drawLine(verts, "#DC2626", 2.5);
    else {
      drawLine(verts, "#111111", 1.5);
      const markers = sampleConesMarkersForPath(
        path.map((p) => toPlainLL(p)).filter(Boolean),
        f.typeId
      );
      for (const pos of markers) {
        const px = project(pos);
        if (!px || !inBounds(px)) continue;
        if (f.typeId === "barrel") drawDotCircle(px, 8, "#F97316");
        else if (f.typeId === "bollard") drawDotCircle(px, 5, "#374151");
        else if (f.typeId === "type1" || f.typeId === "type2") drawBarricade(px, 9);
        else drawConeTriangle(px, 7);
      }
    }
  }

  // Placed signs: load images and draw with rotation; fallback to placeholder on load failure
  const loadSignImage = (url) => {
    if (!url || typeof url !== "string") return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };
  const signImages = await Promise.all((placedSigns || []).map((s) => loadSignImage(s?.src)));
  for (let i = 0; i < (placedSigns || []).length; i++) {
    const s = placedSigns[i];
    const p = project(s?.pos);
    if (!inBounds(p)) continue;
    const sc = toCanvas(p);
    const zRef = s?.zRef ?? 18;
    const w = (s?.wPx || 64) * zoomScaleExport(zRef) * scaleFactor * scaleToCanvas * 0.5;
    const h = (s?.hPx || 64) * zoomScaleExport(zRef) * scaleFactor * scaleToCanvas * 0.5;
    const rotDeg = s?.rotDeg ?? s?.rotationDeg ?? 0;
    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    const img = signImages[i];
    if (img) {
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, w, h);
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SIGN", w / 2, h / 2 + 4);
    }
    ctx.restore();
  }

  // Stand connector lines (dashed)
  for (const s of placedSigns || []) {
    for (const st of s?.stands || []) {
      const p1 = project(s.pos);
      const p2 = project(st?.pos);
      if (!inBounds(p1) || !inBounds(p2)) continue;
      const c1 = toCanvas(p1);
      const c2 = toCanvas(p2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#666666";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Insert objects (text, rect, table, picture) – skip line (drawn separately)
  const loadInsertImage = (url) => {
    if (!url || typeof url !== "string") return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };
  const pictureInserts = (insertObjects || []).filter((o) => (o.kind === "picture" || o.kind === "rect") && o.src);
  const pictureImages = await Promise.all(pictureInserts.map((o) => loadInsertImage(o.src)));
  const pictureByIndex = new Map(pictureInserts.map((o, i) => [o.id, pictureImages[i]]));
  for (const obj of insertObjects || []) {
    if (obj.kind === "line") continue;
    const pos = obj.pos || obj.position;
    if (!pos) continue;
    const p = project(pos);
    if (!inBounds(p)) continue;
    const sc = toCanvas(p);
    const zRef = obj.zRef ?? 18;
    const w = (obj.wPx || 100) * zoomScaleExport(zRef) * scaleFactor * scaleToCanvas * 0.5;
    const h = (obj.hPx || 60) * zoomScaleExport(zRef) * scaleFactor * scaleToCanvas * 0.5;
    const rotDeg = obj.rotDeg ?? obj.rotationDeg ?? 0;
    const left = 0;
    const top = 0;
    const fontSize = Math.max(8, obj.fontSize ?? 11);
    const fontFamily = obj.fontFamily || "Arial, sans-serif";
    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "#FFFFFF";
    if (obj.kind === "table") {
      const rows = obj.rows ?? (obj.rowHeights?.length ?? obj.cells?.length ?? 2);
      const cols = obj.cols ?? (obj.colWidths?.length ?? obj.cells?.[0]?.length ?? 2);
      const rowHeights = Array.from({ length: rows }, (_, i) => obj.rowHeights?.[i] ?? 60);
      const colWidths = Array.from({ length: cols }, (_, i) => obj.colWidths?.[i] ?? 120);
      const sumRow = rowHeights.reduce((a, b) => a + b, 0) || 1;
      const sumCol = colWidths.reduce((a, b) => a + b, 0) || 1;
      const cells = obj.cells ?? Array.from({ length: rows }, () => Array(cols).fill(""));
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      const xPos = [left];
      for (let c = 0; c < cols; c++) xPos.push(xPos[xPos.length - 1] + (colWidths[c] ?? 120) / sumCol * w);
      const yPos = [top];
      for (let r = 0; r < rows; r++) yPos.push(yPos[yPos.length - 1] + (rowHeights[r] ?? 60) / sumRow * h);
      for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(xPos[i], top);
        ctx.lineTo(xPos[i], top + h);
        ctx.stroke();
      }
      for (let i = 1; i < rows; i++) {
        ctx.beginPath();
        ctx.moveTo(left, yPos[i]);
        ctx.lineTo(left + w, yPos[i]);
        ctx.stroke();
      }
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = "#111";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const getCellText = (cels, r, c) => {
        if (Array.isArray(cels) && cels[r]) return cels[r][c] ?? "";
        if (cels && typeof cels === "object") return cels[`${r}-${c}`] ?? "";
        return "";
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cellText = String(getCellText(cells, r, c) || "").slice(0, 40);
          ctx.fillText(cellText, xPos[c] + 4, yPos[r] + 4);
        }
      }
    } else if ((obj.kind === "picture" || obj.kind === "rect") && obj.src) {
      const img = pictureByIndex.get(obj.id);
      if (img) {
        ctx.drawImage(img, 0, 0, w, h);
      }
      ctx.strokeRect(0, 0, w, h);
    } else {
      ctx.strokeRect(0, 0, w, h);
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = "#111";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const text = obj.text || (obj.cells?.flat?.()?.join?.(" ")) || "";
      ctx.fillText(String(text).slice(0, 80), 4, 4);
    }
    ctx.restore();
  }

  // Line insert objects
  for (const obj of (insertObjects || []).filter((o) => o.kind === "line")) {
    const path = obj?.path || [];
    const pts = path.map(project).filter(Boolean);
    if (pts.length >= 2) drawLine(pts, obj.stroke || "#111111", obj.strokeWidth ?? 2);
  }

  // Legend / Manifest / Title / North / Scale (if enabled)
  if (exportIncludeLegend) {
    for (const lb of legendBoxes || []) {
      const p = project(lb?.pos);
      if (!inBounds(p)) continue;
      const sc = toCanvas(p);
      const w = (lb.wPx || 180) * zoomScaleExport(lb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const h = (lb.hPx || 100) * zoomScaleExport(lb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const left = sc.x - w / 2;
      const top = sc.y - h / 2;
      ctx.strokeStyle = "#111111";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#111";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Legend", left + 4, top + 4);
      ctx.font = "10px sans-serif";
      ctx.fillText("(legend items later)", left + 4, top + 22);
    }
  }
  if (exportIncludeNotes) {
    const EXPORT_CONE_LABEL = { barrel: "Barrel", barrier: "Barrier", bollard: "Bollard", cone: "Cone", ped_tape: "Pedestrian Tape", type1: "Type 1 Barricade", type2: "Type 2 Barricade" };
    const exportManifestRows = () => {
      const rows = [];
      const signCounts = {};
      for (const s of placedSigns || []) signCounts[s.code] = (signCounts[s.code] || 0) + 1;
      const coneCounts = {};
      for (const f of conesFeatures || []) {
        if (f.typeId === "barrier" || f.typeId === "ped_tape") {
          coneCounts[f.typeId] = (coneCounts[f.typeId] || 0) + 1;
        } else {
          const path = (f.path || []).map(toPlainLL).filter(Boolean);
          const spacingM = path.length >= 2 ? getConeSpacingMeters(f.typeId) : 999;
          const markers = resamplePolylineMetersLL(path, spacingM);
          coneCounts[f.typeId] = (coneCounts[f.typeId] || 0) + markers.length;
        }
      }
      Object.keys(coneCounts).forEach((k) => rows.push({ label: EXPORT_CONE_LABEL[k] || k, count: coneCounts[k] }));
      Object.keys(signCounts).forEach((code) => rows.push({ label: code, count: signCounts[code] }));
      return rows.filter((r) => r.count > 0);
    };
    const manifestRows = exportManifestRows();
    for (const mb of manifestBoxes || []) {
      const p = project(mb?.pos);
      if (!inBounds(p)) continue;
      const sc = toCanvas(p);
      const w = (mb.wPx || 200) * zoomScaleExport(mb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const h = (mb.hPx || 120) * zoomScaleExport(mb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const left = sc.x - w / 2;
      const top = sc.y - h / 2;
      ctx.strokeStyle = "#111111";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#111";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Manifest", left + 4, top + 4);
      if (manifestRows.length > 0) {
        ctx.font = "10px sans-serif";
        manifestRows.forEach((r, i) => {
          ctx.fillText(`${r.count} x ${r.label}`, left + 8, top + 22 + i * 14);
        });
      } else {
        ctx.font = "10px sans-serif";
        ctx.fillText("(no items yet)", left + 8, top + 22);
      }
    }
  }
  if (exportIncludeTitle) {
    for (const tb of titleBoxes || []) {
      const p = project(tb?.pos);
      if (!inBounds(p)) continue;
      const sc = toCanvas(p);
      const w = (tb.wPx || 360) * zoomScaleExport(tb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const h = (tb.hPx || 120) * zoomScaleExport(tb.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const data = titleBoxDataById?.[tb.id] || {};
      ctx.strokeStyle = "#111111";
      ctx.strokeRect(sc.x - w / 2, sc.y - h / 2, w, h);
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#111";
      ["Project", "Job", "Date"].forEach((label, i) => {
        const val = data[label.toLowerCase()] || label;
        ctx.fillText(String(val).slice(0, 40), sc.x - w / 2 + 8, sc.y - h / 2 + 18 + i * 14);
      });
    }
  }
  if (exportIncludeNorthArrow) {
    for (const na of northArrows || []) {
      const p = project(na?.pos);
      if (!inBounds(p)) continue;
      const sc = toCanvas(p);
      const size = (na.wPx || 70) * zoomScaleExport(na.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.moveTo(sc.x, sc.y - size / 2);
      ctx.lineTo(sc.x + size / 4, sc.y + size / 2);
      ctx.lineTo(sc.x - size / 4, sc.y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if (exportIncludeScaleBar) {
    for (const sc of scales || []) {
      const p = project(sc?.pos);
      if (!inBounds(p)) continue;
      const c = toCanvas(p);
      const w = (sc.wPx || 120) * zoomScaleExport(sc.zRef ?? 18) * scaleFactor * scaleToCanvas * 0.5;
      const h = 20;
      ctx.strokeStyle = "#111111";
      ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#111";
      ctx.textAlign = "left";
      ctx.fillText("Scale", c.x - w / 2 + 4, c.y + 4);
    }
  }

  function getMapFrameRect(pageW, pageH) {
    const marginH = 4; // mm left/right
    const marginV = 2; // mm top/bottom (smaller to reduce upper/lower white space)
    return {
      x: marginH,
      y: marginV,
      w: pageW - marginH * 2,
      h: pageH - marginV * 2,
    };
  }

  function projectLatLngToExportPx(p) {
    return project(p);
  }

  function projectExportPxToPdf(pt, frameRect) {
    // Map export image pixels (0..imgW, 0..imgH) into the inner map frame on the PDF page
    const nx = pt.x / imgW;
    const ny = pt.y / imgH;
    return {
      x: frameRect.x + nx * frameRect.w,
      y: frameRect.y + ny * frameRect.h,
    };
  }

  function buildExportScene(frameRect) {
    return {
      frameRect,
      imgW,
      imgH,
      projectLatLngToExportPx,
      projectExportPxToPdf,
    };
  }

  function drawPdfPageBackground(pdfDoc, pageW, pageH) {
    pdfDoc.setFillColor(255, 255, 255);
    pdfDoc.rect(0, 0, pageW, pageH, "F");
  }

  function drawPdfMapFrame(pdfDoc, frameRect) {
    pdfDoc.setDrawColor(0, 0, 0);
    pdfDoc.setLineWidth(1.5);
    pdfDoc.rect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
  }

  function drawPdfAerialBase(pdfDoc, baseDataUrl, frameRect) {
    pdfDoc.addImage(baseDataUrl, "PNG", frameRect.x, frameRect.y, frameRect.w, frameRect.h, undefined, "NONE");
  }

  function drawPdfPolyline(pdfDoc, pointsPx, frameRect, options = {}) {
    const { color = "#111111", width = 0.8 } = options;
    const pts = (pointsPx || [])
      .filter(Boolean)
      .map((pt) => projectExportPxToPdf(pt, frameRect));
    if (pts.length < 2) return;
    const hex = String(color || "#000000").replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    pdfDoc.setDrawColor(r, g, b);
    pdfDoc.setLineWidth(width);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const bPt = pts[i + 1];
      pdfDoc.line(a.x, a.y, bPt.x, bPt.y);
    }
  }

  function drawPdfPolygon(pdfDoc, pointsPx, frameRect, options = {}) {
    const { strokeColor = "#111111", strokeWidth = 0.8 } = options;
    const pts = (pointsPx || [])
      .filter(Boolean)
      .map((pt) => projectExportPxToPdf(pt, frameRect));
    if (pts.length < 3) return;
    const hex = String(strokeColor || "#000000").replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    pdfDoc.setDrawColor(r, g, b);
    pdfDoc.setLineWidth(strokeWidth);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const bPt = pts[(i + 1) % pts.length];
      pdfDoc.line(a.x, a.y, bPt.x, bPt.y);
    }
  }

  function drawPdfTextBox(pdfDoc, text, centerPx, boxPx, frameRect, options = {}) {
    if (!centerPx || !boxPx) return;
    const {
      fontSize = 9,
      padding = 4,
      strokeColor = "#111111",
      fillColor = "#FFFFFF",
      align = "left",
    } = options;
    const c = projectExportPxToPdf(centerPx, frameRect);
    const w = (boxPx.w / imgW) * frameRect.w;
    const h = (boxPx.h / imgH) * frameRect.h;
    const hexStroke = String(strokeColor || "#000000").replace("#", "");
    const sr = parseInt(hexStroke.slice(0, 2), 16) || 0;
    const sg = parseInt(hexStroke.slice(2, 4), 16) || 0;
    const sb = parseInt(hexStroke.slice(4, 6), 16) || 0;
    pdfDoc.setDrawColor(sr, sg, sb);
    if (fillColor) {
      const hexFill = String(fillColor).replace("#", "");
      const fr = parseInt(hexFill.slice(0, 2), 16) || 255;
      const fg = parseInt(hexFill.slice(2, 4), 16) || 255;
      const fb = parseInt(hexFill.slice(4, 6), 16) || 255;
      pdfDoc.setFillColor(fr, fg, fb);
      pdfDoc.rect(c.x - w / 2, c.y - h / 2, w, h, "FD");
    } else {
      pdfDoc.rect(c.x - w / 2, c.y - h / 2, w, h);
    }
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(fontSize);
    pdfDoc.setTextColor(0, 0, 0);
    const textX = align === "center" ? c.x : c.x - w / 2 + padding;
    const textY = c.y;
    pdfDoc.text(String(text || ""), textX, textY, { baseline: "middle" });
  }

  function drawPdfVectorOverlay(pdfDoc, scene) {
    const { frameRect } = scene;
    const inExport = (p) => p && p.x >= 0 && p.x <= imgW && p.y >= 0 && p.y <= imgH;

    const projectPoint = (ll) => projectLatLngToExportPx(ll);

    // Work areas: vector polygon outlines
    for (const wa of workAreas || []) {
      const pts = (wa?.path || []).map(projectPoint).filter(Boolean);
      if (pts.length >= 3) {
        drawPdfPolygon(pdfDoc, pts, frameRect, { strokeColor: "#16A34A", strokeWidth: 0.8 });
      }
    }

    // Measurements: crisp vector lines
    for (const m of measurements || []) {
      const pts = (m?.path || []).map(projectPoint).filter(Boolean);
      if (pts.length >= 2) {
        drawPdfPolyline(pdfDoc, pts, frameRect, { color: "#111111", width: 0.9 });
      }
    }

    // Cones / barriers / ped_tape: centerlines as vectors
    for (const f of conesFeatures || []) {
      const verts = (f?.path || []).map(projectPoint).filter(Boolean);
      if (verts.length < 2) continue;
      if (f.typeId === "barrier") {
        drawPdfPolyline(pdfDoc, verts, frameRect, { color: "#9CA3AF", width: 1.2 });
      } else if (f.typeId === "ped_tape") {
        drawPdfPolyline(pdfDoc, verts, frameRect, { color: "#DC2626", width: 1.2 });
      } else {
        drawPdfPolyline(pdfDoc, verts, frameRect, { color: "#111111", width: 0.9 });
      }
    }

    // TODO: cone symbols could be drawn here as repeated vector markers along verts

    // Legend boxes (if enabled)
    if (exportIncludeLegend) {
    for (const lb of legendBoxes || []) {
      const p = projectPoint(lb?.pos);
      if (!inExport(p)) continue;
      const w = (lb.wPx || 180) * zoomScale(lb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const h = (lb.hPx || 100) * zoomScale(lb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      drawPdfTextBox(
        pdfDoc,
        "Legend",
        p,
        { w, h },
        frameRect,
        { fontSize: 9, align: "left", strokeColor: "#111111", fillColor: "#FFFFFF" }
      );
    }
    }

    if (exportIncludeNotes) {
    for (const mb of manifestBoxes || []) {
      const p = projectPoint(mb?.pos);
      if (!inExport(p)) continue;
      const w = (mb.wPx || 200) * zoomScale(mb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const h = (mb.hPx || 120) * zoomScale(mb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      drawPdfTextBox(
        pdfDoc,
        "Manifest",
        p,
        { w, h },
        frameRect,
        { fontSize: 9, align: "left", strokeColor: "#111111", fillColor: "#FFFFFF" }
      );
    }
    }

    // Title boxes (if enabled)
    if (exportIncludeTitle) {
    for (const tb of titleBoxes || []) {
      const p = projectPoint(tb?.pos);
      if (!inExport(p)) continue;
      const w = (tb.wPx || 360) * zoomScale(tb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const h = (tb.hPx || 120) * zoomScale(tb.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const data = titleBoxDataById?.[tb.id] || {};
      const c = projectExportPxToPdf(p, frameRect);
      const bw = (w / imgW) * frameRect.w;
      const bh = (h / imgH) * frameRect.h;
      pdfDoc.setDrawColor(0, 0, 0);
      pdfDoc.setLineWidth(0.8);
      pdfDoc.rect(c.x - bw / 2, c.y - bh / 2, bw, bh);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(9);
      pdfDoc.setTextColor(0, 0, 0);
      const lines = [data.project || "Project", data.job || "Job", data.date || "Date"].filter(Boolean);
      lines.forEach((line, i) => {
        const tx = c.x - bw / 2 + 6;
        const ty = c.y - bh / 2 + 10 + i * 10;
        pdfDoc.text(String(line), tx, ty);
      });
      // TODO: logo / comments could be added here
    }
    }

    // North arrows (if enabled)
    if (exportIncludeNorthArrow) {
    for (const na of northArrows || []) {
      const p = projectPoint(na?.pos);
      if (!inExport(p)) continue;
      const size = (na.wPx || 70) * zoomScale(na.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const c = projectExportPxToPdf(p, frameRect);
      const s = (size / imgW) * frameRect.w;
      pdfDoc.setDrawColor(0, 0, 0);
      pdfDoc.setFillColor(0, 0, 0);
      pdfDoc.setLineWidth(0.5);
      pdfDoc.line(c.x, c.y - s / 2, c.x + s / 4, c.y + s / 2);
      pdfDoc.line(c.x + s / 4, c.y + s / 2, c.x - s / 4, c.y + s / 2);
      pdfDoc.line(c.x - s / 4, c.y + s / 2, c.x, c.y - s / 2);
    }
    }

    // Scale bars (if enabled)
    if (exportIncludeScaleBar) {
    for (const sc of scales || []) {
      const p = projectPoint(sc?.pos);
      if (!inExport(p)) continue;
      const w = (sc.wPx || 120) * zoomScale(sc.zRef ?? ELEMENT_BASE_ZOOM) * scaleFactor;
      const h = 20;
      const c = projectExportPxToPdf(p, frameRect);
      const bw = (w / imgW) * frameRect.w;
      const bh = (h / imgH) * frameRect.h;
      pdfDoc.setDrawColor(0, 0, 0);
      pdfDoc.setLineWidth(0.7);
      pdfDoc.rect(c.x - bw / 2, c.y - bh / 2, bw, bh);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(8);
      pdfDoc.text("Scale", c.x - bw / 2 + 4, c.y + 3);
    }
    }

    // Placed signs – vector placeholder boxes at correct positions
    for (const s of placedSigns || []) {
      const p = projectPoint(s?.pos);
      if (!inExport(p)) continue;
      const w = s?.wPx || 64;
      const h = s?.hPx || 64;
      const c = projectExportPxToPdf(p, frameRect);
      const bw = (w / imgW) * frameRect.w;
      const bh = (h / imgH) * frameRect.h;
      pdfDoc.setDrawColor(0, 0, 0);
      pdfDoc.setLineWidth(0.6);
      pdfDoc.rect(c.x - bw / 2, c.y - bh / 2, bw, bh);
      // optional simple label so sign presence is obvious
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(7);
      pdfDoc.text("SIGN", c.x - bw / 2 + 3, c.y - 2);
    }

    // Insert objects (rect/text/table) – vector where reasonable
    for (const obj of insertObjects || []) {
      const pos = obj.pos || obj.position;
      if (!pos) continue;
      const p = projectPoint(pos);
      if (!inExport(p)) continue;
      const zRef = obj.zRef ?? ELEMENT_BASE_ZOOM;
      const w = (obj.wPx || 100) * zoomScale(zRef) * scaleFactor;
      const h = (obj.hPx || 60) * zoomScale(zRef) * scaleFactor;
      const c = projectExportPxToPdf(p, frameRect);
      const bw = (w / imgW) * frameRect.w;
      const bh = (h / imgH) * frameRect.h;

      if (obj.kind === "rect" || obj.kind === "table") {
        pdfDoc.setDrawColor(0, 0, 0);
        pdfDoc.setLineWidth(0.8);
        pdfDoc.rect(c.x - bw / 2, c.y - bh / 2, bw, bh);
      } else if (obj.kind === "text") {
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(9);
        pdfDoc.text(String(obj.text || ""), c.x - bw / 2 + 4, c.y);
      } else {
        // Generic labeled box
        pdfDoc.setDrawColor(0, 0, 0);
        pdfDoc.setLineWidth(0.5);
        pdfDoc.rect(c.x - bw / 2, c.y - bh / 2, bw, bh);
        const text = obj.text || obj.cells?.flat?.()?.join?.(" ") || "";
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(8);
        pdfDoc.text(String(text).slice(0, 40), c.x - bw / 2 + 4, c.y);
      }
    }
  }

  // --- STEP 5: Final output (page layout + map frame + vector overlay) ---
  const orient = exportOrientation === "landscape" ? "l" : "p";
  const format = ["letter","legal","tabloid","a4","a3"].includes(exportPaperSize) ? exportPaperSize : "letter";
  const pdf = new jsPDF({ orientation: orient, unit: "mm", format });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const frameRect = getMapFrameRect(pageW, pageH);
  const scaleX = frameRect.w / imgW;
  const scaleY = frameRect.h / imgH;
  const scale = Math.min(scaleX, scaleY);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = frameRect.x + (frameRect.w - drawW) / 2;
  const offsetY = frameRect.y + (frameRect.h - drawH) / 2;
  const drawRect = { x: offsetX, y: offsetY, w: drawW, h: drawH };
  const basePng = canvas.toDataURL("image/png");

  // Layer 1: page background (white)
  drawPdfPageBackground(pdf, pageW, pageH);

  // Layer 2: black border around drawing area
  drawPdfMapFrame(pdf, drawRect);

  // Layer 3: map + TMP overlays (composited on canvas)
  drawPdfAerialBase(pdf, basePng, drawRect);

  // Try to open PDF in new tab; if popup blocked, fall back to download
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, "_blank", "noopener,noreferrer");
  if (!newWin || newWin.closed) {
    pdf.save("TMP-export.pdf");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  cancelExportToPdf();
  } catch (err) {
    console.error("Export to PDF failed:", err);
    const msg = err instanceof Error ? err.message : (err?.message || (typeof err === "object" ? "Unknown error" : String(err)));
    alert("Export failed: " + msg);
  }
}


  function openConesTool() {
  if (measIsDrawing) cancelMeasDrawing();

  setActiveTool("cones");
  setConesPanelOpen(true);
  setMeasPanelOpen(false);
  setSignsPanelOpen(false);
}
function openMeasTool() {
  if (conesIsDrawing) cancelConesDrawing();

  setActiveTool("measurements");
  setMeasPanelOpen(true);
  setConesPanelOpen(false);
  setSignsPanelOpen(false);
}

  function openWorkAreaTool() {
    if (conesIsDrawing) cancelConesDrawing();
if (measIsDrawing) cancelMeasDrawing();

  // turn off other modes/panels
  setActiveTool("work_area");
  setConesPanelOpen(false);
  setMeasPanelOpen(false);
  setSignsPanelOpen(false);
setPanMode(false);

  // reset work area draft when starting fresh
  setIsDrawingWorkArea(false);
  setWorkDraft([]);
  setWorkHover(null);

  // clear any selection/edit states so it feels “professional”
  setEditingInsertId?.(null);
  setEditingCell?.(null);
  setSelectedInsertId?.(null);
  setSelectedEntity?.(null);
  setUiDrag(null);
}


  function openSignsTool() {
    setActiveTool("signs");
    setSignsPanelOpen(true);
    setConesPanelOpen(false);
    setMeasPanelOpen(false);
    if (conesIsDrawing) cancelConesDrawing();
    if (measIsDrawing) cancelMeasDrawing();
  }

  function closeConesPanel() {
    setConesPanelOpen(false);
  }
  function closeMeasPanel() {
    setMeasPanelOpen(false);
  }
  function closeSignsPanel() {
    setSignsPanelOpen(false);
  }

  /* ================= Tab click behavior ================= */
  const clickTab = (tab) => {
    if (tab === "File") {
      setOpenFileMenu((v) => !v);
      return;
    }

    if (tab === "Plan Elements" && activeTab === "Plan Elements") {
      setOpenFileMenu(false);
      deactivateAllTools();
      return;
    }

    setOpenFileMenu(false);
    setActiveTab(tab);

    if (tab !== "Plan Elements") {
      deactivateAllTools();
    }
  };

  const showRibbon = activeTab !== "File";

  /* ================= Cones sampling (px) ================= */
  function recomputeConesPreviewSamples(latlngPath) {
    if (!latlngPath || latlngPath.length < 2) {
      setConesPreviewSamples([]);
      return;
    }

    const spacingM = getConeSpacingMeters(selectedConeType);
    const samplesLatLng = resamplePolylineMetersLL(latlngPath, spacingM);
    setConesPreviewSamples(samplesLatLng);
  }

  function sampleConesMarkersForPath(path, typeId) {
    if (!path || path.length < 2) return [];
    const spacingM = getConeSpacingMeters(typeId);
    return resamplePolylineMetersLL(path, spacingM);
  }

  /* ================= Cones drawing actions ================= */
  function startConesDrawingAt(point) {
    setConesIsDrawing(true);
    conesVerticesRef.current = [point];
    setConesVerticesState([point]);
    setConesHoverPoint(point);
    setConesPreviewSamples([]);
  }

  function addConesVertex(point) {
    const next = [...conesVerticesRef.current, point];
    conesVerticesRef.current = next;
    setConesVerticesState(next);
    setConesHoverPoint(point);
  }

  function finalizeConesDrawing(finalPoint = null) {
    let path = [...conesVerticesRef.current];
    if (finalPoint) path = [...path, finalPoint];

    if (path.length >= 2) {
      pushHistory();

      setConesFeatures((prev) => [
        ...prev,
        {
          id: String(Date.now() + Math.random()),
          typeId: selectedConeType,
          path,
        },
      ]);
    }

    cancelConesDrawing();
  }

  /* ================= Measurements drawing actions ================= */
  function startMeasDrawingAt(point) {
    setMeasIsDrawing(true);
    measVerticesRef.current = [point];
    setMeasVerticesState([point]);
    setMeasHoverPoint(point);
  }

  function addMeasVertex(point) {
    const next = [...measVerticesRef.current, point];
    measVerticesRef.current = next;
    setMeasVerticesState(next);
    setMeasHoverPoint(point);
  }

  function normalizeCombinedPath(points) {
    if (!points || points.length === 0) return [];
    const cleaned = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      const cur = points[i];
      if (!nearlySameLatLng(prev, cur, MIN_SEGMENT_METERS)) cleaned.push(cur);
    }
    while (
      cleaned.length >= 2 &&
      nearlySameLatLng(
        cleaned[cleaned.length - 2],
        cleaned[cleaned.length - 1],
        MIN_SEGMENT_METERS
      )
    ) {
      cleaned.pop();
    }
    return cleaned;
  }

  function finalizeMeasDrawing(finalPoint = null) {
    let path = [...measVerticesRef.current];
    if (finalPoint) path = [...path, finalPoint];

    if (measMode === "distance" && path.length >= 2) {
      const finalPath = [path[0], path[path.length - 1]];
      if (!nearlySameLatLng(finalPath[0], finalPath[1], MIN_SEGMENT_METERS)) {
        pushHistory();
        setMeasurements((prev) => [
          ...prev,
          {
            id: String(Date.now() + Math.random()),
            mode: "distance",
            path: finalPath,
            zRef: mapRef.current?.getZoom?.() ?? mapView.zoom,
          },
        ]);
      }
    }
    if (measMode === "combined" && path.length >= 2) {
      const cleaned = normalizeCombinedPath(path);
      if (cleaned.length >= 2) {
        setMeasurements((prev) => [
          ...prev,
          {
            id: String(Date.now() + Math.random()),
            mode: "combined",
            path: cleaned,
             zRef: mapRef.current?.getZoom?.() ?? mapView.zoom,
          },
        ]);
      }
    }

    cancelMeasDrawing();
  }

  /* ================= Signs placement ================= */
  function placeSignAt(latlng) {
    const item = getSignById(selectedSignCode) || getSignCatalog()[0];
    if (!item) return;

    const wPx = item.defaultWidth ?? DEFAULT_SIGN_WIDTH_PX;
    const hPx = item.defaultHeight ?? DEFAULT_SIGN_HEIGHT_PX;
    const id = String(Date.now() + Math.random());
    pushHistory();
    setPlacedSigns((prev) => [
      ...prev,
      {
        id,
        code: item.code,
        src: item.src,
        pos: latlng,
        wPx,
        hPx,
        rotDeg: 0,
        zRef: zoomNow,
        stands: [],
      },
    ]);

    setSelectedEntity({ kind: "sign", id });
  }

  function getSelectedSign() {
    if (!selectedEntity) return null;
    if (selectedEntity.kind === "sign") {
      return placedSigns.find((s) => s.id === selectedEntity.id) || null;
    }
    if (selectedEntity.kind === "stand") {
      return placedSigns.find((s) => s.id === selectedEntity.signId) || null;
    }
    return null;
  }
const selectedSign = getSelectedSign();

  /* ================= Title box data helpers ================= */
  function updateTitleBoxData(id, patch) {
    setTitleBoxDataById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }

  function uploadTitleLogo(id, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateTitleBoxData(id, { logoDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  /* ================= Mouse move ================= */
function onMapMouseMove(e) {
  const ll = e?.latLng;
  if (!ll) return;

  const cur = { lat: ll.lat(), lng: ll.lng() };

    // ✅ Picture preview follows cursor while inserting
  if (activeTool === "insert:picture" && pendingPictureTool) {
    setPictureGhostPos(cur);
  }
  // WORK AREA hover preview (DO NOT redeclare ll)
if (activeTool === "work_area" && isDrawingWorkArea) {
  setWorkHover(cur); // cur is already {lat, lng}
}



  pendingMoveRef.current = cur;

  // ✅ Insert line preview updates MUST happen immediately
  if (activeTool === "insert:line" && lineDraft) {
    setLineDraft((d) => (d ? { ...d, end: cur } : d));
    // don't return — because you still want UI drags / cones preview etc
  }

  if (rafRef.current) return;
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = null;
    const cur2 = pendingMoveRef.current;
    if (!cur2) return;

    // UI drags that need latLngToPx
    if (uiDrag && projectionReady) {
      // title move/resize handled by window mousemove (below)
      if (uiDrag.type === "resizeLegend") return;
      if (uiDrag.type === "resizeManifest") return;
      if (uiDrag.type === "resizeWorkArea") return;
      // Sign resize is handled exclusively by the window-level pointermove/mousemove
      // handler (which uses clientToDivPx coords consistently). Letting this map handler
      // also process resizeSign would cause coordinate-system mixing (latLngToPx vs
      // clientToDivPx) and produce incorrect opposite-corner pinning.
      if (uiDrag.type === "resizeSign") return;
      // Sign move uses the same window listener (clientToDivPx). Handling it here too
      // duplicates updates in a different projection space and causes lag / jumping.
      if (uiDrag.type === "moveSign") return;
      // These are handled by the window-level useEffect (clientToDivPx, consistent coords)
      if (uiDrag.type === "moveLegend") return;
      if (uiDrag.type === "moveManifest") return;
      if (uiDrag.type === "moveNorthArrow") return;
      if (uiDrag.type === "moveInsert") return;

      const curPx = latLngToPx(cur2);
      if (!curPx) return;

      // moveLegend / moveManifest / moveNorthArrow / moveInsert are now handled
      // by the dedicated window-level useEffect (clientToDivPx coords).


     
            // ================= TABLE: move / resize outer / rotate =================
      

      
      
      if (uiDrag.type === "moveSign") {
        const { signId, offsetPx } = uiDrag;
        const newCenterPx = { x: curPx.x - offsetPx.x, y: curPx.y - offsetPx.y };
        const nextPos = pxToLatLng(newCenterPx);
        if (!nextPos) return;
        setPlacedSigns((prev) =>
          prev.map((s) => (s.id === signId ? { ...s, pos: nextPos } : s))
        );
        return;
      }

      // rotateSign is handled by the window-level move listener so it continues
      // tracking even when pointer capture prevents map mousemove from firing.

      if (uiDrag.type === "rotateNorthArrow") {
        const { arrowId, centerPx, startAngleDeg, startPointerAngleDeg } = uiDrag;
        const angleNow =
          (Math.atan2(curPx.y - centerPx.y, curPx.x - centerPx.x) * 180) / Math.PI;

        const delta = angleNow - startPointerAngleDeg;
        const nextDeg = startAngleDeg + delta;

        setNorthArrows((prev) =>
          prev.map((na) => (na.id === arrowId ? { ...na, rotDeg: nextDeg } : na))
        );
        return;
      }

      if (uiDrag.type === "rotateStand") {
        const { signId, standId, centerPx, startAngleDeg, startPointerAngleDeg } = uiDrag;
        const angleNow =
          (Math.atan2(curPx.y - centerPx.y, curPx.x - centerPx.x) * 180) / Math.PI;
        const delta = angleNow - startPointerAngleDeg;
        const nextDeg = startAngleDeg + delta;

        setPlacedSigns((prev) =>
          prev.map((s) => {
            if (s.id !== signId) return s;
            return {
              ...s,
              stands: (s.stands || []).map((st) =>
                st.id === standId ? { ...st, rotDeg: nextDeg, rotationDeg: nextDeg } : st
              ),
            };
          })
        );
        return;
      }

      // resizeScale + moveScale are now handled by the dedicated window-level useEffect

      if (uiDrag.type === "createStand") {
        setUiDrag((d) => (d ? { ...d, hoverPos: cur2 } : d));
        return;
      }
      if (uiDrag.type === "moveStand") return;
    }

    // CONES preview
    if (isConesToolActive && conesIsDrawing) {
      const last = conesHoverPoint;
      const proj = getProjection();
      if (proj && last) {
        const a = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(last.lat, last.lng));
        const b = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(cur2.lat, cur2.lng));
        if (distPx({ x: a.x, y: a.y }, { x: b.x, y: b.y }) < MIN_MOVE_PX) return;
      }

      setConesHoverPoint(cur2);
      const previewPath = [...conesVerticesRef.current, cur2];
      if (projectionReady) recomputeConesPreviewSamples(previewPath);
    }

    // MEASUREMENTS preview
    if (isMeasToolActive && measIsDrawing) {
      setMeasHoverPoint(cur2);
    }
  });
}

  
  /* ================= Click handling ================= */
  // =========================
const sameLL = (a, b, eps = 1e-10) => {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lng - b.lng) < eps;
};

const dedupeLastIfSame = (arr, p) => {
  if (!arr?.length) return arr;
  const last = arr[arr.length - 1];
  return sameLL(last, p) ? arr.slice(0, -1) : arr;
};


  function onMapClick(e) {
    if (measEdit) return;
    if (exportMode) return; // Export mode uses mousedown for print area; ignore clicks

    // Ignore the first map click immediately after a stand rotation drag
    if (rotateStandGuardRef.current) {
      rotateStandGuardRef.current = false;
      return;
    }

    if (uiDrag?.type === "createStand" && selectedSign && uiDrag.signId === selectedSign.id) {
      const ll = e?.latLng;
      const p = uiDrag.hoverPos || (ll ? { lat: ll.lat(), lng: ll.lng() } : null);
      if (p) {
        const standId = String(Date.now() + Math.random());
        const newStand = {
          id: standId,
          type: uiDrag.standType,
          pos: p,
          rotDeg: 0,
          rotationDeg: 0,
        };
        pushHistory();
        setPlacedSigns((prev) =>
          prev.map((s) =>
            s.id === uiDrag.signId ? { ...s, stands: [...(s.stands || []), newStand] } : s
          )
        );
        setUiDrag(null);
      }
      return;
    }

    // If this click started on a sign/stand/handle/rotate control, select the sign
    const domTarget = e?.domEvent?.target;
    const signInteractive = domTarget && typeof domTarget.closest === "function"
      ? domTarget.closest("[data-sign-interactive='1']")
      : null;
    if (signInteractive) {
      const signEl = domTarget.closest("[data-sign-id]");
      const signId = signEl?.getAttribute?.("data-sign-id");
      if (signId) {
        onSelectSign(signId);
      }
      return;
    }

    // ✅ Ignore the click that comes from a dblclick (trackpad-safe)
if (activeTool === "work_area" && dblClickGuardRef.current) return;
if (activeTool === "insert:line" && dblClickGuardRef.current) return;



    const ll = e?.latLng;
    if (!ll) return;
    const p = { lat: ll.lat(), lng: ll.lng() };
// ✅ WORK AREA: single click adds vertices immediately
if (activeTool === "work_area") {
  // ✅ ignore the 2nd click of a double-click (prevents extra point)
  const detail = e?.domEvent?.detail;
  if (detail === 2) return;

  if (!isDrawingWorkArea) {
    setSelectedWorkAreaId(null); // deselect so new drawing shows and state stays consistent
    setIsDrawingWorkArea(true);
    setWorkDraft([p]);
    setWorkHover(p);
  } else {
    setWorkDraft((prev) => [...prev, p]);
    setWorkHover(p);
  }
  return;
}


    if (uiDrag) return;


    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    clickTimerRef.current = setTimeout(() => {
     
const latLng = e.latLng?.toJSON?.() ?? null;




      // ===== PICTURE placement =====
if (activeTool === "insert:picture" && pendingPictureTool) {
  const id = String(Date.now()) + "-" + Math.random();
  setInsertObjects((prev) => [
    ...prev,
    {
      id,
      kind: "picture",
      pos: p,
      wPx: pendingPictureTool.wPx,
      hPx: pendingPictureTool.hPx,
      zRef: ELEMENT_BASE_ZOOM,
      dataUrl: pendingPictureTool.dataUrl,
      rotDeg: 0,
    },
  ]);

  setPendingPictureTool(null);
  setPictureGhostPos(null);
  setActiveTool(null);
  return;
}

// TABLE placement
if (activeTool === "insert:table") {
  const id = String(Date.now() + Math.random());

  setInsertObjects((prev) => [
    ...prev,
    {
      id,
      kind: "table",
      pos: p,
      wPx: 360,
      hPx: 220,
      zRef: ELEMENT_BASE_ZOOM,
      rotDeg: 0,
      fontSize: 14,
      fontFamily: "Arial",
      rows: 3,
      cols: 3,
      // store per-cell text
      cells: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => "")
      ),
      // store custom row/col sizes for drag-resize
      rowHeights: [70, 70, 70],
      colWidths: [120, 120, 120],
    },
  ]);

  setSelectedInsertId(id);
  setActiveTool(null);
  return;
}


      // LEGEND placement
      if (activeTool === "legend") {
        const id = String(Date.now() + Math.random());
        setLegendBoxes((prev) => [
          ...prev,
          { id, pos: p, wPx: 260, hPx: 240, zRef: ELEMENT_BASE_ZOOM, rotDeg: 0 },
        ]);
        setSelectedEntity({ kind: "legend", id });
        setActiveTool(null);
        return;
      }

      // MANIFEST placement
      if (activeTool === "manifest") {
        const id = String(Date.now() + Math.random());
        setManifestBoxes((prev) => [
          ...prev,
          { id, pos: p, wPx: 240, hPx: 220, zRef: ELEMENT_BASE_ZOOM },
        ]);
        setSelectedEntity({ kind: "manifest", id });
        setActiveTool(null);
        return;
      }

     // TITLE placement (map anchored)
if (activeTool === "title") {
  const id = crypto.randomUUID();

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const todayISO = `${yyyy}-${mm}-${dd}`;

  const defaultData = {
    project: "",
    jobLocation: "",
    date: todayISO,
    author: "",
    comments: "",
  };

  // clear other selections/ribbons first
  clearSelectionEverywhere();

  setInsertObjects((prev) => [
    ...prev,
    {
      id,
      kind: "title_box",
      pos: p, // lat/lng anchor
      wPx: 720,
      hPx: 150,
      rotDeg: 0,
      zRef: ELEMENT_BASE_ZOOM,
      data: defaultData,
    },
  ]);

  setSelectedInsertId(id); // selecting opens ribbon (we’ll add ribbon below)
  setActiveTool(null);     // tool off after placement (one tool at a time)
  return;
}



      // NORTH ARROW placement
if (activeTool === "northArrow") {
  const id = String(Date.now() + Math.random());
  setNorthArrows((prev) => [
    ...prev,
    { id, pos: p, wPx: 110, hPx: 110, zRef: zoomNow, rotDeg: 0 },
  ]);
  setSelectedEntity({ kind: "northArrow", id });
  setActiveTool(null);
  return;
}
// SCALE placement (SAFE)
if (activeTool === "scale") {
  if (!e?.latLng) return; // ✅ prevents crash

  const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
  const id = crypto.randomUUID();

  setScales((prev) => [
    ...prev,
    { id, pos: p, wPx: 320, hPx: 180, zRef: zoomNow, rotDeg: 0 },
  ]);

  setSelectedEntity({ kind: "scale", id });
  setActiveTool(null);
  return;
}


// ================= INSERT placement =================
if (activeTool?.startsWith("insert:")) {
  const insertType = activeTool.replace("insert:", "");

  // ✅ PICTURE: place on click using pendingPictureTool
  if (insertType === "picture") {
    if (!pendingPictureTool?.dataUrl) return;

    const id = crypto.randomUUID();
    const obj = {
      id,
      kind: "picture",
      pos: p,
      wPx: pendingPictureTool.wPx || 260,
      hPx: pendingPictureTool.hPx || 180,
      rotDeg: 0,
      zRef: ELEMENT_BASE_ZOOM,
      dataUrl: pendingPictureTool.dataUrl,
    };

    setInsertObjects((prev) => [...prev, obj]);
    setSelectedInsertId(id);

    setPendingPictureTool(null);
    // keep tool ON if you want repeated placement:
    // setActiveTool("insert:picture");
    // or turn it off:
    setActiveTool(null);
    return;
  }

  // ✅ LINE: continuous polyline — each click adds a vertex; double-click finalizes
  if (insertType === "line") {
    if (!lineDraft) {
      setLineDraft({ points: [p], end: p });
      return;
    }
    // append new vertex
    setLineDraft((d) => (d ? { points: [...d.points, p], end: p } : d));
    return;
  }

  // ✅ TEXTBOX / TEXT / RECT: place immediately
const obj = makeInsertObject(insertType, p);
if (!obj) return;

setInsertObjects((prev) => [...prev, obj]);
setSelectedInsertId(obj.id);

// ✅ One-shot placement ONLY for these tools:
if (insertType === "textbox" || insertType === "rect" || insertType === "text") {
  setActiveTool(null); // turns off crosshair after 1 placement
}

return;
}


      // SIGNS place repeatedly
      if (isSignsToolActive) {
        placeSignAt(p);
        return;
      }

      // CONES
      if (isConesToolActive) {
        if (!conesIsDrawing) startConesDrawingAt(p);
        else addConesVertex(p);
        return;
      }

            // MEASUREMENTS
      if (isMeasToolActive) {
        if (measMode === "distance") {
          if (!measIsDrawing) startMeasDrawingAt(p);
          else finalizeMeasDrawing(p);
        } else if (measMode === "combined") {
          if (!measIsDrawing) startMeasDrawingAt(p);
          else addMeasVertex(p);
        }
      }
      // setSelectedEntity(null);  // <-- disable: keep selection until dbl/right click

    }, CLICK_DELAY_MS);
  }

function clearSelectionEverywhere() {
  setEditingInsertId?.(null);
  setEditingCell?.(null);
  setSelectedInsertId?.(null);
  setSelectedEntity?.(null);
  setUiDrag?.(null);
  // if you have selectedWorkAreaId, table selection, etc:
  setSelectedWorkAreaId?.(null);
}

function cancelActiveDrafts() {
  // Work area draft
  setIsDrawingWorkArea(false);
  setWorkDraft([]);
  setWorkHover(null);

  // Measurements drafts (rename these to your real state names)
  setMeasIsDrawing?.(false);
  setMeasHoverPoint?.(null);
  measVerticesRef.current = [];
setMeasVerticesState([]);
  // Cones preview/drawing (rename to your real names)
  setConesIsDrawing?.(false);
 

  // Insert line draft
  setLineDraft?.(null);
}

function finishActiveDraftAtPoint(p) {


  // ✅ Measurements: double click finishes (combined etc)
  if (activeTool === "measurements" && measIsDrawing) {
    finalizeMeasurement?.(p); // <-- call your existing finish function
    return true;
  }

  // ✅ Cones: double click finishes current cones stroke/path
  if (activeTool === "cones" && conesIsDrawing) {
    finalizeCones?.(p); // <-- call your existing finish function
    return true;
  }

  return false;
}
function onMapMouseDown(e) {
  if (measEdit) return;

  const ll = e?.latLng;
  if (!ll) return;

  const p = { lat: ll.lat(), lng: ll.lng() };

  if (activeTool === "work_area") return;

  // other tools: do nothing here
}

function onMapDblClick(e) {
  if (exportMode) return; // Export mode: ignore dblclick
  if (measEdit) {
  commitEditMeasureLabel();
  return;
}

  // If editing a measurement label, don't let map dblclick zoom/finish actions
if (measEdit) return;

  // stop Google Maps zoom + stop event bubbling
  if (e?.domEvent) {
    e.domEvent.preventDefault();
    e.domEvent.stopPropagation();
  }

  // cancel any pending "single click" timer if you have one
  if (clickTimerRef?.current) {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }

  // block the synthetic click that follows dblclick
  if (dblClickGuardRef?.current) dblClickGuardRef.current = true;
  setTimeout(() => {
    if (dblClickGuardRef?.current) dblClickGuardRef.current = false;
  }, 0);

  const ll = e?.latLng;
  const p = ll ? { lat: ll.lat(), lng: ll.lng() } : null;

// ✅ WORK AREA: double-click finishes polygon cleanly
if (activeTool === "work_area" && isDrawingWorkArea) {
  if (!workDraft.length) return;
  // Use workDraft as-is: first click of double-click already added the final point.
  // Never add p here (would create duplicate vertex).
  let finalPath = [...workDraft];
  // Remove duplicate final vertex if last two are nearly identical (2nd click of dblclick sometimes adds one)
  if (finalPath.length >= 2) {
    const last = finalPath[finalPath.length - 1];
    const prev = finalPath[finalPath.length - 2];
    const distSq = (last.lat - prev.lat) ** 2 + (last.lng - prev.lng) ** 2;
    if (distSq < 1e-14) finalPath = finalPath.slice(0, -1); // ~1e-7 deg threshold
  }

  if (finalPath.length >= 3) {
    pushHistory();
    setWorkAreas((prev) => [
      ...prev,
      { id: crypto.randomUUID(), path: finalPath },
    ]);
  }

  setIsDrawingWorkArea(false);
  setWorkDraft([]);
  setWorkHover(null);
  return;
}

  // ✅ MEASUREMENTS: dblclick finishes combined measurement
  if (isMeasToolActive && measIsDrawing && measMode === "combined") {
    if (p) finalizeMeasDrawing(p);
    else finalizeMeasDrawing(null);
    return;
  }


  // ✅ CONES: dblclick = finalize cones
  if (activeTool === "cones" && conesIsDrawing) {
    finalizeConesDrawing(p);
    return;
  }

  // ✅ LINE: dblclick = finalize polyline
  if (activeTool === "insert:line" && lineDraft?.points?.length) {
    const last = lineDraft.points[lineDraft.points.length - 1];
    const same = last && Math.abs(last.lat - p.lat) < 1e-10 && Math.abs(last.lng - p.lng) < 1e-10;
    const finalPath = same ? lineDraft.points : [...lineDraft.points, p];
    if (finalPath.length >= 2) {
      const id = crypto.randomUUID();
      setInsertObjects((prev) => [
        ...prev,
        { id, kind: "line", path: finalPath, stroke: "#111111", strokeWidth: 3 },
      ]);
      setSelectedInsertId(id);
    }
    setLineDraft(null);
    return;
  }

  // otherwise just deselect/end editing
  if (activeTool === "work_area") setActiveTool(null);
  clearSelectionEverywhere();
  cancelActiveDrafts();
}

function onMapRightClick(e) {
  // If editing a measurement label, right-click should finish edit (not start/cancel tools)
if (measEdit) {
  commitEditMeasureLabel(); // or cancelEditMeasureLabel() if you prefer cancel
  return;
}

  if (e?.domEvent) {
    e.domEvent.preventDefault();
    e.domEvent.stopPropagation();
  }

  // ✅ WORK AREA: right click cancels draft or deselects; turn off tool to match UI
  if (activeTool === "work_area") {
    if (isDrawingWorkArea) {
      setIsDrawingWorkArea(false);
      setWorkDraft([]);
      setWorkHover(null);
    } else {
      setSelectedEntity(null);
      setSelectedInsertId(null);
      setSelectedWorkAreaId(null);
    }
    setActiveTool(null);
    return;
  }

  // stop any drag operations
  if (uiDrag) {
    setUiDrag(null);
    return;
  }

  // stop cones drawing
  if (isConesToolActive && conesIsDrawing) {
    cancelConesDrawing();
    return;
  }

  // stop measurements
  if (isMeasToolActive && measIsDrawing) {
    // ✅ Right click should CANCEL (both modes)
    cancelMeasDrawing();
    return;
  }


  // stop signs tool
  if (isSignsToolActive) {
    setActiveTool(null);
    setSignsPanelOpen(false);
    return;
  }

  // stop any insert tool
  if (activeTool) {
    setPictureGhostPos(null);
    setActiveTool(null);
    setConesPanelOpen(false);
    setMeasPanelOpen(false);
    setSignsPanelOpen(false);
    return;
  }

  // deselect anything
  setSelectedEntity(null);
  setSelectedInsertId(null);
}
useEffect(() => {
  if (!mapRef.current) return;

  if (mapLayer === "hybrid_clean") {
    mapRef.current.setMapTypeId("satellite");
    mapRef.current.setOptions({ styles: CLEAN_HYBRID_STYLE });
  } else {
    mapRef.current.setMapTypeId(mapLayer);
    mapRef.current.setOptions({ styles: null });
  }
}, [mapLayer]);


  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        if (activeTool === "insert:line" && lineDraft) {
  setLineDraft(null);
}
        if (activeTool === "work_area" && selectedWorkAreaId) {
          setSelectedWorkAreaId(null);
        }

        if (uiDrag) setUiDrag(null);
        if (conesIsDrawing) cancelConesDrawing();
        if (measIsDrawing) cancelMeasDrawing();
        if (isSignsToolActive) {
          setActiveTool(null);
          setSignsPanelOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [uiDrag, conesIsDrawing, measIsDrawing, isSignsToolActive, activeTool, lineDraft, selectedWorkAreaId]);
// ================= Keyboard shortcuts: Undo / Redo / Delete =================
useEffect(() => {
  const onKeyDown = (e) => {
    // ignore typing in inputs/textareas/contenteditable
    const el = e.target;
    const tag = el?.tagName?.toLowerCase();
    const isTyping =
      tag === "input" ||
      tag === "textarea" ||
      el?.isContentEditable;

    if (isTyping) return;

    const key = e.key?.toLowerCase();

    // Undo: Ctrl+Z (or Cmd+Z)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z") {
      e.preventDefault();
      doUndo();
      return;
    }

    // Redo: Ctrl+Y OR Ctrl+Shift+Z (or Cmd+Shift+Z)
    if (
      (e.ctrlKey || e.metaKey) &&
      (key === "y" || (e.shiftKey && key === "z"))
    ) {
      e.preventDefault();
      doRedo();
      return;
    }

    // Delete: Delete or Backspace
    if (key === "delete" || key === "backspace") {
      e.preventDefault();
      doDelete();
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [doUndo, doRedo, doDelete]);

// Ctrl+V paste (always active)
useEffect(() => {
  const onKey = (e) => {
    const el = e.target;
    const tag = el?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      handleContextPaste(clipboard);
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [clipboard]); // re-bind when clipboard changes so closure has fresh data

// Track cursor position globally so paste lands at cursor
useEffect(() => {
  const onMove = (e) => { lastMousePosRef.current = { x: e.clientX, y: e.clientY }; };
  window.addEventListener("mousemove", onMove, { passive: true });
  return () => window.removeEventListener("mousemove", onMove);
}, []);

// Context menu: dismiss on outside click or Escape
useEffect(() => {
  if (!contextMenu) return;
  const onDown = () => closeContextMenu();
  const onKey = (e) => { if (e.key === "Escape") closeContextMenu(); };
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("keydown", onKey);
  };
}, [contextMenu]);


  useEffect(() => {
  function onMove(ev) {
    const info = tableResizeRef.current;
    if (!info) return;

    const dx = ev.clientX - info.startX;
    const dy = ev.clientY - info.startY;

    setInsertObjects((prev) =>
      prev.map((o) => {
        if (o.id !== info.id || o.kind !== "table") return o;

        const next = structuredClone(o);

        if (info.type === "col") {
          const i = info.index; // boundary between col i and i+1
          const minW = 40;

          const left0 = info.col0[i];
          const right0 = info.col0[i + 1];
          const total = left0 + right0;

          const left = clamp(left0 + dx, minW, total - minW);
          const right = total - left;

          next.colWidths[i] = left;
          next.colWidths[i + 1] = right;
        }

        if (info.type === "row") {
          const i = info.index; // boundary between row i and i+1
          const minH = 32;

          const top0 = info.row0[i];
          const bottom0 = info.row0[i + 1];
          const total = top0 + bottom0;

          const top = clamp(top0 + dy, minH, total - minH);
          const bottom = total - top;

          next.rowHeights[i] = top;
          next.rowHeights[i + 1] = bottom;
        }

        return next;
      })
    );
  }

  function onUp() {
    tableResizeRef.current = null;
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}, [setInsertObjects]);

// ✅ IMPORTANT: end move/drag operations on mouseup/pointerup (professional selection behavior)
useEffect(() => {
  function onUp(ev) {
    if (tableResizeRef.current) return;

    if (uiDrag) {
      // Commit stand placement on release (drag from tripod/windmaster button)
      if (uiDrag.type === "createStand") {
        const fromHover = uiDrag.hoverPos ?? null;
        let p = fromHover;

        if (!p && projectionReady) {
          const clientX = ev?.clientX ?? ev?.touches?.[0]?.clientX;
          const clientY = ev?.clientY ?? ev?.touches?.[0]?.clientY;
          if (clientX != null && clientY != null) {
            const divPx = clientToDivPx(clientX, clientY);
            if (divPx) {
              const ll = pxToLatLng(divPx);
              if (ll) p = ll;
            }
          }
        }

        if (p) {
          const standId = String(Date.now() + Math.random());
          const newStand = { id: standId, type: uiDrag.standType, pos: p, rotDeg: 0 };
          pushHistory();
          setPlacedSigns((prev) =>
            prev.map((s) =>
              s.id === uiDrag.signId ? { ...s, stands: [...(s.stands || []), newStand] } : s
            )
          );
          setSelectedEntity({ kind: "stand", signId: uiDrag.signId, standId });
        }

        setUiDrag(null);
        lockMapInteractions(false);
        return;
      }

      // rotateSign is ended by the dedicated rotateSign listener (see below)
      // to avoid competing "up" handlers causing vibration or dropped moves.
      if (uiDrag.type === "rotateSign") return;

      if (uiDrag.type === "resizeWorkArea") {
        if (workAreaResizeRafRef.current) {
          cancelAnimationFrame(workAreaResizeRafRef.current);
          workAreaResizeRafRef.current = null;
        }
        const pending = workAreaResizePendingRef.current;
        workAreaResizePendingRef.current = null;
        if (pending) {
          setWorkAreas((prev) =>
            prev.map((a) =>
              a.id !== pending.workAreaId ? a : { ...a, path: pending.path }
            )
          );
        }
      }
      // resizeSign intentionally does NOT commit `pos`.
      // The center-fixed resize model keeps the sign anchored at the original
      // `pos` while wPx/hPx change, preventing any post-resize jump when re-selecting.

      if (
        uiDrag.type === "moveSign" ||
        uiDrag.type === "resizeSign" ||
        uiDrag.type === "moveStand" ||
        uiDrag.type === "rotateSign" ||
        uiDrag.type === "rotateNorthArrow" ||
        uiDrag.type === "rotateStand" ||
        uiDrag.type === "resizeWorkArea"
      ) {
        pushHistory();
      }
      if (
        uiDrag.type === "resizeSign" ||
        uiDrag.type === "moveSign" ||
        uiDrag.type === "moveStand" ||
        uiDrag.type === "rotateSign" ||
        uiDrag.type === "rotateStand" ||
        uiDrag.type === "resizeWorkArea" ||
        uiDrag.type === "resizeExportArea" ||
        uiDrag.type === "moveExportArea"
      ) {
        lockMapInteractions(false);
      }
      if (uiDrag.type === "resizeExportArea") {
        const ref = exportResizeRef.current;
        const finalRect = ref?.lastRect ?? exportLiveRect ?? null;
        if (finalRect) {
          const nextBounds = rectPxToBounds(finalRect);
          if (nextBounds) {
            exportBoundsForPdfRef.current = nextBounds;
            setPrintAreaBounds(nextBounds);
          }
        }
        exportResizeRef.current = null;
        setExportLiveRect(null);
      }
      if (uiDrag.type === "moveExportArea") {
        setExportLiveRect(null);
      }
      setUiDrag(null);
    }
  }

  function onUpTouch(ev) {
    const t = ev.changedTouches?.[0];
    onUp(t ? { clientX: t.clientX, clientY: t.clientY } : ev);
  }
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("touchend", onUpTouch, true);
  return () => {
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("touchend", onUpTouch, true);
  };
}, [uiDrag, projectionReady]);

  /* ================= Sign / stand move + sign resize + work area resize + export area move/resize: window pointer/mousemove ================= */
  useEffect(() => {
    const t = uiDrag?.type;
    if (
      t !== "moveSign" &&
      t !== "resizeSign" &&
      t !== "moveStand" &&
      t !== "createStand" &&
      t !== "resizeWorkArea" &&
      t !== "resizeExportArea" &&
      t !== "moveExportArea"
    ) {
      return;
    }
    if (!projectionReady && t !== "resizeWorkArea" && t !== "resizeExportArea" && t !== "moveExportArea") return;
    if ((t === "resizeWorkArea" || t === "resizeExportArea" || t === "moveExportArea") && !projectionReady) return;

    function onMove(ev) {
      const signFamilyPointer =
        uiDrag.type === "moveSign" ||
        uiDrag.type === "resizeSign" ||
        uiDrag.type === "moveStand" ||
        uiDrag.type === "createStand";
      // Some environments support PointerEvent but don't reliably emit mousemove
      // for mouse interactions. De-dupe mousemove vs pointermove for heavy overlays —
      // but never for sign drags: skipping events there makes move/resize feel sluggish.
      if (!signFamilyPointer) {
        if (ev?.type === "pointermove") lastPointerMoveTsRef.current = Date.now();
        if (ev?.type === "mousemove") {
          const dt = Date.now() - (lastPointerMoveTsRef.current || 0);
          if (dt >= 0 && dt < 50) return;
        }
      } else if (ev?.type === "pointermove") {
        lastPointerMoveTsRef.current = Date.now();
      }
      let clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
      let clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (
        ev?.type === "pointermove" &&
        (uiDrag.type === "moveSign" || uiDrag.type === "resizeSign") &&
        typeof ev.getCoalescedEvents === "function"
      ) {
        const coalesced = ev.getCoalescedEvents();
        if (coalesced?.length) {
          const last = coalesced[coalesced.length - 1];
          if (last.clientX != null && last.clientY != null) {
            clientX = last.clientX;
            clientY = last.clientY;
          }
        }
      }
      if (clientX == null || clientY == null) return;
      const p0 = clientToDivPx(clientX, clientY);
      if (!p0) return;
      const signFamilyDrag =
        uiDrag.type === "moveSign" ||
        uiDrag.type === "resizeSign" ||
        uiDrag.type === "moveStand" ||
        uiDrag.type === "createStand";
      const curPx = signFamilyDrag
        ? p0
        : { x: Math.round(p0.x), y: Math.round(p0.y) };
      // curPx is in map div pixels; all resize deltas use map-div coords only

      if (uiDrag.type === "createStand") {
        const off = uiDrag.offsetPx || { x: 0, y: 0 };
        const ll = pxToLatLng({ x: curPx.x - off.x, y: curPx.y - off.y });
        if (!ll) return;
        setUiDrag((d) => (d ? { ...d, hoverPos: ll } : d));
        return;
      }

      // rotateSign handled by dedicated rotate listener (below)

      if (uiDrag.type === "resizeWorkArea") {
        const { workAreaId, handleType, handleIndex, startPath, startPointerPx, startHandlePx } = uiDrag;
        if (!startPointerPx || !startHandlePx) return;
        // Delta-based: handle follows cursor. newHandlePx = original handle + (cursor delta)
        const dx = curPx.x - startPointerPx.x;
        const dy = curPx.y - startPointerPx.y;
        const newHandlePx = { x: startHandlePx.x + dx, y: startHandlePx.y + dy };
        const newLl = pxToLatLng(newHandlePx);
        if (!newLl) return;

        let nextPath;
        if (handleType === "corner" && startPath.length === 4) {
          nextPath = recomputeRectangleFromCornerDrag(startPath, handleIndex, newLl);
          if (!nextPath) return;
        } else if (handleType === "corner") {
          nextPath = startPath.slice();
          nextPath[handleIndex] = newLl;
        } else {
          const edgeIndex = handleIndex;
          const insertIdx = (edgeIndex + 1) % startPath.length;
          nextPath = startPath.slice();
          nextPath.splice(insertIdx, 0, newLl);
        }

        workAreaResizePendingRef.current = { workAreaId, path: nextPath };
        if (workAreaResizeRafRef.current) return;
        workAreaResizeRafRef.current = requestAnimationFrame(() => {
          workAreaResizeRafRef.current = null;
          const pending = workAreaResizePendingRef.current;
          workAreaResizePendingRef.current = null;
          if (pending) {
            setWorkAreas((prev) =>
              prev.map((a) =>
                a.id !== pending.workAreaId ? a : { ...a, path: pending.path }
              )
            );
          }
        });
        return;
      }

      if (uiDrag.type === "resizeExportArea") {
        const refData = exportResizeRef.current;
        if (!refData) return;
      
        const { handle, startPointerPx, originalRect } = refData;
        const { left: left0, top: top0, right: right0, bottom: bottom0 } = originalRect;
      
        const dx = curPx.x - startPointerPx.x;
        const dy = curPx.y - startPointerPx.y;
      
        const minW = 200;
        const minH = 150;
      
        let left = left0;
        let right = right0;
        let top = top0;
        let bottom = bottom0;
      
        switch (handle) {
          case "w": {
            left = Math.min(right0 - minW, left0 + dx);
            break;
          }
          case "e": {
            right = Math.max(left0 + minW, right0 + dx);
            break;
          }
          case "n": {
            top = Math.min(bottom0 - minH, top0 + dy);
            break;
          }
          case "s": {
            bottom = Math.max(top0 + minH, bottom0 + dy);
            break;
          }
          case "nw": {
            left = Math.min(right0 - minW, left0 + dx);
            top = Math.min(bottom0 - minH, top0 + dy);
            break;
          }
          case "ne": {
            right = Math.max(left0 + minW, right0 + dx);
            top = Math.min(bottom0 - minH, top0 + dy);
            break;
          }
          case "sw": {
            left = Math.min(right0 - minW, left0 + dx);
            bottom = Math.max(top0 + minH, bottom0 + dy);
            break;
          }
          case "se": {
            right = Math.max(left0 + minW, right0 + dx);
            bottom = Math.max(top0 + minH, bottom0 + dy);
            break;
          }
          default:
            return;
        }
      
        const nextRect = {
          x: Math.round(left),
          y: Math.round(top),
          w: Math.round(right - left),
          h: Math.round(bottom - top),
        };
      
        setExportLiveRect(nextRect);
        if (exportResizeRef.current) {
          exportResizeRef.current.lastRect = nextRect;
        }
        const b = rectPxToBounds(nextRect);
        if (b) {
          exportBoundsForPdfRef.current = b;
          setPrintAreaBounds(b);
        }
        return;
      }

      if (uiDrag.type === "moveExportArea") {
        const { startPos, startBounds, offsetPx } = uiDrag;
        const newCenterPx = { x: curPx.x - offsetPx.x, y: curPx.y - offsetPx.y };
        const nextCenter = pxToLatLng(newCenterPx);
        if (!nextCenter) return;

        const deltaLat = nextCenter.lat - startPos.lat;
        const deltaLng = nextCenter.lng - startPos.lng;

        const newNw = { lat: startBounds.nw.lat + deltaLat, lng: startBounds.nw.lng + deltaLng };
        const newSe = { lat: startBounds.se.lat + deltaLat, lng: startBounds.se.lng + deltaLng };
        const nextBounds = { nw: newNw, se: newSe };
        exportBoundsForPdfRef.current = nextBounds;
        setPrintAreaBounds(nextBounds);
        const nextRect = boundsToRectPx(nextBounds);
        if (nextRect) setExportLiveRect(nextRect);
        return;
      }

      if (uiDrag.type === "moveSign") {
        const { signId, offsetPx } = uiDrag;
        const newCenterPx = { x: curPx.x - offsetPx.x, y: curPx.y - offsetPx.y };
        const nextPos = pxToLatLng(newCenterPx);
        if (!nextPos) return;
        setPlacedSigns((prev) =>
          prev.map((s) => (s.id === signId ? { ...s, pos: nextPos } : s))
        );
      } else if (uiDrag.type === "moveStand") {
        const { signId, standId, offsetPx } = uiDrag;
        const nextPos = pxToLatLng({ x: curPx.x - offsetPx.x, y: curPx.y - offsetPx.y });
        if (!nextPos) return;
        setPlacedSigns((prev) =>
          prev.map((sig) =>
            sig.id !== signId
              ? sig
              : {
                  ...sig,
                  stands: (sig.stands || []).map((st) =>
                    st.id === standId ? { ...st, pos: nextPos } : st
                  ),
                }
          )
        );
      } else if (uiDrag.type === "resizeSign") {
        const { signId, corner, startSize, startPointerPx } = uiDrag;
        const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
        const dx = curPx.x - startPointerPx.x;
        const dy = curPx.y - startPointerPx.y;
        const rotDeg = startSize?.rotDeg ?? 0;
        const { dlx, dly } = signPointerDeltaToLocalDxDy(dx, dy, rotDeg);
        // Center-fixed resize:
        // We resize around the sign's center (pos anchor stays unchanged), so the
        // dragged corner moves by half of the width/height delta. To make the
        // corner track the cursor naturally, apply a factor of 2 to the local deltas.
        const w0f = scalePx(startSize.wPx, zRef);
        const h0f = scalePx(startSize.hPx, zRef);
        let { wf, hf } = signApplyCornerDeltaToVisualWH(corner, w0f, h0f, dlx * 2, dly * 2);
        const vmin = scalePx(28, zRef);
        const vmax = scalePx(240, zRef);
        wf = clamp(wf, vmin, vmax);
        hf = clamp(hf, vmin, vmax);

        const w = clamp(Math.round(unscalePx(wf, zRef)), 28, 240);
        const h = clamp(Math.round(unscalePx(hf, zRef)), 28, 240);

        // Only update dimensions. s.pos stays fixed during drag — the CSS translate()
        // on the sign div handles the visual corner-pinning. This prevents OverlayViewF
        // from destroying and re-creating the overlay on every mousemove frame, which
        // was causing the sign to visually detach from the blue selection boundary.
        setPlacedSigns((prev) =>
          prev.map((s) => {
            if (s.id !== signId) return s;
            return { ...s, wPx: w, hPx: h };
          })
        );
      }
    }

    // Attach both; onMove de-dupes.
    window.addEventListener("pointermove", onMove, { passive: false, capture: true });
    window.addEventListener("mousemove", onMove, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("mousemove", onMove, { capture: true });
      if (workAreaResizeRafRef.current) {
        cancelAnimationFrame(workAreaResizeRafRef.current);
        workAreaResizeRafRef.current = null;
      }
      workAreaResizePendingRef.current = null;
    };
  }, [uiDrag, projectionReady]);

  /* ================= Sign rotate: dedicated pointer/mouse listener ================= */
  useEffect(() => {
    if (!uiDrag || uiDrag.type !== "rotateSign") return;
    if (!projectionReady) return;
  
    const drag = uiDrag;
    const { centerPx } = drag;
    if (!centerPx) return;
  
    function handleMove(ev) {
      if (
        drag.pointerId != null &&
        ev?.pointerId != null &&
        ev.pointerId !== drag.pointerId
      ) {
        return;
      }
  
      // Use the latest coalesced pointer event (smoother, less jitter)
      const srcEv =
        ev?.type === "pointermove" && typeof ev.getCoalescedEvents === "function"
          ? (ev.getCoalescedEvents().slice(-1)[0] || ev)
          : ev;
  
      const clientX = srcEv.clientX ?? srcEv.touches?.[0]?.clientX;
      const clientY = srcEv.clientY ?? srcEv.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;
  
      const curPx = clientToDivPx(clientX, clientY);
      if (!curPx) return;
  
      const angleNow =
        (Math.atan2(curPx.y - centerPx.y, curPx.x - centerPx.x) * 180) / Math.PI;
  
      const live = rotateSignLiveRef.current;
      if (!live) return;
  
      let delta = angleNow - live.lastAngleDeg;
  
      // normalize to shortest path so rotation does not jump at ±180°
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
  
      live.lastAngleDeg = angleNow;
      live.accumulatedDeg += delta;
  
      const nextDeg = (drag.startAngleDeg ?? 0) + live.accumulatedDeg;
  
      setPlacedSigns((prev) =>
        prev.map((s) =>
          s.id === drag.signId ? { ...s, rotDeg: nextDeg } : s
        )
      );
  
      if (ev.cancelable) ev.preventDefault();
    }
  
    function handleUp(ev) {
      if (
        drag.pointerId != null &&
        ev?.type === "pointerup" &&
        ev.pointerId != null &&
        ev.pointerId !== drag.pointerId
      ) {
        return;
      }
  
      rotateSignLiveRef.current = null;
      lockMapInteractions(false);
      pushHistory();
      setUiDrag(null);
    }
  
    const tgt = document;
    tgt.addEventListener("pointermove", handleMove, {
      passive: false,
      capture: true,
    });
    tgt.addEventListener("pointerup", handleUp, true);
    tgt.addEventListener("pointercancel", handleUp, true);
  
    return () => {
      tgt.removeEventListener("pointermove", handleMove, true);
      tgt.removeEventListener("pointerup", handleUp, true);
      tgt.removeEventListener("pointercancel", handleUp, true);
    };
  }, [uiDrag, projectionReady, clientToDivPx, lockMapInteractions, pushHistory]);


  /* ================= Legend resize: smooth window mousemove ================= */
  useEffect(() => {
    if (!uiDrag || uiDrag.type !== "resizeLegend") return;

    function onMove(ev) {
      const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPointerPx) return;

      const { legendId, corner, startSize, startPointerPx } = uiDrag;
      const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
      const dx = curPointerPx.x - startPointerPx.x;
      const dy = curPointerPx.y - startPointerPx.y;
      const baseDx = unscalePx(dx, zRef);
      const baseDy = unscalePx(dy, zRef);

      let w = startSize.wPx;
      let h = startSize.hPx;

      if (corner === "se") {
        w = startSize.wPx + baseDx;
        h = startSize.hPx + baseDy;
      }
      if (corner === "sw") {
        w = startSize.wPx - baseDx;
        h = startSize.hPx + baseDy;
      }
      if (corner === "ne") {
        w = startSize.wPx + baseDx;
        h = startSize.hPx - baseDy;
      }
      if (corner === "nw") {
        w = startSize.wPx - baseDx;
        h = startSize.hPx - baseDy;
      }
      // ✅ side handles (bars)
if (corner === "e") w = startSize.wPx + baseDx;
if (corner === "w") w = startSize.wPx - baseDx;
if (corner === "s") h = startSize.hPx + baseDy;
if (corner === "n") h = startSize.hPx - baseDy;
      w = clamp(w, 140, 600);
      h = clamp(h, 120, 600);

      setLegendBoxes((prev) =>
        prev.map((lb) => (lb.id === legendId ? { ...lb, wPx: w, hPx: h } : lb))
      );
    }

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [uiDrag]);

  /* ================= Title move/resize: smooth window mousemove ================= */
  useEffect(() => {
    if (!uiDrag) return;
    if (uiDrag.type !== "moveTitle" && uiDrag.type !== "resizeTitle") return;

    function onMove(ev) {
      const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPointerPx) return;

      const dx = curPointerPx.x - uiDrag.startPointerPx.x;
      const dy = curPointerPx.y - uiDrag.startPointerPx.y;

      if (uiDrag.type === "moveTitle") {
        const { titleId, startBox } = uiDrag;
        setTitleBoxes((prev) =>
          prev.map((tb) =>
            tb.id === titleId
              ? { ...tb, x: startBox.x + dx, y: startBox.y + dy }
              : tb
          )
        );
        return;
      }

      if (uiDrag.type === "resizeTitle") {
        const { titleId, corner, startBox } = uiDrag;

        let x = startBox.x;
        let y = startBox.y;
        let w = startBox.w;
        let h = startBox.h;

        if (corner === "se") {
          w = startBox.w + dx;
          h = startBox.h + dy;
        }
        if (corner === "sw") {
          x = startBox.x + dx;
          w = startBox.w - dx;
          h = startBox.h + dy;
        }
        if (corner === "ne") {
          y = startBox.y + dy;
          w = startBox.w + dx;
          h = startBox.h - dy;
        }
        if (corner === "nw") {
          x = startBox.x + dx;
          y = startBox.y + dy;
          w = startBox.w - dx;
          h = startBox.h - dy;
        }

        w = clamp(w, 420, 1400);
        h = clamp(h, 110, 700);

        let logoW = startBox.logoW;
        logoW = clamp(logoW, 80, Math.floor(w * 0.4));

        setTitleBoxes((prev) =>
          prev.map((tb) =>
            tb.id === titleId ? { ...tb, x, y, w, h, logoW } : tb
          )
        );
      }
    }

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [uiDrag]);
  
/* ================= TABLE: resize / rotate (outer box) ================= */
useEffect(() => {
  if (!uiDrag) return;
  if (uiDrag.type !== "resizeTable" && uiDrag.type !== "rotateTable") return;

  function onMove(ev) {
    const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
    if (!curPointerPx) return;

    // ---------- ROTATE TABLE ----------
    if (uiDrag.type === "rotateTable") {
      const { id, centerPx, startAngleDeg, startPointerAngleDeg } = uiDrag;

      const angleNow =
        (Math.atan2(curPointerPx.y - centerPx.y, curPointerPx.x - centerPx.x) * 180) /
        Math.PI;

      let nextDeg = startAngleDeg + (angleNow - startPointerAngleDeg);

      setInsertObjects((prev) =>
        prev.map((o) => (o.id === id && o.kind === "table" ? { ...o, rotDeg: nextDeg } : o))
      );
      return;
    }

    // ---------- RESIZE TABLE ----------
    if (uiDrag.type === "resizeTable") {
      const { id, corner, startSize, startPointerPx, startCols, startRows } = uiDrag;
      const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;

      const dx = curPointerPx.x - startPointerPx.x;
      const dy = curPointerPx.y - startPointerPx.y;

      // Work in screen pixels (box displays at scalePx), then convert to base
      const startVisualW = scalePx(startSize.wPx, zRef);
      const startVisualH = scalePx(startSize.hPx, zRef);

      let visualW = startVisualW;
      let visualH = startVisualH;

      if (corner === "se") { visualW = startVisualW + dx; visualH = startVisualH + dy; }
      if (corner === "sw") { visualW = startVisualW - dx; visualH = startVisualH + dy; }
      if (corner === "ne") { visualW = startVisualW + dx; visualH = startVisualH - dy; }
      if (corner === "nw") { visualW = startVisualW - dx; visualH = startVisualH - dy; }
      if (corner === "e")  { visualW = startVisualW + dx; }
      if (corner === "w")  { visualW = startVisualW - dx; }
      if (corner === "s")  { visualH = startVisualH + dy; }
      if (corner === "n")  { visualH = startVisualH - dy; }

      visualW = clamp(visualW, scalePx(220, zRef), scalePx(1400, zRef));
      visualH = clamp(visualH, scalePx(140, zRef), scalePx(900, zRef));

      const w = unscalePx(visualW, zRef);
      const h = unscalePx(visualH, zRef);

      // scale columns/rows so the grid fits new w/h
      const sumCols = (startCols || []).reduce((a, b) => a + b, 0) || 1;
      const sumRows = (startRows || []).reduce((a, b) => a + b, 0) || 1;

      const colScale = w / sumCols;
      const rowScale = h / sumRows;

      const nextCols = (startCols || []).map((cw) => Math.max(40, cw * colScale));
      const nextRows = (startRows || []).map((rh) => Math.max(32, rh * rowScale));

      setInsertObjects((prev) =>
        prev.map((o) => {
          if (o.id !== id || o.kind !== "table") return o;
          return {
            ...o,
            wPx: w,
            hPx: h,
            colWidths: nextCols,
            rowHeights: nextRows,
          };
        })
      );
    }
  }

  function onUp() {
    setUiDrag(null);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}, [uiDrag, setInsertObjects, zoomNow]);

  /* ================= Manifest resize: smooth window mousemove ================= */
  useEffect(() => {
    if (!uiDrag || uiDrag.type !== "resizeManifest") return;

    function onMove(ev) {
      const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPointerPx) return;

      const { manifestId, corner, startSize, startPointerPx } = uiDrag;
      const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
      const dx = curPointerPx.x - startPointerPx.x;
      const dy = curPointerPx.y - startPointerPx.y;
      const baseDx = unscalePx(dx, zRef);
      const baseDy = unscalePx(dy, zRef);

      let w = startSize.wPx;
      let h = startSize.hPx;

      if (corner === "se") {
        w = startSize.wPx + baseDx;
        h = startSize.hPx + baseDy;
      }
      if (corner === "sw") {
        w = startSize.wPx - baseDx;
        h = startSize.hPx + baseDy;
      }
      if (corner === "ne") {
        w = startSize.wPx + baseDx;
        h = startSize.hPx - baseDy;
      }
      if (corner === "nw") {
        w = startSize.wPx - baseDx;
        h = startSize.hPx - baseDy;
      }
      // ✅ side handles (bars)
if (corner === "e") w = startSize.wPx + baseDx;
if (corner === "w") w = startSize.wPx - baseDx;
if (corner === "s") h = startSize.hPx + baseDy;
if (corner === "n") h = startSize.hPx - baseDy;
      w = clamp(w, 160, 700);
      h = clamp(h, 140, 700);

      setManifestBoxes((prev) =>
        prev.map((mb) =>
          mb.id === manifestId ? { ...mb, wPx: w, hPx: h } : mb
        )
      );
    }

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [uiDrag]);

  /* ================= Scale resize + move: smooth window mousemove ================= */
  useEffect(() => {
    if (!uiDrag || (uiDrag.type !== "resizeScale" && uiDrag.type !== "moveScale")) return;

    function onMove(ev) {
      const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPointerPx) return;

      if (uiDrag.type === "resizeScale") {
        const { id, corner, startSize, startPointerPx } = uiDrag;
        const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
        const dx = curPointerPx.x - startPointerPx.x;
        const dy = curPointerPx.y - startPointerPx.y;
        const baseDx = unscalePx(dx, zRef);
        const baseDy = unscalePx(dy, zRef);
        let w = startSize.wPx;
        let h = startSize.hPx;
        if (corner === "se") { w = startSize.wPx + baseDx; h = startSize.hPx + baseDy; }
        if (corner === "sw") { w = startSize.wPx - baseDx; h = startSize.hPx + baseDy; }
        if (corner === "ne") { w = startSize.wPx + baseDx; h = startSize.hPx - baseDy; }
        if (corner === "nw") { w = startSize.wPx - baseDx; h = startSize.hPx - baseDy; }
        if (corner === "e") w = startSize.wPx + baseDx;
        if (corner === "w") w = startSize.wPx - baseDx;
        if (corner === "s") h = startSize.hPx + baseDy;
        if (corner === "n") h = startSize.hPx - baseDy;
        w = clamp(w, 200, 900);
        h = clamp(h, 90, 300);
        setScales((prev) => prev.map((s) => (s.id === id ? { ...s, wPx: w, hPx: h } : s)));
        return;
      }

      if (uiDrag.type === "moveScale") {
        const { scaleId, startGrabPx, startPos } = uiDrag;
        // dx/dy = how far pointer has moved since grab — element center follows same delta
        const dx = curPointerPx.x - startGrabPx.x;
        const dy = curPointerPx.y - startGrabPx.y;
        const startPosPx = latLngToPx(startPos);
        if (!startPosPx) return;
        const nextPos = pxToLatLng({ x: startPosPx.x + dx, y: startPosPx.y + dy });
        if (!nextPos) return;
        setScales((prev) => prev.map((s) => (s.id === scaleId ? { ...s, pos: nextPos } : s)));
      }
    }

    function onUp() { setUiDrag(null); lockMapInteractions(false); }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [uiDrag]);

  // ── Window-level move handler for legend / manifest / north arrow / insert ──
  // Uses clientToDivPx (screen pixels) for BOTH start and current — same coord
  // system as moveScale — so no projection-space mismatch and no corner-jump.
  useEffect(() => {
    if (!uiDrag) return;
    const TYPES = ["moveLegend", "moveManifest", "moveNorthArrow", "moveInsert"];
    if (!TYPES.includes(uiDrag.type)) return;

    function onMove(ev) {
      const curPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPx) return;
      const { startGrabPx, startPos } = uiDrag;
      const dx = curPx.x - startGrabPx.x;
      const dy = curPx.y - startGrabPx.y;
      const startPosPx = latLngToPx(startPos);
      if (!startPosPx) return;
      const nextPos = pxToLatLng({ x: startPosPx.x + dx, y: startPosPx.y + dy });
      if (!nextPos) return;

      if (uiDrag.type === "moveLegend") {
        setLegendBoxes((prev) => prev.map((lb) => lb.id === uiDrag.legendId ? { ...lb, pos: nextPos } : lb));
      } else if (uiDrag.type === "moveManifest") {
        setManifestBoxes((prev) => prev.map((mb) => mb.id === uiDrag.manifestId ? { ...mb, pos: nextPos } : mb));
      } else if (uiDrag.type === "moveNorthArrow") {
        setNorthArrows((prev) => prev.map((na) => na.id === uiDrag.arrowId ? { ...na, pos: nextPos } : na));
      } else if (uiDrag.type === "moveInsert") {
        setInsertObjects((prev) => prev.map((o) => {
          if (o.id !== uiDrag.insertId) return o;
          if ("pos" in o) return { ...o, pos: nextPos };
          if ("position" in o) return { ...o, position: nextPos };
          return { ...o, pos: nextPos };
        }));
      }
    }
    function onUp() { setUiDrag(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [uiDrag]);

  useEffect(() => {
    if (!uiDrag || uiDrag.type !== "resizePageFrame") return;

    const MIN_W = 260;
    const MIN_H = 200;

    function onMove(ev) {
      const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
      if (!curPointerPx) return;

      const { corner, startSize, startPointerPx, centerPx } = uiDrag;
      const dx = curPointerPx.x - startPointerPx.x;
      const dy = curPointerPx.y - startPointerPx.y;

      let w = startSize.wPx;
      let h = startSize.hPx;

      // Page frame rect is in current zoom pixels; we convert to lat/lng bounds, so use dx/dy (not base)
      if (corner === "se") { w = startSize.wPx + dx; h = startSize.hPx + dy; }
      if (corner === "sw") { w = startSize.wPx - dx; h = startSize.hPx + dy; }
      if (corner === "ne") { w = startSize.wPx + dx; h = startSize.hPx - dy; }
      if (corner === "nw") { w = startSize.wPx - dx; h = startSize.hPx - dy; }
      if (corner === "e") w = startSize.wPx + dx;
      if (corner === "w") w = startSize.wPx - dx;
      if (corner === "s") h = startSize.hPx + dy;
      if (corner === "n") h = startSize.hPx - dy;

      w = clamp(w, MIN_W, 1200);
      h = clamp(h, MIN_H, 900);

      // Center shift so opposite corner stays fixed (same as picture/insert box)
      const shiftDx = (w - startSize.wPx) / 2;
      const shiftDy = (h - startSize.hPx) / 2;
      let shiftX = 0, shiftY = 0;
      if (corner === "se") { shiftX = shiftDx; shiftY = shiftDy; }
      if (corner === "sw") { shiftX = -shiftDx; shiftY = shiftDy; }
      if (corner === "ne") { shiftX = shiftDx; shiftY = -shiftDy; }
      if (corner === "nw") { shiftX = -shiftDx; shiftY = -shiftDy; }
      if (corner === "e") shiftX = shiftDx;
      if (corner === "w") shiftX = -shiftDx;
      if (corner === "s") shiftY = shiftDy;
      if (corner === "n") shiftY = -shiftDy;

      const nextCenterPx = { x: centerPx.x + shiftX, y: centerPx.y + shiftY };
      const rect = {
        x: Math.round(nextCenterPx.x - w / 2),
        y: Math.round(nextCenterPx.y - h / 2),
        w: Math.round(w),
        h: Math.round(h),
      };
      const b = rectPxToBounds(rect);
      if (b) setPageFrameBounds(b);
    }

    function onUp() {
      lockMapInteractions(false);
      setUiDrag(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [uiDrag]);

/* ================= Insert resize: smooth window mousemove ================= */
useEffect(() => {
  if (!uiDrag || uiDrag.type !== "resizeInsert") return;

  function onMove(ev) {
    const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
    if (!curPointerPx) return;

    const { id, corner, startSize, startPointerPx } = uiDrag;
    const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
    const dx = curPointerPx.x - startPointerPx.x;
    const dy = curPointerPx.y - startPointerPx.y;
    const baseDx = unscalePx(dx, zRef);
    const baseDy = unscalePx(dy, zRef);

    let w = startSize.wPx;
    let h = startSize.hPx;

    if (corner === "se") { w = startSize.wPx + baseDx; h = startSize.hPx + baseDy; }
    if (corner === "sw") { w = startSize.wPx - baseDx; h = startSize.hPx + baseDy; }
    if (corner === "ne") { w = startSize.wPx + baseDx; h = startSize.hPx - baseDy; }
    if (corner === "nw") { w = startSize.wPx - baseDx; h = startSize.hPx - baseDy; }

    // basic limits
    w = clamp(w, 60, 1200);
    h = clamp(h, 40, 900);

    setInsertObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;

        // We only resize these types (your request)
        if (o.kind !== "textbox" && o.kind !== "text" && o.kind !== "rect") return o;

        return { ...o, wPx: w, hPx: h };
      })
    );
  }

  function onUp() {
    // drag ends by your existing mouseup that sets uiDrag null
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}, [uiDrag]);

  /* ================= North Arrow resize: smooth window mousemove ================= */
useEffect(() => {
  if (!uiDrag || uiDrag.type !== "resizeNorthArrow") return;

  function onMove(ev) {
    const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
    if (!curPointerPx) return;

    const { arrowId, corner, startSize, startPointerPx } = uiDrag;
    const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;
    const dx = curPointerPx.x - startPointerPx.x;
    const dy = curPointerPx.y - startPointerPx.y;
    const baseDx = unscalePx(dx, zRef);
    const baseDy = unscalePx(dy, zRef);

    let w = startSize.wPx;
    let h = startSize.hPx;

    if (corner === "se") {
      w = startSize.wPx + baseDx;
      h = startSize.hPx + baseDy;
    }
    if (corner === "sw") {
      w = startSize.wPx - baseDx;
      h = startSize.hPx + baseDy;
    }
    if (corner === "ne") {
      w = startSize.wPx + baseDx;
      h = startSize.hPx - baseDy;
    }
    if (corner === "nw") {
      w = startSize.wPx - baseDx;
      h = startSize.hPx - baseDy;
    }
    // ✅ side handles (bars)
if (corner === "e") w = startSize.wPx + baseDx;
if (corner === "w") w = startSize.wPx - baseDx;
if (corner === "s") h = startSize.hPx + baseDy;
if (corner === "n") h = startSize.hPx - baseDy;
    w = clamp(w, 40, 400);
    h = clamp(h, 40, 400);

    setNorthArrows((prev) =>
      prev.map((na) => (na.id === arrowId ? { ...na, wPx: w, hPx: h } : na))
    );
  }

  window.addEventListener("mousemove", onMove);
  return () => window.removeEventListener("mousemove", onMove);
}, [uiDrag]);

/* ================= Insert resize/rotate: smooth window mousemove ================= */
useEffect(() => {
  if (!uiDrag) return;
  if (uiDrag.type !== "resizeInsert" && uiDrag.type !== "rotateInsert") return;

  function onMove(ev) {
    const curPointerPx = clientToDivPx(ev.clientX, ev.clientY);
    if (!curPointerPx) return;

    // --- ROTATE (stable 360) ---
    if (uiDrag.type === "rotateInsert") {
      const { insertId, centerPx, startAngleDeg, startPointerAngleDeg } = uiDrag;

      const angleNow = angleDeg(curPointerPx, centerPx);
      const delta = normDeltaDeg(angleNow - startPointerAngleDeg);
      let nextDeg = startAngleDeg + delta;

      // keep it tidy (optional)
      nextDeg = ((nextDeg % 360) + 360) % 360;

      setInsertObjects((prev) =>
        prev.map((o) => (o.id === insertId ? { ...o, rotDeg: nextDeg } : o))
      );
      return;
    }

    // --- RESIZE (works correctly when rotated; uses scalePx/unscalePx for zoom) ---
    if (uiDrag.type === "resizeInsert") {
      const { insertId, corner, startSize, startPointerPx, centerPx, startRotDeg } = uiDrag;
      const zRef = startSize?.zRef ?? ELEMENT_BASE_ZOOM;

      // convert screen pointer movement into the object's local (unrotated) space
      const p0 = rotatePt(startPointerPx, centerPx, -startRotDeg);
      const p1 = rotatePt(curPointerPx, centerPx, -startRotDeg);

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;

      // Work in screen pixels (box displays at scalePx), then convert to base
      const startVisualW = scalePx(startSize.wPx, zRef);
      const startVisualH = scalePx(startSize.hPx, zRef);

      let visualW = startVisualW;
      let visualH = startVisualH;

      if (corner === "se") { visualW = startVisualW + dx; visualH = startVisualH + dy; }
      if (corner === "sw") { visualW = startVisualW - dx; visualH = startVisualH + dy; }
      if (corner === "ne") { visualW = startVisualW + dx; visualH = startVisualH - dy; }
      if (corner === "nw") { visualW = startVisualW - dx; visualH = startVisualH - dy; }

      if (corner === "e")  { visualW = startVisualW + dx; }
      if (corner === "w")  { visualW = startVisualW - dx; }
      if (corner === "s")  { visualH = startVisualH + dy; }
      if (corner === "n")  { visualH = startVisualH - dy; }

      const obj0 = insertObjects.find((o) => o.id === insertId);
      const minBaseW = obj0?.kind === "title_box" ? 360 : 120;
      const minBaseH = obj0?.kind === "title_box" ? 120 : 80;
      const minVisualW = scalePx(minBaseW, zRef);
      const minVisualH = scalePx(minBaseH, zRef);
      visualW = clamp(visualW, minVisualW, 1400);
      visualH = clamp(visualH, minVisualH, 900);

      const w = unscalePx(visualW, zRef);
      const h = unscalePx(visualH, zRef);

      // Center shift so opposite side stays put
      const shiftDx = (visualW - startVisualW) / 2;
      const shiftDy = (visualH - startVisualH) / 2;
      let shiftLocal = { x: 0, y: 0 };
      if (corner === "se") shiftLocal = { x: shiftDx,  y: shiftDy };
      if (corner === "sw") shiftLocal = { x: -shiftDx, y: shiftDy };
      if (corner === "ne") shiftLocal = { x: shiftDx,  y: -shiftDy };
      if (corner === "nw") shiftLocal = { x: -shiftDx, y: -shiftDy };
      if (corner === "e")  shiftLocal = { x: shiftDx,  y: 0 };
      if (corner === "w")  shiftLocal = { x: -shiftDx, y: 0 };
      if (corner === "s")  shiftLocal = { x: 0, y: shiftDy };
      if (corner === "n")  shiftLocal = { x: 0, y: -shiftDy };

      const shiftWorld = rotatePt(shiftLocal, { x: 0, y: 0 }, startRotDeg);
      const nextCenterPx = { x: centerPx.x + shiftWorld.x, y: centerPx.y + shiftWorld.y };
      const nextPos = pxToLatLng(nextCenterPx);

      setInsertObjects((prev) =>
        prev.map((o) => {
          if (o.id !== insertId) return o;

          // allow resize for ALL requested kinds (incl picture)
          if (
  o.kind !== "textbox" &&
  o.kind !== "text" &&
  o.kind !== "rect" &&
  o.kind !== "picture" &&
  o.kind !== "title_box"
) return o;

          const z = o.zRef ?? ELEMENT_BASE_ZOOM;
          // Keep center fixed for title_box, textbox, text, rect, picture to prevent jump (resize from center)
          const keepCenterFixed =
            o.kind === "title_box" || o.kind === "textbox" || o.kind === "text" || o.kind === "rect" || o.kind === "picture";
          const newPos = keepCenterFixed ? o.pos : (nextPos ?? o.pos);
          if (o.kind === "text") return { ...o, pos: newPos, wPx: w, hPx: Math.max(30 / zoomScale(z), h) };

          return { ...o, pos: newPos, wPx: w, hPx: h };
        })
      );
    }
  }

  function onUp() {
    setUiDrag(null);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}, [uiDrag, setInsertObjects, insertObjects, zoomNow]);


  /* ================= Pan/cursor ================= */
  const isAnyDrawing = conesIsDrawing || measIsDrawing;
  const isAnyEditing = !!uiDrag;


const mapCursor =
  isConesToolActive ||
  isMeasToolActive ||
  isSignsToolActive ||
  isTitleToolActive ||
  isNorthArrowToolActive ||
  isInsertToolActive ||
  activeTool === "work_area"
    ? PENCIL_CURSOR
    : "grab";





  /* ================= Ribbon highlights ================= */
  const conesHighlighted = activeTab === "Plan Elements" && isConesToolActive;
  const measHighlighted = activeTab === "Plan Elements" && isMeasToolActive;
  const signsHighlighted = activeTab === "Plan Elements" && isSignsToolActive;

  /* ================= Preview paths ================= */
  const conesPreviewPath = useMemo(() => {
    if (!conesIsDrawing) return null;
    if (!conesHoverPoint) return conesVerticesState;
    return [...conesVerticesState, conesHoverPoint];
  }, [conesIsDrawing, conesVerticesState, conesHoverPoint]);

  const measPreviewPath = useMemo(() => {
    if (!measIsDrawing) return null;
    if (!measHoverPoint) return measVerticesState;
    return [...measVerticesState, measHoverPoint];
  }, [measIsDrawing, measVerticesState, measHoverPoint]);

  /* ================= Signs filtered ================= */
  const filteredSigns = useMemo(() => {
    const q = signSearch.trim().toLowerCase();
    if (!q) return SIGN_ITEMS;
    return SIGN_ITEMS.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        (s.name || "").toLowerCase().includes(q)
    );
    }, [signSearch]);

  function normalizeSignCode(raw) {
    if (!raw) return "";
    let code = String(raw).trim();
    code = code.replace(/\.(svg|png|jpe?g|webp)$/i, "");
    code = code.replace(/\s*\(\d+\)\s*$/, "");
    return code;
  }

  /* ================= Manifest rows ================= */
  const CONE_LABEL = {
    barrel: "Barrel",
    barrier: "Barrier",
    bollard: "Bollard",
    cone: "Cone",
    ped_tape: "Pedestrian Tape",
    type1: "Type 1 Barricade",
    type2: "Type 2 Barricade",
  };

  const manifestRows = useMemo(() => {
    const rows = [];

    const signCounts = {};
    for (const s of placedSigns) {
      signCounts[s.code] = (signCounts[s.code] || 0) + 1;
    }

    const coneCounts = {};
    for (const f of conesFeatures) {
      if (f.typeId === "barrier" || f.typeId === "ped_tape") {
        coneCounts[f.typeId] = (coneCounts[f.typeId] || 0) + 1;
        continue;
      }
      const markers = projectionReady ? sampleConesMarkersForPath(f.path, f.typeId) : [];
      coneCounts[f.typeId] = (coneCounts[f.typeId] || 0) + markers.length;
    }

    Object.keys(coneCounts).forEach((k) => {
      rows.push({ label: CONE_LABEL[k] || k, count: coneCounts[k] });
    });
    Object.keys(signCounts).forEach((code) => {
      rows.push({ label: code, count: signCounts[code] });
    });

    return rows.filter((r) => r.count > 0);
  }, [placedSigns, conesFeatures, projectionReady]);

  /* ================= helpers for selecting & drags ================= */
  const onSelectSign = (id) => {
    // If user clicks an existing sign while the Signs tool is active,
    // disable placement so the click/drag doesn't place a new sign on the map.
    setActiveTool(null);
    setSignsPanelOpen(false);
    setSelectedEntity({ kind: "sign", id });
  };
  const onSelectStand = (signId, standId) => {
    // Enter stand editing mode: clear any active sign placement tool
    setActiveTool(null);
    setSignsPanelOpen(false);
    setSelectedEntity({ kind: "stand", signId, standId });
  };
  const onSelectLegend = (id) => setSelectedEntity({ kind: "legend", id });
  const onSelectManifest = (id) => setSelectedEntity({ kind: "manifest", id });
  const onSelectTitle = (id) => setSelectedEntity({ kind: "title", id });
  const onSelectNorthArrow = (id) => {
  setSelectedInsertId(null);   // closes Title/Insert ribbon
  setEditingInsertId(null);
  setEditingCell(null);
  setSelectedEntity({ kind: "northArrow", id });
};



const beginMoveNorthArrow = (arrowId, startLatLng, grabClientPt) => {
  if (!projectionReady) return;
  const centerPx = latLngToPx(startLatLng);
  if (!centerPx) return;
  const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
  if (!grabPx) return;
  setUiDrag({
    type: "moveNorthArrow",
    arrowId,
    startGrabPx: grabPx,
    startPos: startLatLng,
  });
};
function makeInsertObject(kind, pos) {
  const id = crypto.randomUUID();

    
    if (kind === "comment") {
    return {
      id,
      kind,
      pos,
      wPx: 260,
      hPx: 160,
      rotDeg: 0,
      text: "Write a comment...",
    };
  }

  if (kind === "line") {
    // line handled separately via draft (below)
    return null;
  }

  if (kind === "textbox") {
  return {
    id,
    kind,
    pos,
    wPx: 240,
    hPx: 90,
    rotDeg: 0,
    zRef: ELEMENT_BASE_ZOOM,
    text: "Double click to edit",
    fontSize: 18,
    fontFamily: "Arial",
    bg: "#ffffff",
    color: "#111111",
    border: "#111827",
    borderWidth: 1,
  };
}

  if (kind === "text") {
  return {
    id,
    kind,
    pos,
    wPx: 220,
    hPx: 60,
    rotDeg: 0,
    zRef: ELEMENT_BASE_ZOOM,
    text: "Double click to edit",
    fontSize: 22,
    fontFamily: "Arial",
    color: "#111111",
  };
}

  if (kind === "table") {
    const rows = 3;
    const cols = 3;

    return {
      id,
      kind,
      pos,
      wPx: 360,
      hPx: 200,
      rotDeg: 0,

      rows,
      cols,

      // cell text stored as "r-c" => string
      cells: {},

      // column widths in px
      colWidths: Array(cols).fill(120),

      // row heights in px
      rowHeights: Array(rows).fill(48),
    };
  }

  if (kind === "rect") {
  return {
    id,
    kind,
    pos,
    wPx: 220,
    hPx: 140,
    rotDeg: 0,
    zRef: ELEMENT_BASE_ZOOM,
    fill: "rgba(37,99,235,0.25)",
    stroke: "rgba(37,99,235,0.9)",
    strokeWidth: 2,
    text: "",
    fontSize: 18,
    fontFamily: "Arial",
    color: "#111111",
  };
}


  return null;
}

const beginResizeNorthArrow = (arrowId, corner, clientPt, startSize) => {
  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;
  setUiDrag({
    type: "resizeNorthArrow",
    arrowId,
    corner,
    startSize,
    startPointerPx,
  });
};
const beginResizeScale = (id, corner, clientPt, startSize) => {
  if (!projectionReady) return;
  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;
  lockMapInteractions(true);
  setUiDrag({
    type: "resizeScale",
    id,
    corner, // "nw","n","ne","e","se","s","sw","w"
    startSize, // { wPx, hPx }
    startPointerPx,
  });
};

const beginMoveScale = (scaleId, startLatLng, grabClientPt) => {
  if (!projectionReady) return;
  const centerPx = latLngToPx(startLatLng);
  if (!centerPx) return;
  // Record where the user actually grabbed (not element center) so there's no snap-jump
  const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
  if (!grabPx) return;
  lockMapInteractions(true);
  setUiDrag({
    type: "moveScale",
    scaleId,
    startGrabPx: grabPx,   // pointer position at drag start
    startPos: startLatLng,  // element center as lat/lng
  });
};

// =================== CONTEXT MENU HELPERS ===================
const openContextMenu = (e, entityType, entityId, typeId = null) => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({ x: e.clientX, y: e.clientY, entityType, entityId, typeId });
};
const closeContextMenu = () => setContextMenu(null);

const _getEntityData = (entityType, entityId) => {
  switch (entityType) {
    case "sign":        return placedSigns.find(s => s.id === entityId);
    case "cones":       return conesFeatures.find(f => f.id === entityId);
    case "workArea":    return workAreas.find(w => w.id === entityId);
    case "measurement": return measurements.find(m => m.id === entityId);
    case "insert":      return insertObjects.find(o => o.id === entityId);
    case "northArrow":  return northArrows.find(n => n.id === entityId);
    case "scale":       return scales.find(s => s.id === entityId);
    case "legend":      return legendBoxes.find(l => l.id === entityId);
    case "manifest":    return manifestBoxes.find(m => m.id === entityId);
    default:            return null;
  }
};

const handleContextCopy = () => {
  if (!contextMenu) return;
  const data = _getEntityData(contextMenu.entityType, contextMenu.entityId);
  if (data) setClipboard({ kind: contextMenu.entityType, data: { ...data } });
  closeContextMenu();
};

const handleContextCut = () => {
  if (!contextMenu) return;
  const { entityType, entityId } = contextMenu;
  const data = _getEntityData(entityType, entityId);
  if (data) setClipboard({ kind: entityType, data: { ...data } });
  switch (entityType) {
    case "sign":        setPlacedSigns(prev => prev.filter(x => x.id !== entityId)); break;
    case "cones":       setConesFeatures(prev => prev.filter(x => x.id !== entityId)); break;
    case "workArea":    setWorkAreas(prev => prev.filter(x => x.id !== entityId)); break;
    case "measurement": setMeasurements(prev => prev.filter(x => x.id !== entityId)); break;
    case "insert":      setInsertObjects(prev => prev.filter(x => x.id !== entityId)); break;
    case "northArrow":  setNorthArrows(prev => prev.filter(x => x.id !== entityId)); break;
    case "scale":       setScales(prev => prev.filter(x => x.id !== entityId)); break;
    case "legend":      setLegendBoxes(prev => prev.filter(x => x.id !== entityId)); break;
    case "manifest":    setManifestBoxes(prev => prev.filter(x => x.id !== entityId)); break;
    default: break;
  }
  closeContextMenu();
};

const handleContextPaste = (cb) => {
  const { kind, data } = cb || {};
  if (!kind || !data) return;
  const newId = crypto.randomUUID();

  // Paste at current cursor position if possible, else fall back to small offset
  const cursorDivPx = clientToDivPx(lastMousePosRef.current.x, lastMousePosRef.current.y);
  const cursorLatLng = cursorDivPx ? pxToLatLng(cursorDivPx) : null;

  const d = 0.00005;
  // For point elements: place center at cursor
  const atCursor = (pos) => cursorLatLng ?? (pos ? { lat: pos.lat + d, lng: pos.lng + d } : pos);
  // For path elements: shift centroid to cursor
  const shiftPath = (path) => {
    if (!Array.isArray(path)) return path;
    if (cursorLatLng) {
      const cLat = path.reduce((s, p) => s + p.lat, 0) / path.length;
      const cLng = path.reduce((s, p) => s + p.lng, 0) / path.length;
      const dLat = cursorLatLng.lat - cLat;
      const dLng = cursorLatLng.lng - cLng;
      return path.map(p => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
    }
    return path.map(p => ({ lat: p.lat + d, lng: p.lng + d }));
  };

  switch (kind) {
    case "sign":        setPlacedSigns(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos) }]); break;
    case "cones":       setConesFeatures(prev => [...prev, { ...data, id: newId, path: shiftPath(data.path) }]); break;
    case "workArea":    setWorkAreas(prev => [...prev, { ...data, id: newId, path: shiftPath(data.path) }]); break;
    case "measurement": setMeasurements(prev => [...prev, { ...data, id: newId, path: shiftPath(data.path) }]); break;
    case "insert":      setInsertObjects(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos || data.position) }]); break;
    case "northArrow":  setNorthArrows(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos) }]); break;
    case "scale":       setScales(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos) }]); break;
    case "legend":      setLegendBoxes(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos) }]); break;
    case "manifest":    setManifestBoxes(prev => [...prev, { ...data, id: newId, pos: atCursor(data.pos) }]); break;
    default: break;
  }
};

const handleLegendToggle = (typeId) => {
  if (!typeId) { closeContextMenu(); return; }
  setLegendExclusions(prev => {
    const next = new Set(prev);
    if (next.has(typeId)) next.delete(typeId); else next.add(typeId);
    return next;
  });
  closeContextMenu();
};
// ============================================================

  const beginMoveSign = (signId, startLatLng, grabClientPt) => {
    if (!projectionReady) return;
  // Use the map anchor (OverlayViewF center) so move offset is consistent even when
  // the sign is rotated (DOM bounding boxes change under CSS transforms).
  const centerPx = latLngToPx(startLatLng);
  if (!centerPx) return;

  const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
  if (!grabPx) return;

  const offsetPx = { x: grabPx.x - centerPx.x, y: grabPx.y - centerPx.y };
  lockMapInteractions(true);
  setUiDrag({
    type: "moveSign",
    signId,
    startPos: startLatLng,
    centerPx,
    offsetPx,
  });
  };

  const beginMoveLegend = (legendId, startLatLng, grabClientPt) => {
    if (!projectionReady) return;
    const centerPx = latLngToPx(startLatLng);
    if (!centerPx) return;
    const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
    if (!grabPx) return;
    setUiDrag({
      type: "moveLegend",
      legendId,
      startGrabPx: grabPx,
      startPos: startLatLng,
    });
  };

  const beginResizeLegend = (legendId, corner, clientPt, startSize) => {
    if (!projectionReady) return;
    const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
    if (!startPointerPx) return;
    setUiDrag({
      type: "resizeLegend",
      legendId,
      corner,
      startSize,
      startPointerPx,
    });
  };

  const beginMoveManifest = (manifestId, startLatLng, grabClientPt) => {
    if (!projectionReady) return;
    const centerPx = latLngToPx(startLatLng);
    if (!centerPx) return;
    const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
    if (!grabPx) return;
    setUiDrag({
      type: "moveManifest",
      manifestId,
      startGrabPx: grabPx,
      startPos: startLatLng,
    });
  };

  const beginResizeManifest = (manifestId, corner, clientPt, startSize) => {
    if (!projectionReady) return;
    const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
    if (!startPointerPx) return;
    setUiDrag({
      type: "resizeManifest",
      manifestId,
      corner,
      startSize,
      startPointerPx,
    });
  };

  const beginMoveTitle = (titleId, clientPt, startBox) => {
    const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
    if (!startPointerPx) return;
    setUiDrag({
      type: "moveTitle",
      titleId,
      startPointerPx,
      startBox,
    });
  };

  const beginResizeTitle = (titleId, corner, clientPt, startBox) => {
    const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
    if (!startPointerPx) return;
    setUiDrag({
      type: "resizeTitle",
      titleId,
      corner,
      startPointerPx,
      startBox,
    });
  };
  const onSelectScale = (id) => setSelectedEntity({ kind: "scale", id });


// ================= Insert object move (drag) =================
const beginMoveInsert = (insertId, startLatLng, grabClientPt) => {
  if (!projectionReady) return;
  if (!startLatLng) return;
  const centerPx = latLngToPx(startLatLng);
  if (!centerPx) return;
  const grabPx = grabClientPt ? clientToDivPx(grabClientPt.x, grabClientPt.y) : centerPx;
  if (!grabPx) return;
  setUiDrag({
    type: "moveInsert",
    insertId,
    startGrabPx: grabPx,
    startPos: startLatLng,
  });
};
// ================= Insert object resize (smooth like Word) =================
const getInsertBoxPx = (insertId) => {
  const map = mapRef.current;
  if (!map) return null;

  const mapRect = map.getDiv().getBoundingClientRect();
  const el = document.querySelector(`[data-insert-id="${insertId}"]`);
  if (!el) return null;

  const r = el.getBoundingClientRect();
  const x = r.left - mapRect.left;
  const y = r.top - mapRect.top;
  const w = r.width;
  const h = r.height;

  return {
    x,
    y,
    w,
    h,
    center: { x: x + w / 2, y: y + h / 2 },
  };
};

const angleDeg = (p, c) =>
  (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;

const normDeltaDeg = (d) => {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
};

const rotatePt = (p, c, deg) => {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: c.x + dx * cos - dy * sin,
    y: c.y + dx * sin + dy * cos,
  };
};

// ================= Insert object resize (handles rotated objects smoothly) =================
const beginResizeInsert = (insertId, corner, clientPt, startSize) => {
  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;

  const box = getInsertBoxPx(insertId);
  if (!box) return;

  const obj = insertObjects.find((o) => o.id === insertId);
  const rotDeg = obj?.rotDeg || 0;

  setUiDrag({
    type: "resizeInsert",
    insertId,
    corner,
    startSize: { ...startSize, zRef: obj?.zRef ?? ELEMENT_BASE_ZOOM },
    startPointerPx,
    centerPx: box.center,
    startRotDeg: rotDeg,
  });
};
const beginResizePageFrame = (corner, clientPt) => {
  const startRect = boundsToRectPx(pageFrameBounds);
  if (!startRect) return;

  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;

  const centerPx = {
    x: startRect.x + startRect.w / 2,
    y: startRect.y + startRect.h / 2,
  };

  lockMapInteractions(true);
  setUiDrag({
    type: "resizePageFrame",
    corner,
    startSize: { wPx: startRect.w, hPx: startRect.h },
    startPointerPx,
    centerPx,
  });
};

const beginResizeExportArea = (corner, clientPt, displayedRect = null) => {
  if (!printAreaBounds || !projectionReady) return;

  const startRect = displayedRect ?? boundsToRectPx(printAreaBounds);
  if (!startRect || startRect.w < 10 || startRect.h < 10) return;

  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;

  const originalRect = {
    left: startRect.x,
    top: startRect.y,
    right: startRect.x + startRect.w,
    bottom: startRect.y + startRect.h,
    width: startRect.w,
    height: startRect.h,
  };

  exportResizeRef.current = {
    handle: corner,
    startPointerPx: { ...startPointerPx },
    originalRect,
  };

  lockMapInteractions(true);

  flushSync(() => {
    setExportLiveRect({
      x: startRect.x,
      y: startRect.y,
      w: startRect.w,
      h: startRect.h,
    });

    setUiDrag({
      type: "resizeExportArea",
      corner,
      startPointerPx: { ...startPointerPx },
      startRect: {
        x: startRect.x,
        y: startRect.y,
        w: startRect.w,
        h: startRect.h,
      },
    });
  });
};

const beginMoveExportArea = (clientPt) => {
  if (!printAreaBounds || !projectionReady) return;
  const centerLat = (printAreaBounds.nw.lat + printAreaBounds.se.lat) / 2;
  const centerLng = (printAreaBounds.nw.lng + printAreaBounds.se.lng) / 2;
  const startPos = { lat: centerLat, lng: centerLng };
  const startPx = latLngToPx(startPos);
  if (!startPx) return;

  const grabPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!grabPx) return;
  const offsetPx = { x: grabPx.x - startPx.x, y: grabPx.y - startPx.y };

  lockMapInteractions(true);
  setUiDrag({
    type: "moveExportArea",
    startPos,
    startBounds: { ...printAreaBounds, nw: { ...printAreaBounds.nw }, se: { ...printAreaBounds.se } },
    offsetPx,
  });
};

// ================= Insert object rotate (stable 360°, no swing) =================
const beginRotateInsert = (insertId, clientPt) => {
  const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
  if (!startPointerPx) return;

  const box = getInsertBoxPx(insertId);
  if (!box) return;

  const obj = insertObjects.find((o) => o.id === insertId);
  if (!obj) return;

  const startPointerAngleDeg = angleDeg(startPointerPx, box.center);

  setUiDrag({
    type: "rotateInsert",
    insertId,
    centerPx: box.center,
    startAngleDeg: obj.rotDeg || 0,
    startPointerAngleDeg,
  });
};


// ================= Insert object resize (TextBox / Text / Rect / Picture / Comment) =================
  


  const ROTATE_HANDLE_GAP_PX = 22;
  const NORTH_ROTATE_GAP_PX = 22;
const EXPORT_MAX_PX = 620;  // keeps within Static Maps limits
const EXPORT_SCALE = 2;     // sharper output



const iconBtn = {
  background: "#f5f5f5",
  border: "1px solid #ddd",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};
const panelStyle = {
  position: "absolute",
  top: 12,
  left: 12,
  width: 200,
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 8,
  zIndex: 50,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
};
/* ================= Styles ================= */


const panelCloseBtn = {
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 10,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 4,
  marginTop: 4,
};

const tileStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 3,
  border: "1px solid #e5e5e5",
  borderRadius: 6,
  padding: "5px 2px",
  background: "#fff",
  cursor: "pointer",
  textAlign: "center",
};

const tileIconStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid #e5e5e5",
  display: "grid",
  placeItems: "center",
  background: "#fafafa",
};


  return (

    <div
      style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ================= SAVE AS MODAL ================= */}
{saveAsOpen && (
  <div
    className="no-print"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 300000,
      display: "grid",
      placeItems: "center",
      pointerEvents: "auto",
    }}
    onMouseDown={() => setSaveAsOpen(false)}
  >
    <div
      style={{
        width: 420,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e5e5",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        padding: 14,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
        Save As
      </div>

      <input
        value={saveAsName}
        onChange={(e) => setSaveAsName(e.target.value)}
        placeholder="Enter file name (e.g. Douglas St TMP)"
        autoFocus
        style={{
          width: "100%",
          height: 36,
          padding: "0 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          outline: "none",
          fontSize: 14,
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setSaveAsOpen(false);
          if (e.key === "Enter") {
            const name = (saveAsName || "").trim();
            if (!name) return;

            const snap = makeProjectSnapshot();
            const id = crypto.randomUUID();

            const list = loadProjectsList();
            list.unshift({
              id,
              name,
              updatedAt: Date.now(),
              snapshot: snap,
            });
            writeProjectsList(list);

            setSaveAsOpen(false);
            refreshProjectsList();
          }
        }}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={iconBtn} onClick={() => setSaveAsOpen(false)}>Cancel</button>
        <button
          style={iconBtn}
          onClick={() => {
            const name = (saveAsName || "").trim();
            if (!name) return;

            const snap = makeProjectSnapshot();
            const id = crypto.randomUUID();

            const list = loadProjectsList();
            list.unshift({
              id,
              name,
              updatedAt: Date.now(),
              snapshot: snap,
            });
            writeProjectsList(list);

            setSaveAsOpen(false);
            refreshProjectsList();
          }}
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}

{/* ================= OPEN MODAL ================= */}
{openDialog && (
  <div
    className="no-print"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 300000,
      display: "grid",
      placeItems: "center",
      pointerEvents: "auto",
    }}
    onMouseDown={() => setOpenDialog(false)}
  >
    <div
      style={{
        width: 520,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e5e5",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        padding: 14,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>Open</div>
        <div style={{ flex: 1 }} />
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => {
              try {
                const snap = JSON.parse(r.result);
                if (snap && (snap.editorState || snap.mapView)) {
                  applyProjectSnapshot(snap);
                  setOpenDialog(false);
                } else {
                  alert("Invalid project file. Needs editorState or mapView.");
                }
              } catch (err) {
                alert("Failed to parse file: " + (err?.message || err));
              }
              e.target.value = "";
            };
            r.readAsText(file);
          }}
        />
        <button style={iconBtn} onClick={() => importFileInputRef.current?.click()}>Import from file</button>
        <button style={iconBtn} onClick={() => setOpenDialog(false)}>Close</button>
      </div>

      <div style={{ marginTop: 10, maxHeight: 320, overflow: "auto", border: "1px solid #eee", borderRadius: 12 }}>
        {(savedProjects.length ? savedProjects : loadProjectsList()).map((p) => (
          <div
            key={p.id}
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
            onClick={() => {
              applyProjectSnapshot(p.snapshot);
              setOpenDialog(false);
            }}
          >
            <div style={{ fontWeight: 900 }}>{p.name}</div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
              {new Date(p.updatedAt).toLocaleString()}
            </div>
          </div>
        ))}

        {!loadProjectsList().length && (
          <div style={{ padding: 14, color: "#666", fontSize: 13 }}>
            No saved TMP files yet.
          </div>
        )}
      </div>
    </div>
  </div>
)}

      {/* ================= SHARE PLACEHOLDER MODAL ================= */}
{shareModalOpen && (
  <div
    className="no-print"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 300000,
      display: "grid",
      placeItems: "center",
      pointerEvents: "auto",
    }}
    onMouseDown={() => setShareModalOpen(false)}
  >
    <div
      style={{
        width: 340,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e5e5",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        padding: 20,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Share</div>
      <p style={{ fontSize: 14, color: "#333", lineHeight: 1.5, margin: "0 0 16px" }}>
        Share feature coming soon. Use Export to PDF to share this TMP for now.
      </p>
      <button style={iconBtn} onClick={() => setShareModalOpen(false)}>OK</button>
    </div>
  </div>
)}

      {/* ================= TOP MENU TABS ================= */}
      <header className="no-print" style={{ background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            gap: 10,
            position: "relative",
          }}
        >
          <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 6,
    position: "relative",
    zIndex: 200000,
    pointerEvents: "auto",
  }}
>

            <div ref={fileMenuRef} style={{ position: "relative" }}>
              <TabButton
                label="File"
                active={openFileMenu}
                onClick={() => clickTab("File")}
              />
              {openFileMenu && (
                <Dropdown>
  <DropItem
    label="New TMP"
    onClick={() => {
      setOpenFileMenu(false);
      window.open("/dashboard?tab=new", "_blank", "noopener,noreferrer");
    }}
  />

  <DropItem
    label="Open"
    onClick={() => {
      setOpenFileMenu(false);
      window.open("/dashboard?tab=open", "_blank", "noopener,noreferrer");
    }}
  />

  <DropItem
    label="Save As"
    onClick={() => {
      setOpenFileMenu(false);
      setSaveAsName("");
      setSaveAsOpen(true);
    }}
  />

  <Divider />
  <DropItem
    label="Print"
    onClick={() => {
      setOpenFileMenu(false);
      window.print();
    }}
  />
  <DropItem
  label="Export to PDF"
  onClick={() => {
    setOpenFileMenu(false);
    beginExportToPdf();
  }}
/>
  <Divider />
  <DropItem
    label="Share"
    onClick={() => {
      setOpenFileMenu(false);
      setShareModalOpen(true);
    }}
  />
</Dropdown>

              )}
            </div>

            <TabButton label="Edit" active={activeTab === "Edit"} onClick={() => clickTab("Edit")} />
            <TabButton label="View" active={activeTab === "View"} onClick={() => clickTab("View")} />
            <TabButton
              label="Plan Elements"
              active={activeTab === "Plan Elements"}
              onClick={() => clickTab("Plan Elements")}
            />
            <TabButton label="Tools" active={activeTab === "Tools"} onClick={() => clickTab("Tools")} />
            <TabButton label="Insert" active={activeTab === "Insert"} onClick={() => clickTab("Insert")} />
          </div>

          <div style={{ flex: 1 }} />

          <button title="Zoom In" style={iconBtn} onClick={zoomIn}>＋</button>
          <button title="Zoom Out" style={iconBtn} onClick={zoomOut}>－</button>
          <button title="Reset" style={iconBtn} onClick={resetToLocation}>Reset</button>

          <div style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Editor</div>
        </div>

        {showRibbon && (
          <div
            style={{
              borderTop: "1px solid #e5e5e5",
              background: "#fafafa",
              padding: "10px 12px",
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {activeTab === "Plan Elements" && (
              <RibbonGroup>
                <RibbonTextButton label="Cones" active={isConesToolActive} onClick={openConesTool} variant="outline" />
<RibbonTextButton label="Signs" active={isSignsToolActive} onClick={openSignsTool} variant="outline" />
<RibbonTextButton label="Measurements" active={isMeasToolActive} onClick={openMeasTool} variant="outline" />
<RibbonTextButton label="Work Area" active={activeTool === "work_area"} onClick={openWorkAreaTool} variant="outline" />


              </RibbonGroup>
            )}

            {activeTab === "View" && (
              <>
                <RibbonGroup>
                  <RibbonTextButton label="Zoom In" onClick={zoomIn} />
                  <RibbonTextButton label="Zoom Out" onClick={zoomOut} />
                  <RibbonTextButton label="Reset to Location" onClick={resetToLocation} />
                </RibbonGroup>
              <RibbonGroup>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ fontSize: 12, color: "#333" }}>Map Layer</div>
    <select
      value={mapLayer}
      onChange={(e) => setMapLayer(e.target.value)}
      style={{
        height: 28,
        padding: "0 8px",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "#fff",
        fontSize: 12,
      }}
    >
      <option value="roadmap">Google Roadmap</option>
      <option value="satellite">Google Satellite</option>
      <option value="hybrid">Google Hybrid</option>
      
      <option value="terrain">Google Terrain</option>
    </select>
  </div>
</RibbonGroup>

                
              </>
            )}

            {activeTab === "Edit" && (
              <RibbonGroup>
                <RibbonTextButton label="Undo" onClick={doUndo} />
                <RibbonTextButton label="Redo" onClick={doRedo} />
                <RibbonTextButton label="Delete" onClick={doDelete} />

              </RibbonGroup>
            )}

            {activeTab === "Tools" && (
              <RibbonGroup>
                <RibbonTextButton
                  label="Legend Box"
                  onClick={() => {
                    setActiveTab("Tools");
                    setActiveTool("legend");
                    setConesPanelOpen(false);
                    setMeasPanelOpen(false);
                    setSignsPanelOpen(false);
                  }}
                />
                <RibbonTextButton
                  label="Manifest"
                  onClick={() => {
                    clearSelectionEverywhere();
                    setActiveTab("Tools");
                    setActiveTool("manifest");
                    setConesPanelOpen(false);
                    setMeasPanelOpen(false);
                    setSignsPanelOpen(false);
                  }}
                />
                <RibbonTextButton
                  label="Title Box"
                  onClick={() => {
                    setActiveTab("Tools");
                    setActiveTool("title");
                    setConesPanelOpen(false);
                    setMeasPanelOpen(false);
                    setSignsPanelOpen(false);
                  }}
                />
                <RibbonTextButton
  label="North Arrow"
  onClick={() => {
    clearSelectionEverywhere();
    setActiveTab("Tools");
    setActiveTool("northArrow");
    setConesPanelOpen(false);
    setMeasPanelOpen(false);
    setSignsPanelOpen(false);
  }}
/>

                <RibbonTextButton
  label="Scale"
  onClick={() => {
    setActiveTab("Tools");
    setActiveTool("scale");
    setConesPanelOpen(false);
    setMeasPanelOpen(false);
    setSignsPanelOpen(false);
  }}
/>

              </RibbonGroup>
            )}

          {activeTab === "Insert" && (
  <RibbonGroup>
    <RibbonTextButton label="Text Box" onClick={() => setActiveTool("insert:textbox")} />
    <RibbonTextButton label="Line" onClick={() => setActiveTool("insert:line")} />
    <RibbonTextButton label="Rectangle Box" onClick={() => setActiveTool("insert:rect")} />
    <RibbonTextButton label="Text" onClick={() => setActiveTool("insert:text")} />

    <RibbonTextButton label="Table" onClick={() => setActiveTool("insert:table")} />

    <RibbonTextButton
      label="Picture"
      onClick={() => pictureInputRef.current?.click()}
    />

    
  </RibbonGroup>
)}


          </div>
        )}
                {/* ===== TABLE controls when selected ===== */}
        {(() => {
          const sel = insertObjects.find((o) => o.id === selectedInsertId);
          if (!sel || sel.kind !== "table") return null;

          return (
            <div style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>Table</div>

              <RibbonTextButton
                label="Add Row"
                onClick={() => {
                  setInsertObjects((prev) =>
                    prev.map((o) => {
                      if (o.id !== sel.id || o.kind !== "table") return o;
                      const next = structuredClone(o);
                      const cols = next.cols;
                      next.rows += 1;
                      next.rowHeights.push(48);
                      next.cells.push(Array.from({ length: cols }, () => ""));
                      next.hPx += 48;
                      return next;
                    })
                  );
                }}
              />

              <RibbonTextButton
                label="Add Column"
                onClick={() => {
                  setInsertObjects((prev) =>
                    prev.map((o) => {
                      if (o.id !== sel.id || o.kind !== "table") return o;
                      const next = structuredClone(o);
                      next.cols += 1;
                      next.colWidths.push(120);
                      next.cells = next.cells.map((row) => [...row, ""]);
                      next.wPx += 120;
                      return next;
                    })
                  );
                }}
              />

              <RibbonTextButton
                label="Remove Row"
                onClick={() => {
                  setInsertObjects((prev) =>
                    prev.map((o) => {
                      if (o.id !== sel.id || o.kind !== "table") return o;
                      if (o.rows <= 1) return o;
                      const next = structuredClone(o);
                      next.rows -= 1;
                      next.rowHeights.pop();
                      next.cells.pop();
                      next.hPx = Math.max(140, next.hPx - 48);
                      return next;
                    })
                  );
                }}
              />

              <RibbonTextButton
                label="Remove Column"
                onClick={() => {
                  setInsertObjects((prev) =>
                    prev.map((o) => {
                      if (o.id !== sel.id || o.kind !== "table") return o;
                      if (o.cols <= 1) return o;
                      const next = structuredClone(o);
                      next.cols -= 1;
                      next.colWidths.pop();
                      next.cells = next.cells.map((row) => row.slice(0, -1));
                      next.wPx = Math.max(220, next.wPx - 120);
                      return next;
                    })
                  );
                }}
              />
            </div>
          );
        })()}
        {/* ===== FONT controls when selected (Text / TextBox / Rect / Table) ===== */}
{(() => {
  const sel = insertObjects.find((o) => o.id === selectedInsertId);
  if (!sel) return null;

  const supportsFont =
    sel.kind === "text" ||
    sel.kind === "textbox" ||
    sel.kind === "rect" ||
    sel.kind === "table";

  if (!supportsFont) return null;

  const fontSize = sel.fontSize ?? (sel.kind === "table" ? 14 : 18);
  const fontFamily = sel.fontFamily ?? "Arial";

  return (
    <div style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ fontWeight: 900, fontSize: 13 }}>Text Style</div>

      <label style={{ fontSize: 12, fontWeight: 800 }}>
        Font
        <select
          value={fontFamily}
          onChange={(e) => {
            const val = e.target.value;
            setInsertObjects((prev) =>
              prev.map((o) => (o.id === sel.id ? { ...o, fontFamily: val } : o))
            );
          }}
          style={{ marginLeft: 8, padding: "6px 8px" }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 12, fontWeight: 800 }}>
        Size
        <input
          type="number"
          min="8"
          max="120"
          value={fontSize}
          onChange={(e) => {
            const val = Number(e.target.value || 0);
            setInsertObjects((prev) =>
              prev.map((o) => (o.id === sel.id ? { ...o, fontSize: val } : o))
            );
          }}
          style={{ marginLeft: 8, width: 90, padding: "6px 8px" }}
        />
      </label>
    </div>
  );
})()}


       {/* ===== Title Box properties UI when selected (INSERT title_box) ===== */}
{(() => {
  const sel = insertObjects.find((o) => o.id === selectedInsertId);
  if (!sel || sel.kind !== "title_box") return null;

  const d = sel.data || {};

  const patchTitle = (patch) => {
    setInsertObjects((prev) =>
      prev.map((o) => {
        if (o.id !== sel.id) return o;
        return {
          ...o,
          data: { ...(o.data || {}), ...patch },
        };
      })
    );
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <label style={{ fontSize: 12 }}>
        Project
        <input
          value={d.project || ""}
          onChange={(e) => patchTitle({ project: e.target.value })}
          style={{ marginLeft: 6, width: 180 }}
        />
      </label>

      <label style={{ fontSize: 12 }}>
        Job Location
        <input
          value={d.jobLocation || ""}
          onChange={(e) => patchTitle({ jobLocation: e.target.value })}
          style={{ marginLeft: 6, width: 180 }}
        />
      </label>

      <label style={{ fontSize: 12 }}>
        Date
        <input
          type="date"
          value={d.date || ""}
          onChange={(e) => patchTitle({ date: e.target.value })}
          style={{ marginLeft: 6 }}
        />
      </label>

      <label style={{ fontSize: 12 }}>
        Author
        <input
          value={d.author || ""}
          onChange={(e) => patchTitle({ author: e.target.value })}
          style={{ marginLeft: 6, width: 160 }}
        />
      </label>

      {/* Logo picker */}
<input
  key={sel.id}
  ref={titleLogoInputRef}
  type="file"
  accept="image/*"
  style={{ display: "none" }}
  onChange={(e) =>
    uploadInsertTitleLogo(sel.id, e.target.files?.[0])
  }
/>

<RibbonTextButton
  label="Choose Logo"
  onClick={() => titleLogoInputRef.current?.click()}
/>

<RibbonTextButton
  label="Clear Logo"
  onClick={() => patchTitle({ logoDataUrl: null })}
/>

<label style={{ fontSize: 12 }}>
  Logo Size
  <input
    type="range"
    min="0.4"
    max="2.5"
    step="0.05"
    value={d.logoScale ?? 1}
    onChange={(e) =>
      patchTitle({ logoScale: Number(e.target.value) })
    }
    style={{ marginLeft: 6, width: 140 }}
  />
  <span style={{ marginLeft: 6 }}>
    {Math.round((d.logoScale ?? 1) * 100)}%
  </span>
</label>
<label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
  Comments
  <textarea
    value={d.comments || ""}
    onChange={(e) => patchTitle({ comments: e.target.value })}
    rows={2}
    style={{
      width: 320,
      resize: "vertical",
      padding: "6px 8px",
      fontFamily: "inherit",
      fontSize: 12,
    }}
  />
</label>

    </div>
  );
})()}

      </header>

      {/* ================= MAP ================= */}
      <main style={{ flex: 1, position: "relative" }}>
                {/* hidden file input for Insert → Picture */}
        <input
          ref={pictureInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onPickPicture}
        />

        {gridOn && (
  <div
    className="no-print"
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 40,
      backgroundImage:
        "linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px), " +
        "linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
    }}
  />
)}

        {/* panels (cones / meas / signs) — keep your UI, unchanged */}
        {conesPanelOpen && activeTab === "Plan Elements" && (
          <div className="no-print" style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Cones</div>
              <button type="button" onClick={closeConesPanel} style={panelCloseBtn}>Close</button>
            </div>

            <div style={{ height: 10 }} />
            <div style={gridStyle}>
              {CONE_ITEMS.map((it) => {
                const active = selectedConeType === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      openConesTool();
                      setSelectedConeType(it.id);
                    }}
                    style={{
                      ...tileStyle,
                      borderColor: active ? "#111" : "#e5e5e5",
                      background: active ? "#f5f5f5" : "#fff",
                    }}
                  >
                    <div style={tileIconStyle}>
                      <div style={{ width: 18, height: 18, display: "grid", placeItems: "center" }}>
                        {it.id === "cone" && <TriangleCone />}
                        {it.id === "barrel" && <Dot size={9} />}
                        {it.id === "bollard" && <Dot size={7} />}
                        {it.id === "barrier" && (
                          <div style={{ width: 18, height: 4, borderTop: "2px dashed #9CA3AF" }} />
                        )}
                        {it.id === "ped_tape" && (
                          <div style={{ width: 18, height: 4 }}>
                            <div style={{ borderTop: "3px dashed #DC2626", width: "100%" }} />
                          </div>
                        )}
                        {it.id === "type1" && <BarricadeType1 />}
                        {it.id === "type2" && <BarricadeType2 />}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>{it.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {measPanelOpen && activeTab === "Plan Elements" && (
          <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Measurements</div>
              <button type="button" onClick={closeMeasPanel} style={panelCloseBtn}>Close</button>
            </div>

            <div style={{ height: 10 }} />
            <div style={gridStyle}>
              {MEAS_ITEMS.map((it) => {
                const active = measMode === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      openMeasTool();
                      setMeasMode(it.id);
                    }}
                    style={{
                      ...tileStyle,
                      borderColor: active ? "#111" : "#e5e5e5",
                      background: active ? "#f5f5f5" : "#fff",
                    }}
                  >
                    <div style={tileIconStyle}>
                      {it.id === "distance" ? (
  <div style={{ width: 18, height: 18, display: "grid", placeItems: "center" }}>
    <div style={{ width: 16, borderTop: "2px solid #111", position: "relative" }}>
      <div style={{ position: "absolute", left: -2, top: -5 }}>◀</div>
      <div style={{ position: "absolute", right: -2, top: -5 }}>▶</div>
    </div>
  </div>
) : (
  <div style={{ width: 18, height: 18, display: "grid", placeItems: "center" }}>
    <div style={{ width: 16, height: 10, borderLeft: "2px solid #111", borderBottom: "2px solid #111" }} />
  </div>
)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>{it.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {signsPanelOpen && activeTab === "Plan Elements" && (
          <div className="no-print" style={{
            position: "absolute",
            top: 12,
            bottom: 20,
            left: 12,
            width: 210,
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>

            {/* ── Header ── */}
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 12px 8px",
              borderBottom: "1px solid #f0f0f0",
              flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#111", flex: 1 }}>Signs</span>
              <button
                type="button"
                onClick={closeSignsPanel}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "#999",
                  lineHeight: 1,
                  padding: "0 2px",
                }}
              >✕</button>
            </div>

            {/* ── Search ── */}
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", background: "#f6f6f6", borderRadius: 8, padding: "0 8px", gap: 6 }}>
                <span style={{ color: "#aaa", fontSize: 13 }}>🔍</span>
                <input
                  value={signSearch}
                  onChange={(e) => setSignSearch(e.target.value)}
                  placeholder="Search signs…"
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    padding: "7px 0",
                    fontSize: 12,
                    color: "#333",
                    outline: "none",
                  }}
                />
                {signSearch && (
                  <button
                    type="button"
                    onClick={() => setSignSearch("")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: 0 }}
                  >✕</button>
                )}
              </div>
            </div>

            {/* ── Sign grid ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 8px 12px" }}>
              {filteredSigns.length === 0 ? (
                <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: "20px 0" }}>No signs found</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                  {filteredSigns.map((s) => {
                    const active = selectedSignCode === s.code;
                    return (
                      <button
                        key={normalizeSignCode(s.code)}
                        type="button"
                        title={normalizeSignCode(s.code)}
                        onClick={() => { openSignsTool(); setSelectedSignCode(s.code); }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          padding: "6px 2px",
                          border: active ? "2px solid #f97316" : "1.5px solid #ebebeb",
                          borderRadius: 8,
                          background: active ? "#fff7ed" : "#fff",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                      >
                        <img
                          src={s.src}
                          alt={normalizeSignCode(s.code)}
                          style={{ width: 36, height: 36, objectFit: "contain" }}
                        />
                        <span style={{ fontSize: 9, fontWeight: 600, color: active ? "#f97316" : "#555", lineHeight: 1.2, textAlign: "center" }}>
                          {normalizeSignCode(s.code)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ===== Map wrapper (relative) so Title Boxes can be absolute above it ===== */}
 <div
  ref={exportOverlayRef}
  style={{
    position: "relative",
    flex: 1,
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
  }}
>

         {isLoaded && (
  <div
    ref={mapHostRef}
    style={{ position: "relative", width: "100%", height: "100%", zIndex: 1, overflow: "hidden" }}
  >
    <GoogleMap 

              mapContainerStyle={{ width: "100%", height: "100%", cursor: mapCursor }}
              
               center={mapView.center}
               zoom={mapView.zoom}
               mapTypeId={mapLayer}
              key={mapKey}


              onLoad={(map) => {
                mapRef.current = map;
                setMapReady(true);
// ===== Fix: map blank until reload (route navigation sizing issue) =====
const kickResize = () => {
  try { window.google?.maps?.event?.trigger?.(map, "resize"); } catch {}
  const c = mapView?.center || center;
  if (c) map.panTo(c);
};

requestAnimationFrame(kickResize);
setTimeout(kickResize, 60);
setTimeout(kickResize, 180);
setTimeout(kickResize, 400);

// Also once after first idle
try {
  window.google?.maps?.event?.addListenerOnce?.(map, "idle", kickResize);
} catch {}

                // keep React state in sync with actual map camera (prevents snapping)
              map.addListener("idle", () => {
  const c = map.getCenter?.();
  const z = map.getZoom?.();
  if (!c || z == null) return;

  const nextCenter = c.toJSON();
  const prev = lastMapViewRef.current;

  // ✅ tiny tolerance to avoid re-render spam
  const sameCenter =
    prev.center &&
    Math.abs(prev.center.lat - nextCenter.lat) < 1e-10 &&
    Math.abs(prev.center.lng - nextCenter.lng) < 1e-10;

  const sameZoom = prev.zoom === z;

  if (sameCenter && sameZoom) return;

  lastMapViewRef.current = { center: nextCenter, zoom: z };
  setMapView({ center: nextCenter, zoom: z });
});

                // Sync zoom synchronously so CSS dimensions update BEFORE OverlayViewF draw()
                // positions the container — prevents translate(-50%,-50%) drift at high zoom.
                map.addListener("zoom_changed", () => {
                  const z = map.getZoom?.();
                  if (z == null) return;
                  flushSync(() => {
                    setMapView((prev) => (prev?.zoom === z ? prev : { ...prev, zoom: z }));
                  });
                });


                ensureProjectionOverlay(map);
                // ✅ Fix occasional blank map on first load (after route navigation)
setTimeout(() => {
  try {
    window.google?.maps?.event?.trigger?.(map, "resize");
  } catch {}
  const c = mapView?.center || center;
  if (c) map.panTo(c);
  map.setZoom(mapView?.zoom ?? 18);
}, 50);

                // Create default page frame when entering editor
setTimeout(() => {
  setPageFrameBounds((prev) => {
    if (prev) return prev;
    return prev; // keep null; we'll init below
  });
  initPageFrameRect();
}, 0);
try {
  window.google?.maps?.event?.addListenerOnce?.(map, "idle", () => {
    try { window.google?.maps?.event?.trigger?.(map, "resize"); } catch {}
  });
} catch {}
setTimeout(() => {
  try { window.google?.maps?.event?.trigger?.(map, "resize"); } catch {}
  const c = mapView?.center || center;
  if (c) map.panTo(c);
}, 0);

setTimeout(() => {
  try { window.google?.maps?.event?.trigger?.(map, "resize"); } catch {}
  const c = mapView?.center || center;
  if (c) map.panTo(c);
}, 250);

              }}

              
              onMouseDown={onMapMouseDown}
              onClick={onMapClick}
              onMouseMove={onMapMouseMove}
              onDblClick={onMapDblClick}
              onRightClick={onMapRightClick}

              options={{
                disableDefaultUI: true,
                clickableIcons: false,
                tilt: 0,
                draggable: false,              // ✅ no mouse drag pan
                scrollwheel: false,            // ✅ no mouse wheel zoom
                keyboardShortcuts: false,      // ✅ no +/- zoom by keyboard
                gestureHandling: "none",       // ✅ no trackpad/gesture pan/zoom
                minZoom: 16,
                maxZoom: 22,
                disableDoubleClickZoom: true,

                
                draggableCursor:
  (uiDrag?.type === "moveSign" || uiDrag?.type === "rotateSign" || uiDrag?.type === "resizeSign")
    ? "grabbing"
    : (uiDrag?.type === "resizeExportArea" || uiDrag?.type === "moveExportArea")
      ? "grabbing"
    : signHoveredId
      ? "pointer"
      : (activeTool || isConesToolActive || isMeasToolActive || isSignsToolActive)
        ? "crosshair"
        : mapCursor,

draggingCursor:
  (uiDrag?.type === "moveSign" || uiDrag?.type === "rotateSign" || uiDrag?.type === "resizeSign")
    ? "grabbing"
    : (uiDrag?.type === "resizeExportArea" || uiDrag?.type === "moveExportArea")
      ? "grabbing"
    : signHoveredId
      ? "pointer"
      : (activeTool || isConesToolActive || isMeasToolActive || isSignsToolActive)
        ? "crosshair"
        : mapCursor,

              }}
            >
                
                
              {/* ========================= IMPORTED AERIAL (no visible page frame box) ========================= */}
              {pageFrameBounds && projectionReady && !exportMode && (() => {
                const r = boundsToRectPx(pageFrameBounds);
                if (!r || r.w < 10 || r.h < 10) return null;
                const centerLat = (pageFrameBounds.nw.lat + pageFrameBounds.se.lat) / 2;
                const centerLng = (pageFrameBounds.nw.lng + pageFrameBounds.se.lng) / 2;
                const centerPos = { lat: centerLat, lng: centerLng };

                return (
                  <>
                    {/* Aerial image goes in a lower pane so all cones/lines/signs remain visible above it */}
                    {importedAerial?.dataUrl && (
                      <OverlayViewF position={centerPos} mapPaneName="overlayLayer">
                        <div
                          style={{
                            transform: "translate(-50%, -50%)",
                            width: r.w,
                            height: r.h,
                            position: "relative",
                            boxSizing: "border-box",
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        >
                          <img
                            src={importedAerial.dataUrl}
                            alt="Imported aerial"
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              filter: "brightness(0.96)",
                              pointerEvents: "none",
                            }}
                          />
                        </div>
                      </OverlayViewF>
                    )}
                  </>
                );
              })()}
              {/* ========================= CONES: committed ========================= */}
              {conesFeatures.map((f) => {
                if (f.typeId === "barrier") return <BarrierPolyline key={f.id} path={f.path} />;
                if (f.typeId === "ped_tape") return <PedTapePolyline key={f.id} path={f.path} />;

                const markers = projectionReady ? sampleConesMarkersForPath(f.path, f.typeId) : [];
                return markers.map((pos, idx) => (
                  <OverlayViewF key={`${f.id}_${idx}`} position={pos} mapPaneName="overlayMouseTarget">
                    <div
                      style={{
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                        filter: fx.shadow,
                        opacity: fx.ghost,
                      }}
                    >
                      <MarkerVisual typeId={f.typeId} strokeScale={fx.strokeScale} scale={elementScale} />
                    </div>
                  </OverlayViewF>
                ));
              })}
              {/* =========================
    Work Areas (saved)
========================= */}
{workAreas.map((wa) => (
  <PolygonF
    key={wa.id}
    path={wa.path}
    options={{
  ...WORK_AREA_STYLE,

  // ✅ Always green (selected or not)
  strokeColor: "#00c853",
  fillColor: "#00c853",
  fillOpacity: 0.12,

  // ✅ Selection feedback without changing color
  strokeWeight: wa.id === selectedWorkAreaId ? 3 : 2,
  strokeOpacity: wa.id === selectedWorkAreaId ? 1 : 0.9,

  // ✅ drag only when selected; use our custom handles for resize (smoother, no duplicate UI)
  draggable: wa.id === selectedWorkAreaId,
  editable: false,



  // ✅ top when selected
  zIndex: wa.id === selectedWorkAreaId ? 9999 : 10,

  // ✅ when any tool is active (cones, measurements, signs, work area, inserts, etc.), don't select work area — clicks pass through to the tool
  clickable: !activeTool,
}}

    onLoad={(polygon) => {
  polygon.__waId = wa.id;

  // ✅ 1) vertex edit (corner drag)
  polygon.__syncPath = () => {
    const path = polygon.getPath().getArray().map((p) => p.toJSON());
    setWorkAreas((prev) =>
      prev.map((x) => (x.id === polygon.__waId ? { ...x, path } : x))
    );
  };

  polygon.getPath().addListener("set_at", polygon.__syncPath);
  polygon.getPath().addListener("insert_at", polygon.__syncPath);
  polygon.getPath().addListener("remove_at", polygon.__syncPath);

  // ✅ 2) whole-polygon drag (MOVE) — THIS is what stops “copy”
  polygon.__dragEndListener = polygon.addListener("dragend", () => {
    polygon.__syncPath(); // read the new moved path and update SAME id
  });
}}
onUnmount={(polygon) => {
  if (polygon?.__dragEndListener) polygon.__dragEndListener.remove();
  polygon.__syncPath = null;
}}

    
    
    onClick={() => {
  setSelectedWorkAreaId(wa.id);

  // ✅ clear any leftover draft preview so you don’t see the inner polygon
  setIsDrawingWorkArea(false);
  setWorkDraft([]);
  setWorkHover(null);
}}

    onRightClick={(e) => {
      if (e.domEvent) {
        openContextMenu(e.domEvent, "workArea", wa.id, "workArea");
      }
    }}
    onDragEnd={(e) => {
      // after dragging whole polygon, update state
      // polygon path is already updated internally, so we trigger a refresh:
      // (quick trick) re-save from current path on next tick:
      setTimeout(() => {
        // no polygon ref here, but edit listeners will have captured vertex moves.
        // dragging whole polygon doesn't trigger set_at, so we force-save by using event latLng offset isn't easy.
        // If you want perfect drag-save, tell me and I’ll add polygon refs map.
      }, 0);
    }}
  />
))}
{/* =========================
    WORK AREA HANDLES (corner + midpoints) – custom pointer drag for smooth resize
========================= */}
{selectedWorkAreaId && window.google && (() => {
  const wa = workAreas.find(x => x.id === selectedWorkAreaId);
  if (!wa || !wa.path || wa.path.length < 2) return null;

  const midLL = (a, b) => ({
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  });

  const isResizing = uiDrag?.type === "resizeWorkArea" && uiDrag?.workAreaId === wa.id;
  const handleStyle = {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#fff",
    border: "2px solid #00c853",
    cursor: isResizing ? "grabbing" : "grab",
    pointerEvents: "auto",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  };
  const hitAreaStyle = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const onHandlePointerDown = (handleType, handleIndex, ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    if (!projectionReady) return;
    const startPointerPx = clientToDivPx(ev.clientX, ev.clientY);
    if (!startPointerPx) return;
    // Store exact handle position at drag start (dragged point must follow cursor)
    const startHandleLatLng = handleType === "corner"
      ? { ...wa.path[handleIndex] }
      : midLL(wa.path[handleIndex], wa.path[(handleIndex + 1) % wa.path.length]);
    const startHandlePx = latLngToPx(startHandleLatLng);
    if (!startHandlePx) return;
    lockMapInteractions(true);
    setUiDrag({
      type: "resizeWorkArea",
      workAreaId: wa.id,
      handleType,
      handleIndex,
      startPath: wa.path.map((p) => ({ ...p })),
      startPointerPx,
      startHandlePx,
      startHandleLatLng,
    });
  };

  return (
    <div className="no-print" style={{ display: "contents" }}>
      {wa.path.map((pt, idx) => (
        <OverlayViewF key={`${wa.id}-corner-${idx}`} position={pt} mapPaneName="overlayMouseTarget" zIndex={10000}>
          <div style={hitAreaStyle}>
            <div
              role="button"
              tabIndex={0}
              style={handleStyle}
              onPointerDown={(e) => onHandlePointerDown("corner", idx, e)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click?.()}
            />
          </div>
        </OverlayViewF>
      ))}
      {wa.path.map((pt, i) => {
        const a = wa.path[i];
        const b = wa.path[(i + 1) % wa.path.length];
        const mid = midLL(a, b);
        return (
          <OverlayViewF key={`${wa.id}-mid-${i}`} position={mid} mapPaneName="overlayMouseTarget" zIndex={10000}>
            <div style={hitAreaStyle}>
              <div
                role="button"
                tabIndex={0}
                style={{ ...handleStyle, width: 12, height: 12, borderWidth: 1.5 }}
                onPointerDown={(e) => onHandlePointerDown("midpoint", i, e)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click?.()}
              />
            </div>
          </OverlayViewF>
        );
      })}
    </div>
  );
})()}

{/* =========================
    Work Area (draft preview)
========================= */}
{activeTool === "work_area" &&
  isDrawingWorkArea &&
  !selectedWorkAreaId &&
  workDraft.length > 0 && (

  <>
    {/* Preview polyline (draft points + hover point) */}
    <PolylineF
      path={workHover ? [...workDraft, workHover] : workDraft}
      options={{
        clickable: false,         // ✅ MUST: don't steal clicks
        zIndex: 1,
        strokeColor: "#00c853",   // ✅ visible green
        strokeOpacity: 1,
        strokeWeight: 3,
        geodesic: false,
      }}
    />

    {/* Optional: show a faint fill once there are 3+ points */}
    {workDraft.length >= 3 && (
      <PolygonF
        path={workDraft}
        options={{
          clickable: false,       // ✅ MUST
          zIndex: 0,
          strokeColor: "#00c853",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#00c853",
          fillOpacity: 0.12,
        }}
      />
    )}
  </>
)}

{/* =========================
    Work Area (saved polygons)
========================= */}
{workAreas.map((a) => (
  <PolygonF
    key={a.id}
    path={a.path}
    options={{
      clickable: false,       // ✅ MUST for reliable clicking while drawing
      zIndex: 0,
      strokeColor: "#00c853",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#00c853",
      fillOpacity: 0.10,
    }}
  />
))}


              {/* CONES: preview */}
              {conesIsDrawing && conesPreviewPath && conesPreviewPath.length >= 2 && (
                <>
                  {selectedConeType === "barrier" && <BarrierPolyline path={conesPreviewPath} preview />}
                  {selectedConeType === "ped_tape" && <PedTapePolyline path={conesPreviewPath} preview />}

                  {selectedConeType !== "barrier" &&
                    selectedConeType !== "ped_tape" &&
                    conesPreviewSamples.map((pos, idx) => (
                      <OverlayViewF key={`cones_preview_${idx}`} position={pos} mapPaneName="overlayMouseTarget">
                        <div
                          style={{
                            transform: "translate(-50%, -50%)",
                            pointerEvents: "none",
                            filter: fx.shadow,
                            opacity: 0.75 * fx.ghost,
                          }}
                        >
                          <MarkerVisual typeId={selectedConeType} strokeScale={fx.strokeScale} scale={elementScale} />
                        </div>
                      </OverlayViewF>
                    ))}
                </>
              )}

              {/* ========================= MEASUREMENTS: committed ========================= */}
              {measurements.map((m) => {
                const path = m.path;

                if (m.mode === "distance" && path.length >= 2) {
                  const a = path[0];
                  const b = path[path.length - 1];
                  const d = distMetersLL(a, b);
                  if (d < MIN_SEGMENT_METERS) return null;
                  const { pos: labelPos, rotateDeg } = getMeasLabelPlacement(a, b, 6);
                  return (
                    <React.Fragment key={m.id}>
                     <DimensionSegment
  a={a}
  b={b}
  opacity={1}
  zIndex={30}
  scale={measureScale}
    pixelLen={getPixelLen(a, b)}
/>
                      {(() => {
  const displayText = m.labelOverride ?? formatMeters(d);
  return (
    <MeasureLabel
      position={labelPos}
      text={displayText}
      fontScale={measureScale}
      rotateDeg={rotateDeg}
      isEditing={measEdit?.mid === m.id && measEdit?.segIndex == null}
      editValue={measEditValue}
      onEditChange={(v) => setMeasEditValue(v)}
      onEditCommit={commitEditMeasureLabel}
      onEditCancel={cancelEditMeasureLabel}
      onDblClick={() => startEditMeasureLabel(m.id, null, displayText)}
    />
  );
})()}

                    </React.Fragment>
                  );
                }

                if (m.mode === "combined" && path.length >= 2) {
                  const segs = [];
                  for (let i = 0; i < path.length - 1; i++) {
                    const a = path[i];
                    const b = path[i + 1];
                    const d = distMetersLL(a, b);
                    if (d < MIN_SEGMENT_METERS) continue;
                    
                    const { pos: labelPos, rotateDeg } = getMeasLabelPlacement(a, b, 6);
                    segs.push(
                      <React.Fragment key={`${m.id}_seg_${i}`}>
       <DimensionSegment
  a={a}
  b={b}
  opacity={1}
  scale={measureScale}
    pixelLen={getPixelLen(a, b)}
/>
                        {(() => {
  const displayText = (m.segOverrides && m.segOverrides[i]) ?? formatMeters(d);
  return (
    <MeasureLabel
      position={labelPos}
      text={displayText}
      fontScale={measureScale}
      rotateDeg={rotateDeg}
      isEditing={measEdit?.mid === m.id && measEdit?.segIndex === i}
      editValue={measEditValue}
      onEditChange={(v) => setMeasEditValue(v)}
      onEditCommit={commitEditMeasureLabel}
      onEditCancel={cancelEditMeasureLabel}
      onDblClick={() => startEditMeasureLabel(m.id, i, displayText)}
    />
  );
})()}

                      </React.Fragment>
                    );
                  }
                  return <React.Fragment key={m.id}>{segs}</React.Fragment>;
                }
                return null;
              })}

              {/* MEASUREMENTS: preview */}
              {measIsDrawing && measPreviewPath && measPreviewPath.length >= 2 && (
                <>
                  {measMode === "distance" &&
                    (() => {
                      const a = measPreviewPath[0];
                      const b = measPreviewPath[measPreviewPath.length - 1];
                      const d = distMetersLL(a, b);
                      if (d < MIN_SEGMENT_METERS) return null;
                    
                      const { pos: labelPos, rotateDeg } = getMeasLabelPlacement(a, b, 6);
                      return (
                        <>
                      <DimensionSegment
  a={a}
  b={b}
  opacity={1}
  scale={measureScale}
    pixelLen={getPixelLen(a, b)}
/>
                  <MeasureLabel
  position={labelPos}
  text={formatMeters(d)}
  fontScale={measureScale}
  rotateDeg={rotateDeg}
/>

                        </>
                      );
                    })()}

                  {measMode === "combined" &&
                    (() => {
                      const pts = measPreviewPath;
                      const segs = [];
                      for (let i = 0; i < pts.length - 1; i++) {
                        const a = pts[i];
                        const b = pts[i + 1];
                        const d = distMetersLL(a, b);
                        if (d < MIN_SEGMENT_METERS) continue;
                        const { pos: labelPos, rotateDeg } = getMeasLabelPlacement(a, b, 6);
                        segs.push(
                          <React.Fragment key={`meas_preview_seg_${i}`}>
                          <DimensionSegment
  a={a}
  b={b}
  opacity={1}
  zIndex={30}
  scale={measureScale}
   pixelLen={getPixelLen(a, b)}
/>
                            <MeasureLabel
  position={labelPos}
  text={formatMeters(d)}
  fontScale={measureScale}
  rotateDeg={rotateDeg}
/>
                          </React.Fragment>
                        );
                      }
                      return <>{segs}</>;
                    })()}
                </>
              )}

              {/* ========================= LEGEND BOXES ========================= */}
              {legendBoxes.map((lb) => {
                const isSelected =
                  selectedEntity?.kind === "legend" && selectedEntity.id === lb.id;
                const zRef = lb.zRef ?? ELEMENT_BASE_ZOOM;
                const s = contentScalePlan(lb.wPx, zRef, 260);
                return (
                  <OverlayViewF key={lb.id} position={lb.pos} mapPaneName="overlayMouseTarget">
                    <div
                      style={{
                        transform: "translate(-50%, -50%)",
                        transformOrigin: "center center",
                        width: scalePxPlanRounded(lb.wPx, zRef),
                        height: scalePxPlanRounded(lb.hPx, zRef),
                        background: "#fff",
                        border: `${Math.max(1, 2 * s)}px solid ${isSelected ? "#7C3AED" : "#111"}`,
                        borderRadius: 4 * s,
                        boxSizing: "border-box",
                        padding: 10 * s,
                        cursor: uiDrag?.type === "moveLegend" && uiDrag?.id === lb.id ? "grabbing" : "grab",
                        userSelect: "none",
                        position: "relative",
                      }}
                      onContextMenu={(e) => openContextMenu(e, "legend", lb.id, "legend")}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectLegend(lb.id);
                        beginMoveLegend(lb.id, lb.pos, { x: e.clientX, y: e.clientY });
                      }}
                    >
                   <div style={{ fontSize: 18 * s, fontWeight: 900 }}>Legend</div>
        <div style={{ marginTop: 6 * s, height: Math.max(1, 2 * s), background: "#111" }} />
        <div style={{ marginTop: 8 * s }}>
          {(() => {
            const CLABEL = { barrel: "Barrel", barrier: "Barrier", bollard: "Bollard", cone: "Cone", ped_tape: "Ped. Tape", type1: "Type 1", type2: "Type 2" };
            const iconSz = 28 * s;
            const labelSz = 10 * s;
            const gap = 6 * s;
            const itemStyle = { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 * s, width: iconSz + 8 * s };
            const labelStyle = { fontSize: labelSz, textAlign: "center", color: "#222", lineHeight: 1.2, wordBreak: "break-word", maxWidth: iconSz + 8 * s };

            const rows = [];

            // Signs — grouped by code, show icon + code
            const signByCode = {};
            for (const sg of placedSigns) {
              const code = sg.typeId ?? sg.code ?? sg.id;
              if (legendExclusions.has(code)) continue;
              if (!signByCode[code]) signByCode[code] = { src: sg.src, code };
            }
            for (const v of Object.values(signByCode)) {
              rows.push(
                <div key={`sign-${v.code}`} style={itemStyle}>
                  <img src={v.src} alt={v.code} style={{ width: iconSz, height: iconSz, objectFit: "contain" }} />
                  <span style={labelStyle}>{v.code}</span>
                </div>
              );
            }

            // Cones — grouped by typeId, show MarkerVisual + name
            const coneTypes = new Set();
            for (const f of conesFeatures) {
              if (!legendExclusions.has(f.typeId)) coneTypes.add(f.typeId);
            }
            for (const typeId of coneTypes) {
              rows.push(
                <div key={`cone-${typeId}`} style={itemStyle}>
                  <div style={{ width: iconSz, height: iconSz, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MarkerVisual typeId={typeId} strokeScale={1} scale={iconSz / 28} />
                  </div>
                  <span style={labelStyle}>{CLABEL[typeId] || typeId}</span>
                </div>
              );
            }

            // Work areas — show green swatch + label
            if (workAreas.length > 0 && !legendExclusions.has("workArea")) {
              rows.push(
                <div key="workArea" style={itemStyle}>
                  <div style={{ width: iconSz, height: iconSz, background: "rgba(0,200,83,0.18)", border: "2px solid #00c853", borderRadius: 3, boxSizing: "border-box" }} />
                  <span style={labelStyle}>Work Area</span>
                </div>
              );
            }

            if (rows.length === 0) return (
              <div style={{ fontSize: 11 * s, color: "#999", fontStyle: "italic" }}>No items</div>
            );
            return <div style={{ display: "flex", flexWrap: "wrap", gap }}>{rows}</div>;
          })()}
        </div>

                      {isSelected && (
                        <BoxSelectionOverlay
                          w={scalePxPlanRounded(lb.wPx, zRef)}
                          h={scalePxPlanRounded(lb.hPx, zRef)}
                          onBeginResize={(corner, clientPt) =>
                            beginResizeLegend(lb.id, corner, clientPt, {
                              wPx: lb.wPx,
                              hPx: lb.hPx,
                              zRef: lb.zRef ?? ELEMENT_BASE_ZOOM,
                            })
                          }
                        />
                      )}
                    </div>
                  </OverlayViewF>
                );
              })}

              {/* ========================= MANIFEST BOXES ========================= */}
              {manifestBoxes.map((mb) => {
                const isSelected =
                  selectedEntity?.kind === "manifest" && selectedEntity.id === mb.id;
                const zRef = mb.zRef ?? ELEMENT_BASE_ZOOM;
                const s = contentScalePlan(mb.wPx, zRef, 240);

                return (
                  <OverlayViewF key={mb.id} position={mb.pos} mapPaneName="overlayMouseTarget">
                    <div
                      style={{
                        transform: "translate(-50%, -50%)",
                        transformOrigin: "center center",
                        width: scalePxPlanRounded(mb.wPx, zRef),
                        height: scalePxPlanRounded(mb.hPx, zRef),
                        background: "#fff",
                        border: `${Math.max(1, 2 * s)}px solid ${isSelected ? "#7C3AED" : "#111"}`,
                        borderRadius: 4 * s,
                        boxSizing: "border-box",
                        padding: 10 * s,
                        cursor: uiDrag?.type === "moveManifest" && uiDrag?.id === mb.id ? "grabbing" : "grab",
                        userSelect: "none",
                        position: "relative",
                      }}
                      onContextMenu={(e) => openContextMenu(e, "manifest", mb.id, "manifest")}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectManifest(mb.id);
                        beginMoveManifest(mb.id, mb.pos, { x: e.clientX, y: e.clientY });
                      }}
                    >
                      <div style={{ fontSize: 18 * s, fontWeight: 900 }}>Manifest</div>
                      <div style={{ marginTop: 6 * s, height: Math.max(1, 2 * s), background: "#111" }} />

                      <div style={{ marginTop: 8 * s, fontSize: 16 * s, fontWeight: 900, lineHeight: 1.25 }}>
                        {manifestRows.length === 0 ? (
                          <div style={{ fontSize: 13 * s, fontWeight: 700 }}>(no items yet)</div>
                        ) : (
                          manifestRows.map((r) => (
                            <div key={r.label}>
                              {r.count} x {r.label}
                            </div>
                          ))
                        )}
                      </div>

                      {isSelected && (
                        <BoxSelectionOverlay
                          w={scalePxPlanRounded(mb.wPx, zRef)}
                          h={scalePxPlanRounded(mb.hPx, zRef)}
                          onBeginResize={(corner, clientPt) =>
                            beginResizeManifest(mb.id, corner, clientPt, {
                              wPx: mb.wPx,
                              hPx: mb.hPx,
                              zRef: mb.zRef ?? ELEMENT_BASE_ZOOM,
                            })
                          }
                        />
                      )}
                    </div>
                  </OverlayViewF>
                  
                );
              })}
{/* ================= INSERT OBJECTS (Phase 2 render) ================= */}
{insertObjects.map((obj) => {
  const isSelected = selectedInsertId === obj.id;
  const zRef = obj.zRef ?? ELEMENT_BASE_ZOOM;
  const baseW = obj.kind === "title_box" ? 360 : obj.kind === "table" ? 360 : obj.kind === "textbox" ? 260 : 200;
  const s = contentScalePlan(obj.wPx, zRef, baseW);
  const w = scalePxPlanRounded(obj.wPx, zRef);
  const h = scalePxPlanRounded(obj.hPx, zRef);

  // ---------- LINE ----------
  if (obj.kind === "line") {
    return (
      <PolylineF
        key={obj.id}
        path={obj.path}
        options={{
          strokeColor: obj.stroke || "#111111",
          strokeOpacity: 1,
          strokeWeight: obj.strokeWidth || 3,
          clickable: true,
        }}
        onRightClick={(e) => { if (e.domEvent) openContextMenu(e.domEvent, "insert", obj.id, "line"); }}
        onMouseDown={(e) => {
          e.domEvent?.preventDefault?.();
          e.domEvent?.stopPropagation?.();
          setSelectedInsertId(obj.id);
        }}
      />
    );
  }
  

  // Everything else uses Overlay (textbox / text / rect / picture / table / comment)
  return (
    <OverlayViewF
      key={obj.id}
      position={obj.pos || obj.position}
      mapPaneName="overlayMouseTarget"
    >
      <div
      data-insert-id={obj.id}
        style={{
          transform: "translate(-50%, -50%)",
          width: w,
          height: h,
          minWidth: obj.kind === "title_box" ? scalePxPlanRounded(360, zRef) : undefined,
          minHeight: obj.kind === "title_box" ? scalePxPlanRounded(120, zRef) : undefined,
          position: "relative",
          boxSizing: "border-box",
          cursor: "pointer",
          userSelect: "none",
          touchAction: "manipulation",
          outline: isSelected ? "2px solid #2563EB" : "none",
          outlineOffset: 2,
        }}
        
        onContextMenu={(e) => openContextMenu(e, "insert", obj.id, obj.kind ?? "insert")}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedInsertId(obj.id);
          beginMoveInsert(obj.id, obj.pos || obj.position, { x: e.clientX, y: e.clientY });
        }}
      >
      {obj.kind === "title_box" && <TitleBoxContent data={obj.data} scale={s} />}
        {/* ---------- TABLE ---------- */}
        {obj.kind === "table" && (() => {
          const rows = obj.rows ?? (obj.rowHeights?.length ?? 2);
          const cols = obj.cols ?? (obj.colWidths?.length ?? 2);

          const rowHeights = Array.from({ length: rows }, (_, i) => obj.rowHeights?.[i] ?? 60);
          const colWidths  = Array.from({ length: cols }, (_, i) => obj.colWidths?.[i] ?? 120);

          const isCellEditing =
            !!editingCell && editingCell.id === obj.id;

          return (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#fff",
                border: isSelected ? "none" : `${Math.max(1, 2 * s)}px solid #111`,
                boxSizing: "border-box",
                position: "relative",
                overflow: "hidden",
                userSelect: "none",
              }}
            >
              {/* grid — use fr so rows/cols fill container and inner lines connect */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateRows: rowHeights.map((rh) => `${rh}fr`).join(" "),
                  gridTemplateColumns: colWidths.map((cw) => `${cw}fr`).join(" "),
                }}
              >
                {(obj.cells || []).flatMap((row, r) =>
                  row.map((cell, c) => {
                    const isEditing =
                      isCellEditing &&
                      editingCell.r === r &&
                      editingCell.c === c;

                    return (
                      <div
                        key={`${r}-${c}`}
                        style={{
                          borderRight: c === cols - 1 ? "none" : `${Math.max(1, 2 * s)}px solid #111`,
                          borderBottom: r === rows - 1 ? "none" : `${Math.max(1, 2 * s)}px solid #111`,
                          padding: 6 * s,
                          fontFamily: obj.fontFamily || "Arial",
                          fontSize: Math.max(8, (obj.fontSize || 14) * s),
                          overflow: "hidden",
                          outline: "none",
                          background: "transparent",
                          cursor: isEditing ? "text" : "inherit",
                        }}
                        // single click: allow drag unless editing
                        onMouseDown={(e) => {
                          if (isEditing) e.stopPropagation();
                        }}
                        // double click: edit
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingCell({ id: obj.id, r, c });
                          requestAnimationFrame(() => e.currentTarget.focus());
                        }}
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const text = e.currentTarget.textContent ?? "";
                          setEditingCell(null);

                          setInsertObjects((prev) =>
                            prev.map((o) => {
                              if (o.id !== obj.id || o.kind !== "table") return o;
                              const next = structuredClone(o);
                              next.cells[r][c] = text;
                              return next;
                            })
                          );
                        }}
                      >
                        {cell}
                      </div>
                    );
                  })
                )}
              </div>

              {/* column drag handles */}
              {Array.from({ length: cols - 1 }).map((_, i) => {
                const sumCols = colWidths.reduce((a, b) => a + b, 0) || 1;
                const xPct = (100 * sumBefore(colWidths, i + 1)) / sumCols;
                return (
                  <div
                    key={`col-handle-${i}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      tableResizeRef.current = {
                        id: obj.id,
                        type: "col",
                        index: i,
                        startX: ev.clientX,
                        startY: ev.clientY,
                        col0: [...colWidths],
                        row0: [...rowHeights],
                      };
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: `calc(${xPct}% - 6px)`,
                      width: 12,
                      height: "100%",
                      cursor: "col-resize",
                      zIndex: 20,
                      background: "transparent",
                    }}
                    title="Drag to resize column"
                  />
                );
              })}

              {/* row drag handles */}
              {Array.from({ length: rows - 1 }).map((_, i) => {
                const sumRows = rowHeights.reduce((a, b) => a + b, 0) || 1;
                const yPct = (100 * sumBefore(rowHeights, i + 1)) / sumRows;
                return (
                  <div
                    key={`row-handle-${i}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      tableResizeRef.current = {
                        id: obj.id,
                        type: "row",
                        index: i,
                        startX: ev.clientX,
                        startY: ev.clientY,
                        col0: [...colWidths],
                        row0: [...rowHeights],
                      };
                    }}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: `calc(${yPct}% - 6px)`,
                      height: 12,
                      width: "100%",
                      cursor: "row-resize",
                      zIndex: 20,
                      background: "transparent",
                    }}
                    title="Drag to resize row"
                  />
                );
              })}

              {/* outer selection controls (resize/rotate) */}
              {isSelected && (
                <>
                  <BoxSelectionOverlay
                    w={w}
                    h={h}
                    onBeginResize={(corner, clientPt) => {
                      const startPointerPx = clientToDivPx(clientPt.x, clientPt.y);
                      if (!startPointerPx) return;

                      setUiDrag({
                        type: "resizeTable",
                        id: obj.id,
                        corner,
                        startSize: {
                          wPx: obj.wPx,
                          hPx: obj.hPx,
                          zRef: obj.zRef ?? ELEMENT_BASE_ZOOM,
                        },
                        startPointerPx,
                        startCols: [...colWidths],
                        startRows: [...rowHeights],
                      });
                    }}
                  />
                </>
              )}
            </div>
          );
        })()}

        {/* ---------- PICTURE ---------- */}
        {obj.kind === "picture" && (
          <img
            src={obj.dataUrl}
            alt="Inserted"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "fill",
              display: "block",
              pointerEvents: "none",
            }}
          />
        )}

        {/* ---------- RECT ---------- */}
        {obj.kind === "rect" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: obj.fill,
              border: `${Math.max(1, (obj.strokeWidth || 2) * s)}px solid ${obj.stroke}`,
              boxSizing: "border-box",
            }}
          />
        )}

        {/* ---------- TEXTBOX ---------- */}
        {obj.kind === "textbox" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: obj.bg || "#ffffff",
              border: `${Math.max(1, (obj.borderWidth || 1) * s)}px solid ${obj.border || "#111827"}`,
              boxSizing: "border-box",
              padding: 10 * s,
              overflow: "hidden",
              color: obj.color || "#111111",
              fontSize: Math.max(8, (obj.fontSize || 18) * s),
              fontFamily: obj.fontFamily || "Arial",
              lineHeight: 1.2,
              whiteSpace: "pre-wrap",
              position: "relative",
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingInsertId(obj.id);
            }}
          >
            {editingInsertId === obj.id ? (
              <textarea
                autoFocus
                value={obj.text || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setInsertObjects((prev) =>
                    prev.map((it) => (it.id === obj.id ? { ...it, text: val } : it))
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingInsertId(null);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    setEditingInsertId(null);
                  }
                }}
                onBlur={() => setEditingInsertId(null)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  padding: 10 * s,
                  fontSize: Math.max(8, (obj.fontSize || 18) * s),
                  fontFamily: "Arial, sans-serif",
                  lineHeight: 1.2,
                  background: "rgba(255,255,255,0.97)",
                  color: obj.color || "#111111",
                  boxSizing: "border-box",
                }}
              />
            ) : (
              obj.text
            )}
          </div>
        )}

        {/* ---------- TEXT ---------- */}
        {obj.kind === "text" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              color: obj.color || "#111111",
              fontSize: Math.max(8, (obj.fontSize || 22) * s),
              fontFamily: obj.fontFamily || "Arial",
              lineHeight: 1.2,
              whiteSpace: "pre-wrap",
              padding: Math.max(1, 2 * s),
              position: "relative",
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingInsertId(obj.id);
            }}
          >
            {editingInsertId === obj.id ? (
              <input
                autoFocus
                value={obj.text || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setInsertObjects((prev) =>
                    prev.map((it) => (it.id === obj.id ? { ...it, text: val } : it))
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingInsertId(null);
                  if (e.key === "Enter") setEditingInsertId(null);
                }}
                onBlur={() => setEditingInsertId(null)}
                style={{
                  width: "100%",
                  height: "100%",
                  border: `${Math.max(1, s)}px dashed rgba(0,0,0,0.25)`,
                  outline: "none",
                  fontSize: Math.max(8, (obj.fontSize || 22) * s),
                  fontFamily: "Arial, sans-serif",
                  background: "rgba(255,255,255,0.85)",
                  color: obj.color || "#111111",
                  boxSizing: "border-box",
                  padding: Math.max(1, 2 * s),
                }}
              />
            ) : (
              obj.text
            )}
          </div>
        )}

        {/* ---------- COMMENT ---------- */}
        {obj.kind === "comment" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#FEF08A",
              border: `${Math.max(1, 2 * s)}px solid #111`,
              boxSizing: "border-box",
              padding: 10 * s,
              fontFamily: "Arial, sans-serif",
              position: "relative",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 * s, fontSize: 14 * s }}>Comment</div>

            <div
              contentEditable
              suppressContentEditableWarning
              style={{
                outline: "none",
                width: "100%",
                height: "calc(100% - 26px)",
                whiteSpace: "pre-wrap",
                overflow: "auto",
                fontSize: Math.max(8, 14 * s),
              }}
              onInput={(e) => {
                const next = e.currentTarget.textContent || "";
                setInsertObjects((prev) =>
                  prev.map((it) => (it.id === obj.id ? { ...it, text: next } : it))
                );
              }}
            >
              {obj.text || ""}
            </div>
          </div>
        )}
       {/* Resize + Rotate handles (only when selected, and not for line) */}
{isSelected && obj.kind !== "line" && (
  <>
    {/* Resize handles for these kinds */}
    {obj.kind !== "table" && (
      <BoxSelectionOverlay
        w={w}
        h={h}
        onBeginResize={(corner, clientPt) =>
          beginResizeInsert(obj.id, corner, clientPt, {
            wPx: obj.wPx,
            hPx: obj.hPx,
          })
        }
      />
    )}

    {/* Rotate handle (not for title_box, textbox, rect, text, table, picture) */}
    {!["title_box", "textbox", "rect", "text", "table", "picture"].includes(obj.kind) && (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: h + 22,
        transform: "translate(-50%, -50%)",
        width: 34,
        height: 34,
        borderRadius: 999,
        border: "1px solid rgba(17,24,39,0.25)",
        background: "rgba(255,255,255,0.92)",
        display: "grid",
        placeItems: "center",
        cursor: "grab",
        pointerEvents: "auto",
        boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        beginRotateInsert(obj.id, { x: e.clientX, y: e.clientY });
      }}
    >
      <RotateIcon active={false} />
    </div>
    )}
  </>
)}



      </div>
    </OverlayViewF>
  );
})}

              {/* ================= PICTURE GHOST PREVIEW ================= */}
              {activeTool === "insert:picture" && pendingPictureTool && pictureGhostPos && (
                <OverlayViewF position={pictureGhostPos} mapPaneName="overlayMouseTarget">
                  <div
                    style={{
                      transform: "translate(-50%, -50%)",
                      width: pendingPictureTool.wPx * elementScale,
height: pendingPictureTool.hPx * elementScale,
                      opacity: 0.65,
                      pointerEvents: "none",
                      filter: "none",
                    }}
                  >
                    <img
                      src={pendingPictureTool.dataUrl}
                      alt="preview"
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                  </div>
                </OverlayViewF>
              )}

{/* ================= LINE DRAFT PREVIEW ================= */}
{activeTool === "insert:line" && lineDraft?.points?.length && (
  <PolylineF
    path={[...lineDraft.points, lineDraft.end || lineDraft.points[lineDraft.points.length - 1]]}
    options={{
      strokeColor: "#111111",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      clickable: false,
    }}
  />
)}



              {/* ========================= NORTH ARROWS ========================= */}
{northArrows.map((na) => {
  const isSelected =
    selectedEntity?.kind === "northArrow" && selectedEntity.id === na.id;

  return (
    <OverlayViewF
      key={na.id}
      position={na.pos}
      mapPaneName="overlayMouseTarget"
    >
      <div
        style={{
          transform: "translate(-50%, -50%)",
          width: scalePxPlanRounded(na.wPx, na.zRef),
          height: scalePxPlanRounded(na.hPx, na.zRef),
          background: "transparent",
          border: "none",
          boxSizing: "border-box",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          userSelect: "none",
          position: "relative",
          overflow: "visible", // IMPORTANT: allow rotate handle
        }}
        onContextMenu={(e) => openContextMenu(e, "northArrow", na.id, "northArrow")}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedEntity({ kind: "northArrow", id: na.id });
          beginMoveNorthArrow(na.id, na.pos, { x: e.clientX, y: e.clientY });
        }}
      >
        {/* ROTATED ARROW */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            transform: `rotate(${na.rotDeg}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          <NorthArrowSVG />
        </div>

        {/* SELECTION */}
        {isSelected && (
          <>
            {/* Resize handles */}
            <BoxSelectionOverlay
              w={scalePxPlanRounded(na.wPx, na.zRef)}
              h={scalePxPlanRounded(na.hPx, na.zRef)}
              onBeginResize={(corner, clientPt) =>
                beginResizeNorthArrow(na.id, corner, clientPt, {
                  wPx: na.wPx,
                  hPx: na.hPx,
                  zRef: na.zRef ?? ELEMENT_BASE_ZOOM,
                })
              }
            />

            {/* Rotate handle */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: scalePxPlanRounded(na.hPx, na.zRef) + 22,
                transform: "translate(-50%, -50%)",
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(17,24,39,0.25)",
                background: "rgba(255,255,255,0.92)",
                display: "grid",
                placeItems: "center",
                cursor: "grab",
                pointerEvents: "auto",
                boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const centerPx = latLngToPx(na.pos);
                if (!centerPx) return;

                const startPointerPx = clientToDivPx(
                  e.clientX,
                  e.clientY
                );
                if (!startPointerPx) return;

                const pointerAngleDeg =
                  (Math.atan2(
                    startPointerPx.y - centerPx.y,
                    startPointerPx.x - centerPx.x
                  ) *
                    180) /
                  Math.PI;

                setUiDrag({
                  type: "rotateNorthArrow",
                  arrowId: na.id,
                  centerPx,
                  startAngleDeg: na.rotDeg,
                  startPointerAngleDeg: pointerAngleDeg,
                });
              }}
            >
              <RotateIcon active={false} />
            </div>
          </>
        )}
      </div>
    </OverlayViewF>
  );
})}

{/* ===================== SCALES (Plan Scale bar — scales with zoom like legend) ===================== */}
{scales.map((scale) => {
  const scaleZRef = scale.zRef ?? ELEMENT_BASE_ZOOM;
  const scaleW = scalePxPlanRounded(scale.wPx, scaleZRef);
  const scaleH = scalePxPlanRounded(scale.hPx, scaleZRef);
  return (
  <OverlayViewF
    key={scale.id}
    position={scale.pos}
    mapPaneName="overlayMouseTarget"
  >
  <div
  onContextMenu={(e) => openContextMenu(e, "scale", scale.id, "scale")}
  onMouseDown={(e) => {
    e.preventDefault();
    e.stopPropagation();

    // select
    setSelectedEntity({ kind: "scale", id: scale.id });

    // ✅ only start move if NOT clicking a handle
    if (e.target?.dataset?.handle === "1") return;

    beginMoveScale(scale.id, scale.pos, { x: e.clientX, y: e.clientY });
  }}
  style={{
    transform: "translate(-50%, -50%)",
    transformOrigin: "center center",
    width: scaleW,
    height: scaleH,
    pointerEvents: "auto",
    background: "transparent",
    backgroundColor: "transparent",
    border: "none",
    position: "relative",
    cursor:
      uiDrag?.type === "moveScale" && uiDrag?.scaleId === scale.id
        ? "grabbing"
        : "grab",
    userSelect: "none",
  }}
>
  <div style={{ width: "100%", height: "100%", background: "transparent", backgroundColor: "transparent" }}>
    <ScaleBarSVG />
  </div>
  {selectedEntity?.kind === "scale" && selectedEntity?.id === scale.id && (
  <BoxSelectionOverlay
    w={scaleW}
    h={scaleH}
    onBeginResize={(corner, clientPt) =>
      beginResizeScale(scale.id, corner, clientPt, { wPx: scale.wPx, hPx: scale.hPx, zRef: scale.zRef ?? ELEMENT_BASE_ZOOM })
    }
    onBeginRotate={null}
    rotateGapPx={22}
  />
)}
</div>
  </OverlayViewF>
  );
})}


  

{/* ================= WORK AREAS (SAVED) ================= */}
{workAreas
  .filter((a) => a.id !== selectedWorkAreaId)
  .map((a) => (
    <PolygonF
      key={a.id}
      path={a.path}
      options={{
        clickable: false,
        zIndex: 0,
        strokeColor: "#00c853",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#00c853",
        fillOpacity: 0.12,
      }}
    />
  ))}


{/* ================= WORK AREA (LIVE PREVIEW) ================= */}
{activeTool === "work_area" &&
  isDrawingWorkArea &&
  !selectedWorkAreaId &&
  workDraft.length >= 3 && (
  <PolygonF
    paths={workDraft}
    options={{
      ...WORKAREA_POLY_OPTS,
      // make preview slightly stronger so user “feels” it live
      fillOpacity: 0.28,
    }}
  />
)}



              {/* ========================= SIGNS + STANDS ========================= */}
              {placedSigns.map((s) => {
                const isSelected =
                  selectedEntity?.kind === "sign" && selectedEntity.id === s.id;
                const isMovingSign =
                  uiDrag?.type === "moveSign" && uiDrag.signId === s.id;

                // Visual size that follows map zoom (ground-anchored feel)
                const signZRef = s.zRef ?? ELEMENT_BASE_ZOOM;
                // Use the live Google Maps zoom so sign/support/selection stay locked
                // during animated zoom (avoids 1-frame React state lag).
                const liveZoom = mapRef.current?.getZoom?.() ?? zoomNow;
                const signW = Math.round((s.wPx ?? 64) * Math.pow(2, liveZoom - signZRef));
                const signH = Math.round((s.hPx ?? 64) * Math.pow(2, liveZoom - signZRef));

                // During resize: s.pos is NOT updated each frame (avoids OverlayViewF
                // destroy/recreate). Outer wrapper uses translate() in screen space so the
                // geometric center follows the fixed opposite corner; inner wrapper rotates
                // with transform-origin center (no pre-rotation translate mixing).
                const _isResizingThis = uiDrag?.type === "resizeSign" && uiDrag.signId === s.id;
                let _resizeTx = 0, _resizeTy = 0;
                if (_isResizingThis) {
                  const _c = uiDrag.corner ?? "se";
                  const _ssW = uiDrag.startSignW ?? signW;
                  const _ssH = uiDrag.startSignH ?? signH;
                  const _dW = signW - _ssW;
                  const _dH = signH - _ssH;
                  const pin = signResizeCenterOffsetPx(_c, _dW, _dH, s.rotDeg ?? 0);
                  _resizeTx = pin.x;
                  _resizeTy = pin.y;
                }

                return (
                  <React.Fragment key={s.id}>
                    {/* Connectors are now rendered by SignConnectorOverlay (custom
                        google.maps.OverlayView whose draw() runs on every Maps frame)
                        so they stay perfectly attached at all zoom levels. */}

                    {/* Supports (tripod / windmaster) – scale with map like construction sign */}
                    {projectionReady &&
                      (s.stands || []).map((st) => {
                        const isDragging =
                          uiDrag?.type === "moveStand" &&
                          uiDrag.signId === s.id &&
                          uiDrag.standId === st.id;
                        const isSelectedStand =
                          selectedEntity?.kind === "stand" &&
                          selectedEntity.signId === s.id &&
                          selectedEntity.standId === st.id;
                        // Keep stand visuals scaling in lockstep with the sign's rounded width,
                        // so connectors + icons stay naturally attached during zoom.
                        const baseW = s.wPx ?? 64;
                        const standMapScale = signW / baseW;
                        return (
                          <SignSupportItem
                            key={st.id}
                            stand={st}
                            signId={s.id}
                            isSelected={isSelectedStand}
                            isDragging={isDragging}
                            mapScale={standMapScale}
                            onSelect={() => {
                              onSelectStand(s.id, st.id);
                            }}
                            onBeginDrag={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              if (!projectionReady) return;
                              const startPosPx = latLngToPx(st.pos);
                              if (!startPosPx) return;
                              const startPointerPx = clientToDivPx(ev.clientX, ev.clientY);
                              if (!startPointerPx) return;
                              const offsetPx = {
                                x: startPointerPx.x - startPosPx.x,
                                y: startPointerPx.y - startPosPx.y,
                              };
                              lockMapInteractions(true);
                              onSelectStand(s.id, st.id);
                              setUiDrag({
                                type: "moveStand",
                                signId: s.id,
                                standId: st.id,
                                offsetPx,
                              });
                            }}
                          />
                        );
                      })}

                    {/* Stand rotation handle – scales with map like stand icon */}
                    {projectionReady &&
                      (s.stands || [])
                        .filter(
                          (st) =>
                            selectedEntity?.kind === "stand" &&
                            selectedEntity.signId === s.id &&
                            selectedEntity.standId === st.id
                        )
                        .map((st) => {
                          const baseW = s.wPx ?? 64;
                          const standMapScale = signW / baseW;
                          return (
                          <OverlayViewF
                            key={`${st.id}_rotate`}
                            position={st.pos}
                            mapPaneName="overlayMouseTarget"
                            zIndex={96200}
                          >
                            <div
                              style={{
                                position: "relative",
                                pointerEvents: "none",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: "50%",
                                  bottom: -28 * standMapScale,
                                  transform: "translateX(-50%)",
                                  width: 18 * standMapScale,
                                  height: 18 * standMapScale,
                                  borderRadius: "999px",
                                  background: "#fff",
                                  border:
                                    uiDrag?.type === "rotateStand" &&
                                    uiDrag.signId === s.id &&
                                    uiDrag.standId === st.id
                                      ? "2px solid #2563EB"
                                      : "2px solid #111",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor:
                                    uiDrag?.type === "rotateStand" &&
                                    uiDrag.signId === s.id &&
                                    uiDrag.standId === st.id
                                      ? "grabbing"
                                      : "grab",
                                  pointerEvents: "auto",
                                }}
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  rotateStandGuardRef.current = true;
                                  // mirror sign + north-arrow behavior: let map mousemove drive rotation
                                  if (!projectionReady) return;

                                  const centerPx = latLngToPx(st.pos);
                                  if (!centerPx) return;

                                  const startPointerPx = clientToDivPx(ev.clientX, ev.clientY);
                                  if (!startPointerPx) return;

                                  const pointerAngleDeg =
                                    (Math.atan2(
                                      startPointerPx.y - centerPx.y,
                                      startPointerPx.x - centerPx.x
                                    ) *
                                      180) /
                                    Math.PI;

                                  setUiDrag({
                                    type: "rotateStand",
                                    signId: s.id,
                                    standId: st.id,
                                    centerPx,
                                    startAngleDeg: st.rotDeg ?? st.rotationDeg ?? 0,
                                    startPointerAngleDeg: pointerAngleDeg,
                                  });
                                }}
                              >
                                <RotateIcon
                                  active={
                                    uiDrag?.type === "rotateStand" &&
                                    uiDrag.signId === s.id &&
                                    uiDrag.standId === st.id
                                  }
                                  style={{ width: 14 * standMapScale, height: 14 * standMapScale }}
                                />
                              </div>
                            </div>
                          </OverlayViewF>
                          );
                        })}

                    {/* Sign - zIndex above page frame (90000) so sign receives pointer events */}
                    <OverlayViewF
                      position={s.pos}
                      mapPaneName="overlayMouseTarget"
                      zIndex={95000}
                    >
                      <div
                        style={{
                          transform: "translate(-50%, -50%)",
                          position: "relative",
                          display: "inline-block",
                          // Keep selection handles fully visible.
                          // (Handles sit on the exact corner points and extend slightly out.)
                          // Image cropping is handled by <img objectFit="cover">.
                          overflow: "visible",
                        }}
                      >
                        <div
                          data-sign-interactive="1"
                          data-sign-id={s.id}
                          style={{
                            transform: `rotate(${s.rotDeg ?? 0}deg)`,
                            transformOrigin: "center center",
                            width: signW,
                            height: signH,
                            pointerEvents: "auto",
                            cursor: isMovingSign ? "grabbing" : "pointer",
                            userSelect: "none",
                            filter: "none",
                            position: "relative",
                          }}
                          onMouseEnter={() => setSignHoveredId(s.id)}
                          onMouseLeave={() => setSignHoveredId(null)}
                          onContextMenu={(ev) => openContextMenu(ev, "sign", s.id, s.typeId ?? s.code ?? s.id)}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            onSelectSign(s.id);
                          }}
                          onPointerDown={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            ev.currentTarget.setPointerCapture?.(ev.pointerId);
                            onSelectSign(s.id);
                            beginMoveSign(s.id, s.pos, { x: ev.clientX, y: ev.clientY });
                          }}
                        >
                          <img
                            src={s.src}
                            alt={normalizeSignCode(s.code)}
                            draggable={false}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              // Use cover so the visible sign pixels stay locked to the
                              // blue selection box edges for square/rectangular/diamond
                              // assets that may contain intrinsic transparent padding.
                              objectFit: "cover",
                              objectPosition: "center",
                              display: "block",
                              pointerEvents: "none",
                              zIndex: 0,
                            }}
                          />
                        {/* Selection overlay anchored to the exact same DOM box as the sign image */}
                        {isSelected && projectionReady && (() => {
                          const catalogEntry = getSignById(s.code);
                          // When catalog entry missing (e.g. legacy plan), allow full behavior for backward compat
                          const showSupportActions =
                            !catalogEntry ||
                            catalogEntry.supportsTripod ||
                            catalogEntry.supportsWindmaster;
                          const showRotateHandle =
                            catalogEntry == null ||
                            catalogEntry.supportsRotation !== false;
                          return (
                            <SignSelectionOverlay
                              embedded
                              sign={{ ...s, wPx: signW, hPx: signH }}
                              rotateGapPx={ROTATE_HANDLE_GAP_PX}
                              isMoving={isMovingSign}
                              isRotating={
                                uiDrag?.type === "rotateSign" && uiDrag.signId === s.id
                              }
                              showRotateHandle={showRotateHandle}
                              onMouseEnter={() => setSignHoveredId(s.id)}
                              onMouseLeave={() => setSignHoveredId(null)}
                              onBeginMove={(clientPt) => {
                                beginMoveSign(s.id, s.pos, clientPt);
                              }}
                              onBeginRotate={(clientPt) => {
                                // Compute centerPx in map-div CSS pixel space (same space
                                // as clientToDivPx) by reading the sign element's bounding
                                // rect from the DOM. Using latLngToPx() instead would give
                                // overlay-pane div pixel coords — a different coordinate
                                // system that drifts ±1–2 px per frame as Google Maps
                                // recalculates its overlay transform, causing vibration.
                                const signEl = document.querySelector(
                                  `[data-sign-id="${s.id}"]`
                                );
                                const signRect = signEl?.getBoundingClientRect();
                                let centerPx = null;
                                if (signRect) {
                                  const cc = clientToDivPx(
                                    signRect.left + signRect.width / 2,
                                    signRect.top + signRect.height / 2
                                  );
                                  if (cc) centerPx = { x: cc.x, y: cc.y };
                                }
                                // Fallback to projection if DOM element not yet painted
                                if (!centerPx) {
                                  const c0 = latLngToPx(s.pos);
                                  if (c0) centerPx = { x: c0.x, y: c0.y };
                                }
                                if (!centerPx) return;

                                const p0 = clientToDivPx(
                                  clientPt.x,
                                  clientPt.y
                                );
                                const startPointerPx = p0 || null;
                                if (!startPointerPx) return;

                                const pointerAngleDeg =
                                  (Math.atan2(
                                    startPointerPx.y - centerPx.y,
                                    startPointerPx.x - centerPx.x
                                  ) *
                                    180) /
                                  Math.PI;

                                lockMapInteractions(true);
                                rotateSignLiveRef.current = { lastAngleDeg: pointerAngleDeg, accumulatedDeg: 0 };
                                setUiDrag({
                                  type: "rotateSign",
                                  signId: s.id,
                                  signPos: s.pos,
                                  centerPx,
                                  startAngleDeg: s.rotDeg ?? 0,
                                  pointerId: clientPt.pointerId,
                                });
                              }}
                              onBeginResize={(corner, clientPt) => {
                                const startPointerPx = clientToDivPx(
                                  clientPt.x,
                                  clientPt.y
                                );
                                if (!startPointerPx) return;
                                // startCenterPx must be in overlay-pane div-pixel space
                                // Store the visual size at drag-start so the CSS-transform
                                // approach can compute the correct translate() each frame.
                                // We do NOT update s.pos during the drag (avoids OverlayViewF
                                // destroy/recreate on every frame). The position is committed
                                // once on mouseup.
                                // Lock map interactions so a stray scroll or pan during
                                // the drag cannot fire draw() on the overlay, which would
                                // reposition the container using the frozen offset and break
                                // the visual corner-pin. Unlocked in the drag-end handler.
                                lockMapInteractions(true);
                                setUiDrag({
                                  type: "resizeSign",
                                  signId: s.id,
                                  corner,
                                  anchorLatLng: { lat: s.pos.lat, lng: s.pos.lng },
                                  startSize: {
                                    wPx: s.wPx,
                                    hPx: s.hPx,
                                    zRef: signZRef,
                                    rotDeg: s.rotDeg ?? 0,
                                  },
                                  startSignW: signW,
                                  startSignH: signH,
                                  startPointerPx,
                                });
                              }}
                              onBeginCreateStand={
                                showSupportActions
                                  ? (standType, clientPt) => {
                                      if (!projectionReady) return;
                                      lockMapInteractions(true);
                                      // Anchor = sign's edge in overlay-pane pixels.
                                      // offsetPx stores (grabPx_css - anchorPx_overlay); the mixed
                                      // units cancel correctly in the move handler:
                                      //   curPx - offsetPx = anchorPx + (curPx - grabPx)
                                      //                    = overlay_edge + css_delta  ← same scale
                                      const centerPx = latLngToPx(s.pos);
                                      if (!centerPx) return;
                                      const side = standType === "tripod" ? -1 : 1;
                                      const local = { x: (signW / 2) * side, y: 0 };
                                      const th = ((s.rotDeg ?? 0) * Math.PI) / 180;
                                      const dx = local.x * Math.cos(th) - local.y * Math.sin(th);
                                      const dy = local.x * Math.sin(th) + local.y * Math.cos(th);
                                      const anchorPx = { x: centerPx.x + dx, y: centerPx.y + dy };
                                      const anchorPos = pxToLatLng(anchorPx);
                                      if (!anchorPos) return;
                                      const grabPx = clientPt ? clientToDivPx(clientPt.x, clientPt.y) : null;
                                      const offsetPx = grabPx
                                        ? { x: grabPx.x - anchorPx.x, y: grabPx.y - anchorPx.y }
                                        : { x: 0, y: 0 };
                                      setUiDrag({
                                        type: "createStand",
                                        signId: s.id,
                                        standType,
                                        hoverPos: anchorPos,
                                        offsetPx,
                                      });
                                    }
                                  : undefined
                              }
                            />
                          );
                        })()}
                        {showSignCodes && (
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: "100%",
                              transform: "translate(-50%, 6px)",
                              background: "rgba(255,255,255,0.95)",
                              border: "1px solid #111",
                              borderRadius: 6,
                              padding: "2px 6px",
                              fontSize: 12,
                              fontWeight: 900,
                              color: "#111",
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                            }}
                          >
                            {normalizeSignCode(s.code)}
                          </div>
                        )}
                        </div>
                      </div>
                    </OverlayViewF>
                  </React.Fragment>
                );
              })}

              {/* Stand placement preview – scales with map like construction sign */}
              {uiDrag?.type === "createStand" && selectedSign && uiDrag.hoverPos && (() => {
                const previewMapScale = Math.max(0.35, Math.min(2, zoomScale(selectedSign.zRef ?? ELEMENT_BASE_ZOOM)));
                // Preview connector – same overlay-pane SVG approach as committed connectors
                const previewOverlayProj = getProjection();
                const previewConnector = (() => {
                  if (!previewOverlayProj || !projectionReady || !window.google?.maps) return null;
                  const previewSignZRef = selectedSign.zRef ?? ELEMENT_BASE_ZOOM;
                  const psCtr = previewOverlayProj.fromLatLngToDivPixel(
                    new window.google.maps.LatLng(selectedSign.pos.lat, selectedSign.pos.lng)
                  );
                  const hoverPx = previewOverlayProj.fromLatLngToDivPixel(
                    new window.google.maps.LatLng(uiDrag.hoverPos.lat, uiDrag.hoverPos.lng)
                  );
                  if (!psCtr || !hoverPx) return null;
                  const side = uiDrag.standType === "tripod" ? -1 : 1;
                  const th = ((selectedSign.rotDeg ?? 0) * Math.PI) / 180;
                  const liveZoom = mapRef.current?.getZoom?.() ?? zoomNow;
                  const halfW = (selectedSign.wPx ?? 64) * 0.5 * Math.pow(2, liveZoom - previewSignZRef);
                  return (
                    <OverlayViewF
                      position={selectedSign.pos}
                      mapPaneName="overlayLayer"
                      zIndex={89000}
                      getPixelPositionOffset={() => ({ x: 0, y: 0 })}
                    >
                      <svg
                        style={{ position: "absolute", left: 0, top: 0, width: "1px", height: "1px", overflow: "visible", pointerEvents: "none" }}
                      >
                        <line
                          x1={side * halfW * Math.cos(th)} y1={side * halfW * Math.sin(th)}
                          x2={hoverPx.x - psCtr.x} y2={hoverPx.y - psCtr.y}
                          stroke="#111" strokeWidth={2} strokeDasharray="0.01 8" strokeLinecap="round"
                        />
                      </svg>
                    </OverlayViewF>
                  );
                })();
                return (
                <>
                  {previewConnector}
                  <OverlayViewF position={uiDrag.hoverPos} mapPaneName="overlayMouseTarget" zIndex={97000}>
                    <div
                      style={{
                        transform: "translate(-50%, -50%)",
                        cursor: "crosshair",
                        pointerEvents: "none",
                      }}
                    >
                      {uiDrag.standType === "tripod" ? (
                        <svg viewBox="0 0 64 64" width={28 * previewMapScale} height={28 * previewMapScale}>
                          <rect x="10" y="10" width="44" height="10" rx="1.5" fill="#000" />
                          <rect x="30" y="20" width="4" height="30" fill="#000" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 96 64" width={40 * previewMapScale} height={28 * previewMapScale}>
                          <circle cx="22" cy="42" r="18" fill="#000" />
                          <circle cx="74" cy="42" r="18" fill="#000" />
                          <rect x="10" y="56" width="76" height="8" fill="#000" />
                        </svg>
                      )}
                    </div>
                  </OverlayViewF>
                </>
                );
              })()}
            </GoogleMap>

              {/* Export area overlay: dim outside + blue resizable/movable box */}
              {exportMode && printAreaBounds && projectionReady && !exportCaptureInProgress && (() => {
                const isExportDragging = uiDrag?.type === "resizeExportArea" || uiDrag?.type === "moveExportArea";
                const r = isExportDragging
                  ? (exportResizeRef.current?.lastRect ?? exportLiveRect ?? boundsToRectPx(printAreaBounds))
                  : boundsToRectPx(printAreaBounds);
                if (!r || r.w < 10 || r.h < 10) return null;
                const HANDLE = 12;
                const OFF = -6;
                const handles = [
                  { key: "nw", x: OFF, y: OFF, cursor: "nwse-resize", kind: "corner" },
                  { key: "ne", x: r.w - OFF - HANDLE, y: OFF, cursor: "nesw-resize", kind: "corner" },
                  { key: "sw", x: OFF, y: r.h - OFF - HANDLE, cursor: "nesw-resize", kind: "corner" },
                  { key: "se", x: r.w - OFF - HANDLE, y: r.h - OFF - HANDLE, cursor: "nwse-resize", kind: "corner" },
                  { key: "n", x: r.w / 2 - 10, y: OFF, cursor: "ns-resize", kind: "edge" },
                  { key: "s", x: r.w / 2 - 10, y: r.h - OFF - HANDLE, cursor: "ns-resize", kind: "edge" },
                  { key: "w", x: OFF, y: r.h / 2 - 10, cursor: "ew-resize", kind: "edge" },
                  { key: "e", x: r.w - OFF - HANDLE, y: r.h / 2 - 10, cursor: "ew-resize", kind: "edge" },
                ];
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 95000,
                      pointerEvents: "none",
                    }}
                  >
                    {/* Dim overlay with cutout */}
                    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      <defs>
                        <mask id={`export-area-mask-${r.x}-${r.y}`}>
                          <rect x="0" y="0" width="100%" height="100%" fill="white" />
                          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="black" />
                        </mask>
                      </defs>
                      <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.4)" mask={`url(#export-area-mask-${r.x}-${r.y})`} />
                    </svg>
                    {/* Blue export box with move + resize handles */}
                    <div
                      style={{
                        position: "absolute",
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        pointerEvents: "auto",
                        cursor: (uiDrag?.type === "moveExportArea" || uiDrag?.type === "resizeExportArea") ? "grabbing" : "move",
                      }}
                      onMouseDown={(e) => {
                        if (!e.target.closest?.("[data-export-handle]")) {
                          e.preventDefault();
                          e.stopPropagation();
                          beginMoveExportArea({ x: e.clientX, y: e.clientY });
                        }
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          border: "2px solid #2563EB",
                          borderRadius: 2,
                          boxSizing: "border-box",
                          background: "transparent",
                          zIndex: 2,
                          pointerEvents: "none",
                        }}
                      />
                      {/* Aerial preview fills the blue box exactly.
                          objectFit "fill" stretches the image to match the box dimensions.
                          The image was fetched with the same aspect ratio as the blue box
                          (worldW × worldH), so there is no visible distortion — the image
                          simply fills the box pixel-perfectly without any cropping. */}
                      {exportPreviewUrl && (
                        <img
                          src={exportPreviewUrl}
                          alt="Aerial preview"
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "fill",
                            borderRadius: 2,
                            zIndex: 1,
                            pointerEvents: "none",
                            display: "block",
                          }}
                        />
                      )}
                      {handles.map((hnd) => (
                        <div
                          key={hnd.key}
                          style={{
                            position: "absolute",
                            left: hnd.x,
                            top: hnd.y,
                            width: hnd.kind === "edge" ? (hnd.key === "w" || hnd.key === "e" ? 10 : 20) : HANDLE,
                            height: hnd.kind === "edge" ? (hnd.key === "w" || hnd.key === "e" ? 20 : 10) : HANDLE,
                            background: "#fff",
                            border: "1px solid #111",
                            borderRadius: 2,
                            cursor: hnd.cursor,
                            pointerEvents: "auto",
                          }}
                          data-export-handle
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                            beginResizeExportArea(hnd.key, { x: e.clientX, y: e.clientY }, r);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

           {mapReady && <MapScrollbars mapRef={mapRef} />}

              {/* ── Export Panel: two buttons from the start ── */}
              {exportMode && printAreaBounds && !exportCaptureInProgress && (
                <div
                  className="no-print"
                  style={{
                    position: "absolute", right: 16, top: 16, zIndex: 100000,
                    display: "flex", flexDirection: "column", gap: 8,
                    background: "#fff", borderRadius: 10,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                    border: "1px solid #e5e7eb", padding: 14,
                    fontFamily: "system-ui, sans-serif", minWidth: 210,
                  }}
                >
                  {exportPreviewUrl ? (
                    /* ── Aerial preview loaded: confirm or go back ── */
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                        🛰 Aerial Preview Ready
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 8, lineHeight: 1.5 }}>
                        High-resolution imagery has been stitched for the selected region.
                        Resize the blue box to adjust, then generate.
                      </div>
                      <button
                        onClick={() => {
                          // Size check only (pixel rect used for validation, not projection)
                          const isD = uiDrag?.type === "resizeExportArea" || uiDrag?.type === "moveExportArea";
                          const rect = isD
                            ? (exportResizeRef.current?.lastRect ?? exportLiveRect ?? boundsToRectPx(printAreaBounds))
                            : boundsToRectPx(printAreaBounds);
                          if (!rect || rect.w < 10 || rect.h < 10) { alert("Export area is too small."); return; }
                          setExportPreviewUrl(null);
                          // Use exportBoundsForPdfRef (accurate lat/lng) — avoids linear lat
                          // interpolation error that occurs when deriving bounds from screen pixels.
                          exportSelectionToPdf(null, null);
                        }}
                        style={{
                          padding: "10px 14px", fontSize: 13, fontWeight: 700, textAlign: "left",
                          background: "#15803d", color: "#fff", border: "none",
                          borderRadius: 7, cursor: "pointer", lineHeight: 1.3,
                        }}
                      >
                        ✅ Generate Aerial PDF
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 3 }}>
                          Export high-resolution aerial imagery PDF
                        </div>
                      </button>
                      <button
                        onClick={() => setExportPreviewUrl(null)}
                        style={{
                          padding: "8px 14px", fontSize: 12, fontWeight: 600, textAlign: "left",
                          background: "#f3f4f6", color: "#374151",
                          border: "1px solid #d1d5db", borderRadius: 7, cursor: "pointer",
                        }}
                      >
                        ← Back to options
                      </button>
                      <button
                        onClick={cancelExportToPdf}
                        style={{
                          padding: "6px 8px", fontSize: 11,
                          background: "#fff", color: "#6b7280",
                          border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
                        }}
                      >Cancel</button>
                    </>
                  ) : (
                    /* ── Default: two export options ── */
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
                        Resize the blue box, then choose export type:
                      </div>

                      {/* ── Option 1: Standard PDF ──────────────────────────────────────────
                          Captures the map exactly as displayed on screen (screenshot-based).
                          Keeps all visible overlays, current zoom, and active map layer.     */}
                      <button
                        onClick={() => {
                          const isD = uiDrag?.type === "resizeExportArea" || uiDrag?.type === "moveExportArea";
                          const rect = isD
                            ? (exportResizeRef.current?.lastRect ?? exportLiveRect ?? boundsToRectPx(printAreaBounds))
                            : boundsToRectPx(printAreaBounds);
                          if (!rect || rect.w < 10 || rect.h < 10) { alert("Export area is too small."); return; }
                          runExportToPdf(rect);
                        }}
                        style={{
                          padding: "10px 14px", fontSize: 13, fontWeight: 700, textAlign: "left",
                          background: "#1e3a8a", color: "#fff", border: "none",
                          borderRadius: 7, cursor: "pointer", lineHeight: 1.3,
                        }}
                      >
                        🗺 Standard PDF
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.8, marginTop: 3 }}>
                          Keeps current map appearance and on-screen layout
                        </div>
                      </button>

                      {/* ── Option 2: Aerial PDF ────────────────────────────────────────────
                          Implementation: tile stitching (Method 1).
                          Downloads multiple imagery tiles covering the selected region,
                          then stitches them into a single high-resolution image aligned to
                          the exact lat/lng bounds of the blue box.  This avoids the blur and
                          misalignment that single-tile or screenshot-based approaches produce.
                          The stitched canvas is previewed inside the blue box before export.  */}
                      <button
                        disabled={exportPreviewLoading}
                        onClick={loadExportPreview}
                        style={{
                          padding: "10px 14px", fontSize: 13, fontWeight: 700, textAlign: "left",
                          background: exportPreviewLoading ? "#9ca3af" : "#15803d", color: "#fff",
                          border: "none", borderRadius: 7,
                          cursor: exportPreviewLoading ? "not-allowed" : "pointer", lineHeight: 1.3,
                        }}
                      >
                        {exportPreviewLoading ? (
                          <>⏳ Building aerial imagery…</>
                        ) : (
                          <>
                            🛰 Aerial PDF
                            <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 3 }}>
                              Rebuilds selected region using high-resolution aerial imagery
                            </div>
                          </>
                        )}
                      </button>

                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button
                          onClick={resetExportAreaToViewport}
                          style={{
                            flex: 1, padding: "6px 8px", fontSize: 11,
                            background: "#f3f4f6", color: "#374151",
                            border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
                          }}
                        >Reset</button>
                        <button
                          onClick={cancelExportToPdf}
                          style={{
                            flex: 1, padding: "6px 8px", fontSize: 11,
                            background: "#fff", color: "#6b7280",
                            border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
                          }}
                        >Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}

          
        
            </div>
          )}
        </div>
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onCut={handleContextCut}
          onCopy={handleContextCopy}
          onToggleLegend={handleLegendToggle}
          legendExclusions={legendExclusions}
        />
      )}
      </main>
    </div>
  );


/** =========================
 * Page frame boundary box (same handle mechanism as picture/insert box)
 * ========================= */
function PageFrameBox({ w, h, onBeginResize }) {
  const HANDLE = 12;
  const OFF = -6;
  const handles = [
    { key: "nw", x: OFF, y: OFF, cursor: "nwse-resize", kind: "corner" },
    { key: "ne", x: w - OFF - HANDLE, y: OFF, cursor: "nesw-resize", kind: "corner" },
    { key: "sw", x: OFF, y: h - OFF - HANDLE, cursor: "nesw-resize", kind: "corner" },
    { key: "se", x: w - OFF - HANDLE, y: h - OFF - HANDLE, cursor: "nwse-resize", kind: "corner" },
    { key: "n", x: w / 2 - 10, y: OFF, cursor: "ns-resize", kind: "edge" },
    { key: "s", x: w / 2 - 10, y: h - OFF - HANDLE, cursor: "ns-resize", kind: "edge" },
    { key: "w", x: OFF, y: h / 2 - 10, cursor: "ew-resize", kind: "edge" },
    { key: "e", x: w - OFF - HANDLE, y: h / 2 - 10, cursor: "ew-resize", kind: "edge" },
  ];
  return (
    <div className="no-print" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none", zIndex: 90000 }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: w, height: h,
          border: "2px solid #2563EB", borderRadius: 2, boxSizing: "border-box",
          background: "transparent", pointerEvents: "none",
        }}
      />
      {handles.map((hnd) => (
        <div
          key={hnd.key}
          data-handle="1"
          style={{
            position: "absolute", left: hnd.x, top: hnd.y,
            width: hnd.kind === "edge" ? (hnd.key === "w" || hnd.key === "e" ? 10 : 20) : HANDLE,
            height: hnd.kind === "edge" ? (hnd.key === "w" || hnd.key === "e" ? 20 : 10) : HANDLE,
            background: "#fff", border: "1px solid #111", borderRadius: 2,
            cursor: hnd.cursor, pointerEvents: "auto",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBeginResize(hnd.key, { x: e.clientX, y: e.clientY });
          }}
        />
      ))}
    </div>
  );
}

/** =========================
 * Generic Box selection overlay (Legend/Manifest/Title)
 * ========================= */
function BoxSelectionOverlay({ w, h, onBeginResize, onBeginRotate, rotateGapPx = 22 }) {
  const HANDLE = 12;
  const OFF = -6;
  const borderColor = "#7C3AED";
  const handleFill = "#fff";
  const handleBorder = "#111";

    const handles = [
    // corners (squares)
    { key: "nw", x: OFF, y: OFF, cursor: "nwse-resize", kind: "corner" },
    { key: "ne", x: w - OFF - HANDLE, y: OFF, cursor: "nesw-resize", kind: "corner" },
    { key: "sw", x: OFF, y: h - OFF - HANDLE, cursor: "nesw-resize", kind: "corner" },
    { key: "se", x: w - OFF - HANDLE, y: h - OFF - HANDLE, cursor: "nwse-resize", kind: "corner" },

    // sides (little bars like Canva)
    { key: "n", x: w / 2 - 10, y: OFF, cursor: "ns-resize", kind: "edge" },
    { key: "s", x: w / 2 - 10, y: h - OFF - HANDLE, cursor: "ns-resize", kind: "edge" },
    { key: "w", x: OFF, y: h / 2 - 10, cursor: "ew-resize", kind: "edge" },
    { key: "e", x: w - OFF - HANDLE, y: h / 2 - 10, cursor: "ew-resize", kind: "edge" },
  ];

  return (
    <div className="no-print" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none", zIndex: 50 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          border: `2px solid ${borderColor}`,
          borderRadius: 2,
          boxSizing: "border-box",
          background: "transparent",
          pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
        }}
      />

      {handles.map((hnd) => (
        <div
          key={hnd.key}
          data-handle="1"
                    style={{
            position: "absolute",
            left: hnd.x,
            top: hnd.y,

            // Canva-style: corners are squares, sides are bars
           width:
  hnd.kind === "edge"
    ? (hnd.key === "w" || hnd.key === "e" ? 10 : 20) // W/E vertical bar
    : HANDLE,
height:
  hnd.kind === "edge"
    ? (hnd.key === "w" || hnd.key === "e" ? 20 : 10) // W/E vertical bar
    : HANDLE,

            background: handleFill,
            border: `1px solid ${handleBorder}`,
            borderRadius: 2,
            cursor: hnd.cursor,
            pointerEvents: "auto",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBeginResize(hnd.key, { x: e.clientX, y: e.clientY });
          }}
        />
      ))}

      {/* Rotate handle (only if provided) */}
      {onBeginRotate && (
        <div
          data-handle="1"
          style={{
            position: "absolute",
            left: "50%",
            top: h + rotateGapPx,
            transform: "translate(-50%, -50%)",
            width: 34,
            height: 34,
            borderRadius: 999,
            border: "1px solid rgba(17,24,39,0.25)",
            background: "rgba(255,255,255,0.92)",
            display: "grid",
            placeItems: "center",
            cursor: "grab",
            pointerEvents: "auto",
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBeginRotate({ x: e.clientX, y: e.clientY });
          }}
        >
          <RotateIcon active={false} />
        </div>
      )}
    </div>
  );
}


/** =========================
 * Sign selection overlay
 * ========================= */
function SignSelectionOverlay({
  sign,
  rotateGapPx,
  onBeginRotate,
  onBeginResize,
  onBeginCreateStand,
  onBeginMove,
  isMoving,
  isRotating,
  showRotateHandle = true,
  onMouseEnter,
  onMouseLeave,
  embedded = false,
}) {
  const borderColor = "#7C3AED";
  const handleFill = "#fff";
  const handleBorder = "#111";
  // Match the Canva-style overlay handles used by BoxSelectionOverlay:
  // corners are squares (12x12) and are centered on the corner point (OFF=-6).
  const HANDLE = 12;
  const OFF = -6;

  const w = sign.wPx;
  const h = sign.hPx;

  const handles = [
    { key: "nw", x: 0, y: 0, cursor: "nwse-resize" },
    { key: "ne", x: w, y: 0, cursor: "nesw-resize" },
    { key: "sw", x: 0, y: h, cursor: "nesw-resize" },
    { key: "se", x: w, y: h, cursor: "nwse-resize" },
  ];

  return (
    <div
      data-sign-interactive="1"
      {...(!embedded ? { "data-sign-id": sign.id } : {})}
      style={{
        position: embedded ? "absolute" : "relative",
        left: embedded ? 0 : undefined,
        top: embedded ? 0 : undefined,
        width: w,
        height: h,
        overflow: "visible",
        // If embedded, parent sign element already applies rotation.
        transform: embedded ? "none" : `rotate(${sign.rotDeg}deg)`,
        pointerEvents: "auto",
        userSelect: "none",
        cursor: isMoving ? "grabbing" : "grab",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(e) => {
        if (e.target?.dataset?.handle === "1") return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (onBeginMove) onBeginMove({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          border: `2px solid ${borderColor}`,
          borderRadius: 2,
          boxSizing: "border-box",
          background: "transparent",
          pointerEvents: "none",
        }}
      />

      {handles.map((hnd) => (
        <div
          key={hnd.key}
          data-handle="1"
          data-sign-interactive="1"
          style={{
            position: "absolute",
            left: hnd.x + OFF,
            top: hnd.y + OFF,
            width: HANDLE,
            height: HANDLE,
            background: handleFill,
            border: `1px solid ${handleBorder}`,
            borderRadius: 2,
            cursor: hnd.cursor,
            pointerEvents: "auto",
            zIndex: 100,
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            onBeginResize(hnd.key, { x: e.clientX, y: e.clientY });
          }}
        />
      ))}

      {/* Add-support actions: tripod (left), windmaster (right) - from catalog supportsTripod/supportsWindmaster */}
      {onBeginCreateStand && (
        <SignSupportActions
          signW={w}
          signH={h}
          onAddTripod={(pt) => onBeginCreateStand("tripod", pt)}
          onAddWindmaster={(pt) => onBeginCreateStand("windmaster", pt)}
        />
      )}

      {/* Rotate handle - from catalog supportsRotation */}
      {showRotateHandle && (
        <div
          data-handle="1"
          data-sign-interactive="1"
          style={{
            position: "absolute",
            left: "50%",
            top: h + rotateGapPx,
            transform: "translate(-50%, -50%)",
            width: 36,
            height: 36,
            borderRadius: 999,
            border: isRotating ? "1.5px solid #2563EB" : "1px solid rgba(17,24,39,0.25)",
            background: isRotating ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.92)",
            display: "grid",
            placeItems: "center",
            cursor: isRotating ? "grabbing" : "grab",
            pointerEvents: "auto",
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
            zIndex: 100,
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            if (onBeginRotate) onBeginRotate({ x: e.clientX, y: e.clientY, pointerId: e.pointerId });
          }}
          onMouseDown={(e) => {
            if (typeof window !== "undefined" && "PointerEvent" in window) return;
            e.preventDefault();
            e.stopPropagation();
            if (onBeginRotate) onBeginRotate({ x: e.clientX, y: e.clientY });
          }}
        >
          <RotateIcon active={isRotating} />
        </div>
      )}
    </div>
  );
}

/* ================= UI Components ================= */
function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();   // keep map from stealing
        onClick?.();
      }}
      style={{
        border: "none",
        background: active ? "#e9e9e9" : "transparent",
        padding: "6px 10px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 700 : 600,
        pointerEvents: "auto",
        touchAction: "manipulation",
      }}
    >
      {label}
    </button>
  );
}



function RibbonGroup({ children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6e6e6",
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}
function RibbonTextButton({ label, onClick, active = false, variant = "solid" }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        // ✅ DO NOT preventDefault here (can cause weird lag on some touch laptops)
        onClick?.();
      }}
      style={{
  border: active ? "1px solid #111" : "1px solid #ddd",

  // ✅ solid = black fill (your current style)
  background: variant === "solid"
    ? (active ? "#111" : "#fff")
    : "#fff",

  // ✅ outline = always white, just border changes
  color: variant === "solid"
    ? (active ? "#fff" : "#111")
    : "#111",

  borderRadius: 999,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: active ? 800 : 600,
  pointerEvents: "auto",
  touchAction: "manipulation",
  userSelect: "none",
}}

    >
      {label}
    </button>
  );
}


function Dropdown({ children }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 6,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 6,
        minWidth: 180,
        boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
        zIndex: 9999,
      }}
    >
      {children}
    </div>
  );
}

function DropItem({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        background: "transparent",
        padding: "10px 10px",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f3f3")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />;
}
}

// =================== CONTEXT MENU COMPONENT ===================
function ContextMenu({ menu, onCut, onCopy, onToggleLegend, legendExclusions }) {
  const isIncluded = menu.typeId ? !legendExclusions.has(menu.typeId) : true;
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const base = {
    display: "flex", alignItems: "center", width: "100%",
    border: "none", background: "transparent", textAlign: "left",
    padding: "6px 12px", cursor: "pointer", fontSize: 13,
    color: "#111", fontFamily: font, lineHeight: 1.4, borderRadius: 4,
    boxSizing: "border-box",
  };
  const hl = (e) => (e.currentTarget.style.background = "#e8eaed");
  const ul = (e) => (e.currentTarget.style.background = "transparent");
  return (
    <div
      style={{
        position: "fixed", left: menu.x, top: menu.y, zIndex: 999999,
        background: "#fff", borderRadius: 6,
        boxShadow: "0 1px 4px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.12)",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "4px", minWidth: 172,
        fontFamily: font,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button style={base} onClick={onCut} onMouseEnter={hl} onMouseLeave={ul}>Cut</button>
      <button style={base} onClick={onCopy} onMouseEnter={hl} onMouseLeave={ul}>Copy</button>
      <div style={{ height: 1, background: "#e0e0e0", margin: "3px 0" }} />
      <button
        style={{ ...base, gap: 6 }}
        onClick={() => onToggleLegend(menu.typeId)}
        onMouseEnter={hl} onMouseLeave={ul}
      >
        <span style={{ width: 13, fontSize: 12, color: "#1a73e8", fontWeight: 700, flexShrink: 0 }}>
          {isIncluded ? "✓" : ""}
        </span>
        Include in Legend
      </button>
    </div>
  );
}
