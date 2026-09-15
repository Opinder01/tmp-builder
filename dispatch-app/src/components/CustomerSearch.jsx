import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Type-ahead search against QuickBooks customers. Calls onSelect({id, name}).
export default function CustomerSearch({ onSelect, selected }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api
        .get(`/api/quickbooks/data?resource=customers&action=search&q=${encodeURIComponent(query)}`)
        .then((data) => setResults(data.customers))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (selected) {
    return (
      <div>
        <strong>{selected.name}</strong>{" "}
        <button type="button" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Search QuickBooks customers..."
      />
      {open && results.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 1,
            background: "white",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            listStyle: "none",
            margin: 0,
            padding: "0.25rem 0",
            width: "100%",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {results.map((c) => (
            <li
              key={c.id}
              style={{ padding: "0.4rem 0.6rem", cursor: "pointer" }}
              onClick={() => {
                onSelect(c);
                setOpen(false);
                setQuery("");
              }}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
