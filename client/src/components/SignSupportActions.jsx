/**
 * SignSupportActions – floating action icons to add tripod/windmaster supports.
 * Renders on left (tripod) and right (windmaster) of selected sign.
 */
import React from "react";

const BORDER_COLOR = "#7C3AED";
const ACTIVE_STROKE = "#2563EB";
const ICON_SIZE = 32;
const GAP_PX = 12;

function TripodAddIcon() {
  return (
    <svg viewBox="0 0 64 64" width={20} height={20} style={{ pointerEvents: "none" }}>
      <rect x="10" y="10" width="44" height="10" rx="1.5" fill="none" stroke={ACTIVE_STROKE} strokeWidth="1.5" />
      <rect x="30" y="20" width="4" height="30" fill="none" stroke={ACTIVE_STROKE} strokeWidth="1.5" />
    </svg>
  );
}

function WindmasterAddIcon() {
  return (
    <svg viewBox="0 0 96 64" width={24} height={16} style={{ pointerEvents: "none" }}>
      <circle cx="22" cy="42" r="18" fill="none" stroke={ACTIVE_STROKE} strokeWidth="1.5" />
      <circle cx="74" cy="42" r="18" fill="none" stroke={ACTIVE_STROKE} strokeWidth="1.5" />
      <rect x="10" y="56" width="76" height="8" fill="none" stroke={ACTIVE_STROKE} strokeWidth="1.5" />
    </svg>
  );
}

export default function SignSupportActions({ signW, signH, onAddTripod, onAddWindmaster }) {
  // Buttons centred vertically on the left / right sides of the sign.
  const btnStyle = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 8,
    border: `1.5px solid ${BORDER_COLOR}`,
    background: "rgba(124,58,237,0.08)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    pointerEvents: "auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  };

  return (
    <>
      {/* Left: Tripod — above-left corner */}
      <div
        data-handle="1"
        data-sign-interactive="1"
        style={{
          ...btnStyle,
          left: -ICON_SIZE - GAP_PX,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddTripod?.({ x: e.clientX, y: e.clientY });
        }}
        onMouseDown={(e) => {
          // On most modern browsers, a mouse click fires both pointerdown and mousedown.
          // Avoid double-triggering stand creation (which can cause a visible "jump").
          if (typeof window !== "undefined" && "PointerEvent" in window) return;
          e.preventDefault();
          e.stopPropagation();
          onAddTripod?.({ x: e.clientX, y: e.clientY });
        }}
      >
        <TripodAddIcon />
      </div>

      {/* Right: Windmaster */}
      <div
        data-handle="1"
        data-sign-interactive="1"
        style={{
          ...btnStyle,
          left: signW + GAP_PX,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddWindmaster?.({ x: e.clientX, y: e.clientY });
        }}
        onMouseDown={(e) => {
          if (typeof window !== "undefined" && "PointerEvent" in window) return;
          e.preventDefault();
          e.stopPropagation();
          onAddWindmaster?.({ x: e.clientX, y: e.clientY });
        }}
      >
        <WindmasterAddIcon />
      </div>
    </>
  );
}
