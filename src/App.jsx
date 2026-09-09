import { useState, useRef } from "react";

const SAMPLE_LOGS = {
  schneider: `[14:32:01 UTC] EcoStruxure-UPS-B07: Battery capacity 8% — critical low warning
[14:32:14 UTC] EcoStruxure-UPS-B07: On-battery runtime exhausted — initiating shutdown
[14:32:15 UTC] EcoStruxure-PDU-B07: Circuit breaker trip — circuit B2, load shed`,

  dell: `[14:32:18 UTC] OpenManage-DCOPS-PROD-07: PSU2 AC input loss detected
[14:32:19 UTC] OpenManage-DCOPS-PROD-07: Graceful shutdown initiated — power fault (PSU2)
[14:33:05 UTC] OpenManage-DCOPS-PROD-07: POST failed — awaiting manual intervention`,

  cisco: `[09:32:22 EST] DNA-Center-SW-CORE-02: Port Gi1/0/22 link down (host: DCOPS-PROD-07)
[09:32:25 EST] DNA-Center-RTR-CORE-01: BGP neighbor 10.10.10.7 down — hold timer expired
[09:34:00 EST] DNA-Center-RTR-CORE-01: Traffic rerouted via backup path — latency +220ms`,

  bmc: `[14:33:10 UTC] BMC-DCOPS-PROD-07: IPMI heartbeat lost
[14:33:10 UTC] BMC-DCOPS-PROD-07: Chassis power state: OFF`,
};

const VENDORS = [
  { key: "schneider", label: "Schneider EcoStruxure" },
  { key: "dell",      label: "Dell OpenManage" },
  { key: "cisco",     label: "Cisco DNA Center" },
  { key: "bmc",       label: "BMC / IPMI" },
];

const buildPrompt = (logs) => `You are a senior data center operations engineer analyzing raw logs from multiple vendor systems to diagnose an active incident.

The logs use different timestamp formats and timezones — normalize everything to UTC in your response.

=== SCHNEIDER ECOSTRUXURE (Power & Cooling) ===
${logs.schneider}

=== DELL OPENMANAGE (Server Hardware) ===
${logs.dell}

=== CISCO DNA CENTER (Network) ===
${logs.cisco}

=== BMC / IPMI (Out-of-band Management) ===
${logs.bmc}

Return ONLY a valid JSON object — no markdown, no preamble, no explanation. Use this exact structure:
{
  "root_cause": "one clear sentence identifying the root cause",
  "confidence": "High",
  "causal_chain": ["step 1", "step 2", "step 3"],
  "event_timeline": [
    { "time_utc": "HH:MM:SS", "vendor": "vendor name", "event": "brief event", "role": "Root cause | Propagation | Symptom" }
  ],
  "affected_systems": ["system 1"],
  "recommended_actions": ["action 1", "action 2", "action 3"]
}
Sort event_timeline chronologically by UTC time.`;

const roleStyle = (role) => {
  if (role === "Root cause")  return { background: "#FEE2E2", color: "#991B1B" };
  if (role === "Propagation") return { background: "#FEF3C7", color: "#92400E" };
  return                             { background: "#EFF6FF", color: "#1E40AF" };
};

const confStyle = (c) => {
  if (c === "High")   return { background: "#D1FAE5", color: "#065F46" };
  if (c === "Medium") return { background: "#FEF3C7", color: "#92400E" };
  return                     { background: "#FEE2E2", color: "#991B1B" };
};

const INCIDENT_TYPES = [
  { key: "multi",  label: "Multi-system failure", baselineMin: 1200, baselineMax: 3600, baselineLabel: "20–60 min" },
  { key: "single", label: "Single device failure", baselineMin: 600,  baselineMax: 600,  baselineLabel: "~10 min"  },
];

