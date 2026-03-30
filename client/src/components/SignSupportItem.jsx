/**
 * SignSupportItem – one tripod or windmaster support linked to a sign.
 * Draggable, selectable.
 */
import React from "react";
import { OverlayViewF } from "@react-google-maps/api";

function TripodStandSVG({ selected, width = 28, height = 28 }) {
  const fill = "#000";
  const stroke = selected ? "#2563EB" : "#000";
  return (
    <svg viewBox="0 0 64 64" width={width} height={height}>
      <rect x="10" y="10" width="44" height="10" rx="1.5" fill={fill} />
      <rect x="30" y="20" width="4" height="30" fill={fill} />
      {selected && (
        <rect x="9" y="9" width="46" height="48" rx="3" fill="transparent" stroke={stroke} strokeWidth="2" opacity="0.9" />
      )}
    </svg>
  );
}

function WindmasterStandSVG({ selected, width = 40, height = 28 }) {
  const stroke = selected ? "#2563EB" : "#000";
  const fill = "#000";
  return (
    <svg viewBox="0 0 96 64" width={width} height={height}>
      <circle cx="22" cy="42" r="18" fill={fill} />
      <circle cx="74" cy="42" r="18" fill={fill} />
      <rect x="10" y="56" width="76" height="8" fill={fill} />
      {selected && (
        <rect x="2" y="18" width="92" height="48" rx="3" fill="transparent" stroke={stroke} strokeWidth="2" opacity="0.9" />
      )}
    </svg>
  );
}

// Scale with map (like construction sign): far from wall = small, near = big. mapScale = zoomScale(sign zRef).
const TRIPOD_W = 28;
const TRIPOD_H = 28;
const WINDMASTER_W = 40;
const WINDMASTER_H = 28;

export default function SignSupportItem({
  stand,
  signId,
  isSelected,
  isDragging,
  onSelect,
  onBeginDrag,
  onPointerMove: onPointerMoveProp,
  onPointerUp: onPointerUpProp,
  disablePointerCapture = false,
  mapScale = 1,
}) {
  // Keep supports scaling strictly in lockstep with the sign.
  // Any clamping would desync the icon size/feel from the sign+connector system.
  const k = Number.isFinite(mapScale) ? mapScale : 1;
  const tripodW = TRIPOD_W * k;
  const tripodH = TRIPOD_H * k;
  const windmasterW = WINDMASTER_W * k;
  const windmasterH = WINDMASTER_H * k;
  return (
    <OverlayViewF position={stand.pos} mapPaneName="overlayMouseTarget" zIndex={96000}>
      <div
        data-sign-interactive="1"
        style={{
          transform: `translate(-50%, -50%) rotate(${stand.rotDeg ?? stand.rotationDeg ?? 0}deg)`,
          pointerEvents: "auto",
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          filter: "none",
          visibility: isDragging ? "hidden" : "visible",
        }}
        onPointerDown={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!disablePointerCapture) ev.currentTarget.setPointerCapture?.(ev.pointerId);
          onSelect?.();
          onBeginDrag?.(ev);
        }}
        onPointerMove={(ev) => {
          onPointerMoveProp?.(ev);
        }}
        onPointerUp={(ev) => {
          onPointerUpProp?.(ev);
        }}
      >
        {stand.type === "tripod" ? (
          <TripodStandSVG selected={isSelected} width={tripodW} height={tripodH} />
        ) : (
          <WindmasterStandSVG selected={isSelected} width={windmasterW} height={windmasterH} />
        )}
      </div>
    </OverlayViewF>
  );
}
