import { useMemo, useState } from "react";
import { Autocomplete, GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";

export default function GoogleMapPicker({ onConfirm }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
   console.log("GOOGLE KEY:", apiKey);   // ✅ correct place

  const libraries = useMemo(() => ["places", "geometry"], []);
  const { isLoaded, loadError } = useLoadScript({
  id: "gmap-script",
  googleMapsApiKey: apiKey,
  libraries,
});

  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null); // { lat, lng }
  const [autocomplete, setAutocomplete] = useState(null);
  const [label, setLabel] = useState(""); // selected address label (optional)


  const defaultCenter = useMemo(
    () => ({ lat: 43.6532, lng: -79.3832 }), // Toronto
    []
  );

  // If key missing, show nice message
  if (!apiKey) {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
        <b>Google Maps API key missing</b>
        <p style={{ color: "#64748b", marginTop: 8 }}>
          Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>client/.env</code> and restart
          <code> npm run dev</code>.
        </p>
      </div>
    );
  }

  const onPlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    setMarker({ lat, lng });
    setLabel(place.formatted_address || place.name || "");

    if (map) {
      map.panTo({ lat, lng });
      map.setZoom(16);
    }
  };

  const onMapClick = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarker({ lat, lng });
    setLabel("Pinned location");
  };
if (loadError) return <div style={{ padding: 16 }}>Map failed to load.</div>;
if (!isLoaded) return <div style={{ padding: 16 }}>Loading map…</div>;

  return (
    <div style={{ maxWidth: 980 }}>
        {/* Search Bar */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Autocomplete onLoad={setAutocomplete} onPlaceChanged={onPlaceChanged}>
            <input
              placeholder="Search address…"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                outline: "none",
              }}
            />
          </Autocomplete>
        </div>

        {/* Map */}
        <div
          style={{
            height: 420,
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
            background: "#f8fafc",
          }}
        >
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={marker ? marker : defaultCenter}
            zoom={marker ? 16 : 10}
            onLoad={setMap}
            onClick={onMapClick}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
            }}
          >
            {marker && <Marker position={marker} />}
          </GoogleMap>
        </div>

        {/* Confirm Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 12,
            alignItems: "center",
          }}
        >
          <div style={{ color: "#475569" }}>
            {marker ? (
              <>
                <b>Selected:</b> {label || "Location"} <br />
                <span style={{ fontSize: 13 }}>
                  Lat: {marker.lat.toFixed(6)} | Lng: {marker.lng.toFixed(6)}
                </span>
              </>
            ) : (
              "Tip: search an address or click on the map to drop a pin."
            )}
          </div>

          <button
            disabled={!marker}
            onClick={() =>
              onConfirm({
                ...marker,
                label,
              })
            }
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: marker ? "#0f172a" : "#94a3b8",
              color: "#fff",
              fontWeight: 800,
              cursor: marker ? "pointer" : "not-allowed",
              height: 44,
              minWidth: 160,
            }}
          >
            Confirm Location
          </button>
        </div>
    </div>
  );
}