export default function IncidentCorrelator() {
  const [logs, setLogs]             = useState(SAMPLE_LOGS);
  const [activeVendor, setActive]   = useState("schneider");
  const [incidentType, setIncType]  = useState("multi");
  const [result, setResult]         = useState(null);
  const [mtti, setMtti]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const startRef                    = useRef(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setMtti(null);
    startRef.current = Date.now();

    try {
      const res  = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: buildPrompt(logs) }],
        }),
      });
      const data  = await res.json();
      const text  = (data.content || []).map((c) => c.text || "").join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const elapsed = Math.round((Date.now() - startRef.current) / 1000);
      setResult(parsed);
      setMtti(elapsed);
    } catch (err) {
      setError("Analysis failed — check console for details.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const incident    = INCIDENT_TYPES.find((t) => t.key === incidentType);
  const baselineMid = Math.round((incident.baselineMin + incident.baselineMax) / 2);
  const pct         = mtti !== null ? Math.max(0, Math.round((1 - mtti / baselineMid) * 100)) : null;

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "20px 24px", maxWidth: "660px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>
          Cross-Vendor Incident Correlator
        </h2>
        <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>
          Paste raw logs from each vendor system, then run AI correlation
        </p>
      </div>

      {/* Incident type selector */}
      <div style={{ marginBottom: "16px" }}>
        <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Incident type</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setIncType(t.key); setResult(null); setMtti(null); }}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: incidentType === t.key ? 500 : 400,
                border: `1.5px solid ${incidentType === t.key ? "var(--color-text-primary)" : "var(--color-border-tertiary)"}`,
                borderRadius: "6px",
                background: incidentType === t.key ? "var(--color-background-secondary)" : "transparent",
                color: incidentType === t.key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              {t.label}
              <span style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.65 }}>({t.baselineLabel} baseline)</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vendor tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
        {VENDORS.map((v) => (
          <button
            key={v.key}
            onClick={() => setActive(v.key)}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: activeVendor === v.key ? 500 : 400,
              border: `1.5px solid ${activeVendor === v.key ? "var(--color-text-primary)" : "var(--color-border-tertiary)"}`,
              borderRadius: "6px",
              background: activeVendor === v.key ? "var(--color-background-secondary)" : "transparent",
              color: activeVendor === v.key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Log textareas */}
      {VENDORS.map((v) => (
        <textarea
          key={v.key}
          value={logs[v.key]}
          onChange={(e) => setLogs((prev) => ({ ...prev, [v.key]: e.target.value }))}
          style={{
            display:    activeVendor === v.key ? "block" : "none",
            width:      "100%",
            height:     "110px",
            padding:    "10px 12px",
            fontSize:   "11px",
            fontFamily: "var(--font-mono)",
            border:     "1px solid var(--color-border-tertiary)",
            borderRadius: "8px",
            background: "var(--color-background-secondary)",
            color:      "var(--color-text-primary)",
            resize:     "vertical",
            boxSizing:  "border-box",
            lineHeight: "1.7",
            marginBottom: "14px",
          }}
        />
      ))}

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={loading}
        style={{
          width:       "100%",
          padding:     "11px",
          fontSize:    "13px",
          fontWeight:  500,
          background:  loading ? "var(--color-background-secondary)" : "var(--color-text-primary)",
          color:       loading ? "var(--color-text-secondary)" : "var(--color-background-primary)",
          border:      "none",
          borderRadius: "8px",
          cursor:      loading ? "default" : "pointer",
          marginBottom: "20px",
        }}
      >
        {loading ? "Analyzing logs..." : "Run AI correlation"}
      </button>

      {error && (
        <div style={{ padding: "12px 14px", background: "var(--color-background-danger)", borderRadius: "8px", fontSize: "12px", color: "var(--color-text-danger)", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Result cards */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Root cause + MTTI */}
          <div style={{ padding: "16px", background: "var(--color-background-secondary)", borderRadius: "10px", borderLeft: "3px solid var(--color-text-primary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Root Cause</p>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.5 }}>{result.root_cause}</p>
              </div>
              {result.confidence && (
                <span style={{ ...confStyle(result.confidence), padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {result.confidence} confidence
                </span>
              )}
            </div>
            {mtti !== null && (
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--color-border-tertiary)", display: "flex", gap: "20px" }}>
                <div>
                  <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI MTTI</p>
                  <p style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{mtti}s</p>
                </div>
                <div>
                  <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Baseline MTTI</p>
                  <p style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{incident.baselineLabel}</p>
                </div>
                <div>
                  <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Reduction</p>
                  <p style={{ fontSize: "18px", fontWeight: 500, color: "#065F46", margin: 0 }}>{pct}%</p>
                </div>
              </div>
            )}
          </div>

          {/* Event timeline */}
          {result.event_timeline?.length > 0 && (
            <div style={{ padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "10px" }}>
              <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Event Timeline — UTC normalized</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {result.event_timeline.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-secondary)", whiteSpace: "nowrap", paddingTop: "3px", minWidth: "58px" }}>{e.time_utc}</span>
                    <span style={{ ...roleStyle(e.role), fontSize: "10px", padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap", flexShrink: 0, paddingTop: "3px", fontWeight: 500 }}>{e.role}</span>
                    <span style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>{e.vendor}: </span>{e.event}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Causal chain */}
          {result.causal_chain?.length > 0 && (
            <div style={{ padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "10px" }}>
              <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Causal Chain</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {result.causal_chain.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 500, minWidth: "16px", paddingTop: "2px" }}>{i + 1}.</span>
                    <span style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended actions */}
          {result.recommended_actions?.length > 0 && (
            <div style={{ padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "10px" }}>
              <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recommended Actions</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {result.recommended_actions.map((action, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-text-tertiary)", marginTop: "7px", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: 1.5 }}>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
