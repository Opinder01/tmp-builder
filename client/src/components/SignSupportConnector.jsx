/**
 * SignSupportConnector – dotted line between sign and support.
 * Path follows map (lat/lng); stroke weight and dash spacing are fixed pixels (no zoom scaling).
 */
import React from "react";
import { PolylineF } from "@react-google-maps/api";

const STROKE_WEIGHT_PX = 2;
const DASH_REPEAT_PX = 8;

const DOTTED_ICON = {
  path: "M 0,-1 0,1",
  strokeOpacity: 1,
  strokeWeight: STROKE_WEIGHT_PX,
  strokeColor: "#111",
};

export default function SignSupportConnector({ from, to }) {
  if (!from || !to) return null;
  return (
    <PolylineF
      path={[from, to]}
      options={{
        strokeOpacity: 0,
        strokeWeight: STROKE_WEIGHT_PX,
        clickable: false,
        zIndex: 1000,
        icons: [
          {
            icon: DOTTED_ICON,
            offset: "0",
            repeat: `${DASH_REPEAT_PX}px`,
          },
          { icon: DOTTED_ICON, offset: "0", repeat: "0" },
          { icon: DOTTED_ICON, offset: "100%", repeat: "0" },
        ],
      }}
    />
  );
}
