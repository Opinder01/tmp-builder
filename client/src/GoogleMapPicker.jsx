import { useCallback, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";

export default function GoogleMapPicker({ onConfirm }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const libraries = useMemo(() => ["places", "geometry"], []);
  const { isLoaded, loadError } = useLoadScript({
    id: "gmap-script",
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  const [label, setLabel] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const sessionTokenRef = useRef(null);

  const defaultCenter = useMemo(() => ({ lat: 43.6532, lng: -79.3832 }), []);

  const fetchSuggestions = useCallback(async (input) => {
    if (!input || input.length < 2) { setSuggestions([]); return; }
    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
      const { suggestions: s } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current,
      });
      setSuggestions(s || []);
    } catch (err) {
      console.error("Autocomplete error:", err);
      setSuggestions([]);
    }
  }, []);

  const selectSuggestion = useCallback(async (suggestion) => {
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });

      const lat = place.location.lat();
      const lng = place.location.lng();
      setMarker({ lat, lng });
      const addr = place.formattedAddress || place.displayName?.text || "";
      setLabel(addr);
      setInputValue(addr);
      setSuggestions([]);
      sessionTokenRef.current = null;

      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(16);
      }
    } catch (err) {
      console.error("Place details error:", err);
    }
  }, [map]);

  const onMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarker({ lat, lng });
    setLabel("Pinned location");
  }, []);

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

  if (loadError) return <div style={{ padding: 16 }}>Map failed to load.</div>;
  if (!isLoaded) return <div style={{ padding: 16 }}>Loading map…</div>;

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Search Bar */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); fetchSuggestions(e.target.value); }}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          placeholder="Search address…"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {suggestions.length > 0 && (
          <ul style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            margin: 0,
            padding: 0,
            listStyle: "none",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}>
            {suggestions.map((s, i) => (
              <li
                key={i}
                onMouseDown={() => selectSuggestion(s)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: i < suggestions.length - 1 ? "1px solid #f1f5f9" : "none",
                  fontSize: 14,
                  color: "#1e293b",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                {s.placePrediction?.text?.text || ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div style={{
        height: 420,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        background: "#f8fafc",
      }}>
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
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 12,
        alignItems: "center",
      }}>
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
          onClick={() => onConfirm({ ...marker, label })}
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
