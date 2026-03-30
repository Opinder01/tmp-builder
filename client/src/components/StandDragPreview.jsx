/**
 * StandDragPreview – pixel-positioned stand graphic during drag.
 * Renders directly in map pane to avoid OverlayView recreation (which causes
 * the support to disappear when position updates rapidly).
 */
import React from "react";
import * as ReactDOM from "react-dom";

function TripodStandSVG() {
  const fill = "#000";
  return (
    <svg viewBox="0 0 64 64" width="28" height="28">
      <rect x="10" y="10" width="44" height="10" rx="1.5" fill={fill} />
      <rect x="30" y="20" width="4" height="30" fill={fill} />
    </svg>
  );
}

function WindmasterStandSVG() {
  const fill = "#000";
  return (
    <svg viewBox="0 0 96 64" width="40" height="28">
      <circle cx="22" cy="42" r="18" fill={fill} />
      <circle cx="74" cy="42" r="18" fill={fill} />
      <rect x="10" y="56" width="76" height="8" fill={fill} />
    </svg>
  );
}

export default function StandDragPreview({ map, stand, latLngToPx }) {
  if (!map || !stand || !stand.pos || !latLngToPx) return null;

  const px = latLngToPx(stand.pos);
  if (!px) return null;

  const pane = map.getPanes?.()?.overlayMouseTarget;
  if (!pane) return null;

  const content = (
    <div
      style={{
        position: "absolute",
        left: px.x,
        top: px.y,
        transform: `translate(-50%, -50%) rotate(${stand.rotDeg ?? 0}deg)`,
        zIndex: 100000,
        pointerEvents: "none",
      }}
    >
      {stand.type === "tripod" ? <TripodStandSVG /> : <WindmasterStandSVG />}
    </div>
  );

  return ReactDOM.createPortal(content, pane);
}
