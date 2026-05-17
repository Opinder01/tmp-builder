import { useState, useRef, useEffect } from "react";

const SUGGESTED = [
  "What signs do I need for a lane closure at 80 km/h?",
  "How do I calculate taper length?",
  "What are the cone spacing rules?",
  "How far in advance should I place warning signs?",
  "What does a flagger setup require?",
];

function BotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2M20 14h2M9 18v2M15 18v2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function AiAssistant() {
  const [open, setOpen]       = useState(false);
  const [messages, setMsgs]   = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");

    const next = [...messages, { role: "user", content: userMsg }];
    setMsgs(next);
    setLoading(true);

    try {
      const res  = await fetch("/api/ai-assistant", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setMsgs([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMsgs([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // Format assistant messages — bold **text**, newlines, bullet lists
  function formatMsg(text) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
      );
      return <span key={i}>{parts}<br /></span>;
    });
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="TMP AI Assistant"
        style={{
          position:     "fixed",
          bottom:       24,
          right:        24,
          zIndex:       999998,
          width:        52,
          height:       52,
          borderRadius: "50%",
          background:   open ? "#0f172a" : "linear-gradient(135deg,#f97316,#ea580c)",
          border:       "none",
          boxShadow:    "0 4px 20px rgba(249,115,22,0.45)",
          color:        "#fff",
          cursor:       "pointer",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          transition:   "background 0.2s, transform 0.15s",
          transform:    open ? "scale(0.92)" : "scale(1)",
        }}
      >
        {open ? <CloseIcon /> : <BotIcon />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position:     "fixed",
            bottom:       88,
            right:        24,
            zIndex:       999997,
            width:        380,
            maxWidth:     "calc(100vw - 48px)",
            height:       520,
            maxHeight:    "calc(100vh - 120px)",
            background:   "#fff",
            borderRadius: 16,
            boxShadow:    "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
            border:       "1px solid #e2e8f0",
            display:      "flex",
            flexDirection:"column",
            overflow:     "hidden",
            fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            background:  "linear-gradient(135deg,#0f172a,#1e3a5f)",
            padding:     "14px 16px",
            display:     "flex",
            alignItems:  "center",
            gap:         10,
            flexShrink:  0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "#f97316",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", flexShrink: 0,
            }}>
              <BotIcon />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                TMP Assistant
              </div>
              <div style={{ color: "#94a3b8", fontSize: 11 }}>
                BC TMM MOTI · Traffic Control Expert
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#22c55e", display: "inline-block",
              }} />
              <span style={{ color: "#94a3b8", fontSize: 11 }}>Online</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 14px 8px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* Welcome */}
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "linear-gradient(135deg,#f97316,#ea580c)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", margin: "0 auto 10px",
                }}>
                  <BotIcon />
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
                  TMP Assistant
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 14 }}>
                  Ask me anything about BC TMM MOTI<br />traffic management plans, signs, and rules.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTED.map((s) => (
                    <button key={s} onClick={() => send(s)} style={{
                      background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "7px 10px",
                      fontSize: 12, color: "#334155", cursor: "pointer",
                      textAlign: "left", lineHeight: 1.4,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
                    onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                {m.role === "assistant" && (
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "#f97316", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", marginRight: 7, marginTop: 2, fontSize: 11,
                  }}>
                    <BotIcon />
                  </div>
                )}
                <div style={{
                  maxWidth: "78%",
                  background: m.role === "user" ? "linear-gradient(135deg,#f97316,#ea580c)" : "#f1f5f9",
                  color:      m.role === "user" ? "#fff" : "#1e293b",
                  padding:    "9px 12px",
                  borderRadius: m.role === "user"
                    ? "14px 14px 4px 14px"
                    : "14px 14px 14px 4px",
                  fontSize:   13,
                  lineHeight: 1.6,
                }}>
                  {m.role === "assistant" ? formatMsg(m.content) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 11, flexShrink: 0,
                }}>
                  <BotIcon />
                </div>
                <div style={{
                  background: "#f1f5f9", borderRadius: "14px 14px 14px 4px",
                  padding: "10px 14px", display: "flex", gap: 4, alignItems: "center",
                }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: "#94a3b8",
                      animation: `aiDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                      display: "inline-block",
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding:     "10px 12px",
            borderTop:   "1px solid #f1f5f9",
            display:     "flex",
            gap:         8,
            alignItems:  "flex-end",
            flexShrink:  0,
            background:  "#fff",
          }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
              onKeyDown={onKey}
              placeholder="Ask about TMP rules, signs, setup…"
              style={{
                flex:        1,
                border:      "1.5px solid #e2e8f0",
                borderRadius: 10,
                padding:     "8px 12px",
                fontSize:    13,
                fontFamily:  "inherit",
                resize:      "none",
                outline:     "none",
                lineHeight:  1.5,
                overflowY:   "auto",
                maxHeight:   100,
                transition:  "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#f97316"}
              onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                width:        36,
                height:       36,
                borderRadius: "50%",
                background:   loading || !input.trim() ? "#e2e8f0" : "linear-gradient(135deg,#f97316,#ea580c)",
                border:       "none",
                color:        loading || !input.trim() ? "#94a3b8" : "#fff",
                cursor:       loading || !input.trim() ? "default" : "pointer",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                flexShrink:   0,
                transition:   "background 0.15s",
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* Typing dots keyframe */}
      <style>{`
        @keyframes aiDot {
          0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
          40%          { transform: scale(1);   opacity: 1;   }
        }
      `}</style>
    </>
  );
}
