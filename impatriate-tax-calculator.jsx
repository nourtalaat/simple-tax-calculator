const { useState, useEffect } = React;

// Known official barèmes keyed by the year they APPLY TO (income year)
const KNOWN_BRACKETS = {
  2022: [
    { min: 0,      max: 10225,  rate: 0    },
    { min: 10225,  max: 26070,  rate: 0.11 },
    { min: 26070,  max: 74545,  rate: 0.30 },
    { min: 74545,  max: 160336, rate: 0.41 },
    { min: 160336, max: Infinity, rate: 0.45 },
  ],
  2023: [
    { min: 0,      max: 10777,  rate: 0    },
    { min: 10777,  max: 27478,  rate: 0.11 },
    { min: 27478,  max: 78570,  rate: 0.30 },
    { min: 78570,  max: 168994, rate: 0.41 },
    { min: 168994, max: Infinity, rate: 0.45 },
  ],
  2024: [
    { min: 0,      max: 11294,  rate: 0    },
    { min: 11294,  max: 28797,  rate: 0.11 },
    { min: 28797,  max: 82341,  rate: 0.30 },
    { min: 82341,  max: 177106, rate: 0.41 },
    { min: 177106, max: Infinity, rate: 0.45 },
  ],
  2025: [
    { min: 0,      max: 11497,  rate: 0    },
    { min: 11497,  max: 29315,  rate: 0.11 },
    { min: 29315,  max: 83823,  rate: 0.30 },
    { min: 83823,  max: 180294, rate: 0.41 },
    { min: 180294, max: Infinity, rate: 0.45 },
  ],
};

const CURRENT_YEAR = 2025;
const CLAIM_WINDOW = 2; // can recover last 2 years

function getBrackets(year) {
  // Use known brackets if available, otherwise use latest as proxy
  const keys = Object.keys(KNOWN_BRACKETS).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return { brackets: KNOWN_BRACKETS[k], estimated: year > k };
  }
  return { brackets: KNOWN_BRACKETS[keys[keys.length - 1]], estimated: true };
}

function getYearStatus(year) {
  if (year < CURRENT_YEAR - CLAIM_WINDOW) return "expired";
  if (year <= CURRENT_YEAR - 1) return "refundable";
  if (year === CURRENT_YEAR) return "current";
  return "future";
}

function getDeadline(year) {
  // Claim deadline = 31 Dec of the 2nd year after assessment (assessment year = income year + 1)
  const assessmentYear = year + 1;
  return `31 Dec ${assessmentYear + 2}`;
}

const STATUS_STYLES = {
  expired:    { badge: "✕ EXPIRED",     bg: "rgba(120,60,60,0.15)",   color: "#a06060", rowBg: "rgba(120,60,60,0.03)",   border: "#2a1e1e" },
  refundable: { badge: "⬤ REFUNDABLE",  bg: "rgba(200,160,80,0.15)",  color: "#c8a050", rowBg: "rgba(200,160,80,0.04)",  border: "rgba(200,160,80,0.25)" },
  current:    { badge: "◯ APPLY NOW",   bg: "rgba(80,160,200,0.15)",  color: "#50a0c8", rowBg: "rgba(80,160,200,0.03)",  border: "rgba(80,160,200,0.2)" },
  future:     { badge: "◯ FUTURE",      bg: "rgba(100,100,140,0.15)", color: "#6a6a9a", rowBg: "transparent",            border: "#1e1e2e" },
};

const FAMILY_PARTS = {
  "Single": 1,
  "Married/PACS, no children": 2,
  "Married/PACS, 1 child": 2.5,
  "Married/PACS, 2 children": 3,
};

function calcTax(net, brackets, parts) {
  const perPart = net / parts;
  let t = 0;
  for (const b of brackets) {
    if (perPart <= b.min) break;
    t += (Math.min(perPart, b.max) - b.min) * b.rate;
  }
  return t * parts;
}

function calcRowData(gross, year, parts, exemptPct) {
  const { brackets, estimated } = getBrackets(year);
  const deduction = Math.min(gross * 0.10, 14171);
  const net = gross - deduction;
  const exemption = gross * (exemptPct / 100);
  // Taxable with regime: net minus exemption, floor at 70% of net
  const taxableWithRegime = Math.max(net - exemption, net * 0.70);
  const taxWithout = calcTax(net, brackets, parts);
  const taxWith = calcTax(taxableWithRegime, brackets, parts);
  const saving = Math.max(0, taxWithout - taxWith);
  return {
    gross, net, deduction, exemption, taxableWithRegime,
    taxWithout, taxWith, saving, estimated,
    effWithout: (taxWithout / gross) * 100,
    effWith: (taxWith / gross) * 100,
  };
}

function formatEur(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

// Inline editable salary value
function SalaryCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState(false);

  const start = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n >= 1000 && n <= 2000000) onChange(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
        <span style={{ fontSize: "11px", color: "#c8a050" }}>€</span>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{
            background: "#0d0d1a",
            border: "2px solid #c8a050",
            boxShadow: "0 0 0 3px rgba(200,160,80,0.15)",
            color: "#f0ebe0",
            padding: "6px 10px", borderRadius: "6px", fontSize: "15px",
            width: "130px", textAlign: "right", fontFamily: "monospace",
            outline: "none", letterSpacing: "0.5px",
          }}
        />
        <button
          onMouseDown={e => { e.preventDefault(); commit(); }}
          style={{
            background: "#c8a050", border: "none", color: "#0a0a0f",
            width: "26px", height: "26px", borderRadius: "4px",
            cursor: "pointer", fontSize: "13px", fontWeight: "bold",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >✓</button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Click to edit salary"
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        background: hovered ? "rgba(200,160,80,0.12)" : "rgba(200,160,80,0.05)",
        border: `1px solid ${hovered ? "rgba(200,160,80,0.5)" : "rgba(200,160,80,0.2)"}`,
        borderRadius: "6px", padding: "5px 10px 5px 12px",
        cursor: "pointer", transition: "all 0.15s",
        color: hovered ? "#c8a050" : "#e8e4dc",
        fontSize: "14px", fontFamily: "monospace", letterSpacing: "0.3px",
      }}
    >
      {formatEur(value)}
      <span style={{
        fontSize: "11px",
        color: hovered ? "#c8a050" : "#5a5060",
        transition: "color 0.15s",
        lineHeight: 1,
      }}>✎</span>
    </button>
  );
}

function App() {
  const [arrivalYear, setArrivalYear] = useState(2020);
  const [arrivalDraft, setArrivalDraft] = useState("2020");
  const [salaries, setSalaries] = useState({});
  const [family, setFamily] = useState("Single");
  const [bonusMethod, setBonusMethod] = useState("flatrate");
  const [customPct, setCustomPct] = useState(30);

  const parts = FAMILY_PARTS[family];
  const exemptPct = bonusMethod === "flatrate" ? 30 : customPct;

  // Regime lasts 8 years from arrival (up to Dec 31 of the 8th year after arrival)
  const regimeEndYear = arrivalYear + 8;
  // Generate all years in the regime window
  const regimeYears = Array.from({ length: regimeEndYear - arrivalYear }, (_, i) => arrivalYear + i);

  // Sync salaries when regimeYears changes
  useEffect(() => {
    setSalaries(prev => {
      const next = {};
      for (const y of regimeYears) {
        next[y] = prev[y] ?? 80000;
      }
      return next;
    });
  }, [arrivalYear]);

  const updateSalary = (year, val) => setSalaries(s => ({ ...s, [year]: val }));

  const rows = regimeYears.map(year => {
    const status = getYearStatus(year);
    const data = calcRowData(salaries[year] ?? 80000, year, parts, exemptPct);
    return { year, status, ...data };
  });

  const refundableRows = rows.filter(r => r.status === "refundable");
  const currentRows    = rows.filter(r => r.status === "current");
  const futureRows     = rows.filter(r => r.status === "future");
  const expiredRows    = rows.filter(r => r.status === "expired");

  const totalRefund  = refundableRows.reduce((s, r) => s + r.saving, 0);
  const totalForward = [...currentRows, ...futureRows].reduce((s, r) => s + r.saving, 0);
  const grandTotal   = totalRefund + totalForward;

  const syncSalary = () => {
    const base = salaries[CURRENT_YEAR] ?? salaries[regimeYears[0]] ?? 80000;
    const next = {};
    for (const y of regimeYears) next[y] = base;
    setSalaries(next);
  };

  const commitArrival = () => {
    const n = parseInt(arrivalDraft, 10);
    if (!isNaN(n) && n >= 2010 && n <= CURRENT_YEAR) setArrivalYear(n);
    else setArrivalDraft(String(arrivalYear));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e4dc", fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #0a0a0f 60%)",
        borderBottom: "1px solid #2a2a3e",
        padding: "36px 40px 28px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-40px", right: "-40px", width: "320px", height: "320px",
          background: "radial-gradient(circle, rgba(200,160,80,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#c8a050", textTransform: "uppercase", marginBottom: "10px" }}>
          Régime des Impatriés · Article 155 B CGI
        </div>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: "normal", letterSpacing: "1px", color: "#f0ebe0" }}>
          Tax Refund Calculator
        </h1>
        <p style={{ margin: "6px 0 0", color: "#8a8070", fontSize: "13px" }}>
          France · Full 8-year regime window · Per-year salary · Official barème
        </p>
      </div>

      <div style={{ padding: "28px 40px", maxWidth: "980px", margin: "0 auto" }}>

        {/* Settings row */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "14px", marginBottom: "28px", alignItems: "start" }}>

          {/* Arrival year */}
          <div style={{ background: "#12121c", border: "1px solid rgba(200,160,80,0.3)", borderRadius: "8px", padding: "18px 20px", minWidth: "180px" }}>
            <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
              Year Arrived in France
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={() => { const y = Math.max(2010, arrivalYear - 1); setArrivalYear(y); setArrivalDraft(String(y)); }}
                style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#c8a050", width: "28px", height: "28px", borderRadius: "4px", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>−</button>
              <input
                value={arrivalDraft}
                onChange={e => setArrivalDraft(e.target.value)}
                onBlur={commitArrival}
                onKeyDown={e => e.key === "Enter" && commitArrival()}
                style={{
                  background: "#0a0a12", border: "1px solid #2a2a3e", color: "#f0ebe0",
                  padding: "4px 0", borderRadius: "4px", fontSize: "22px", fontWeight: "bold",
                  width: "72px", textAlign: "center", fontFamily: "monospace", outline: "none",
                }}
              />
              <button onClick={() => { const y = Math.min(CURRENT_YEAR, arrivalYear + 1); setArrivalYear(y); setArrivalDraft(String(y)); }}
                style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#c8a050", width: "28px", height: "28px", borderRadius: "4px", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>+</button>
            </div>
            <div style={{ fontSize: "10px", color: "#5a5560", marginTop: "8px" }}>
              Regime ends: Dec 31, {regimeEndYear - 1}
            </div>
          </div>

          {/* Family situation */}
          <div style={{ background: "#12121c", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "18px 20px" }}>
            <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
              Family Situation
            </label>
            <select
              value={family}
              onChange={e => setFamily(e.target.value)}
              style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#e8e4dc", padding: "8px 12px", borderRadius: "4px", width: "100%", fontSize: "13px" }}
            >
              {Object.keys(FAMILY_PARTS).map(k => <option key={k}>{k}</option>)}
            </select>
          </div>

          {/* Exemption method */}
          <div style={{ background: "#12121c", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "18px 20px" }}>
            <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
              Exemption Method
            </label>
            <div style={{ display: "flex", gap: "8px", marginBottom: bonusMethod === "actual" ? "10px" : "0" }}>
              {[{ val: "flatrate", label: "Flat-rate 30%" }, { val: "actual", label: "Custom %" }].map(opt => (
                <div key={opt.val} onClick={() => setBonusMethod(opt.val)} style={{
                  flex: 1, padding: "8px 10px", borderRadius: "5px", cursor: "pointer", textAlign: "center",
                  border: bonusMethod === opt.val ? "1px solid #c8a050" : "1px solid #2a2a3e",
                  background: bonusMethod === opt.val ? "rgba(200,160,80,0.10)" : "#0a0a0f",
                  fontSize: "12px", color: bonusMethod === opt.val ? "#c8a050" : "#8a8070",
                  transition: "all 0.15s",
                }}>{opt.label}</div>
              ))}
            </div>
            {bonusMethod === "actual" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input type="range" min="5" max="50" step="1" value={customPct}
                  onChange={e => setCustomPct(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#c8a050" }} />
                <span style={{ fontSize: "16px", color: "#f0ebe0", minWidth: "38px", textAlign: "right" }}>{customPct}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Totals banner */}
        <div style={{
          background: "linear-gradient(135deg, rgba(200,160,80,0.10), rgba(200,160,80,0.02))",
          border: "1px solid rgba(200,160,80,0.28)",
          borderRadius: "10px", padding: "22px 28px", marginBottom: "28px",
          display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
          alignItems: "center",
        }}>
          {[
            { title: "Retroactive Refund", value: totalRefund, sub: refundableRows.length ? `${refundableRows.map(r=>r.year).join(" + ")} · Claim now` : "No refundable years", color: "#f0ebe0" },
            null,
            { title: "Forward Savings", value: totalForward, sub: `${[...currentRows,...futureRows].length} years remaining`, color: "#8a8aaa" },
            null,
            { title: "Total Benefit", value: grandTotal, sub: `Over ${rows.length} years of the regime`, color: "#c8a050" },
          ].map((item, i) => item === null
            ? <div key={i} style={{ width: "1px", background: "#2a2a3e", alignSelf: "stretch" }} />
            : (
              <div key={i} style={{ padding: "0 20px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#6a6560", textTransform: "uppercase", marginBottom: "6px" }}>{item.title}</div>
                <div style={{ fontSize: "30px", color: item.color, letterSpacing: "-1px" }}>{formatEur(item.value)}</div>
                <div style={{ fontSize: "11px", color: "#5a5560", marginTop: "4px" }}>{item.sub}</div>
              </div>
            )
          )}
        </div>

        {/* Year-by-year table */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a050", textTransform: "uppercase" }}>
              Year-by-Year Breakdown
              <span style={{ marginLeft: "12px", fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "none" }}>
                · Click salary buttons to edit
              </span>
            </div>
            <button onClick={syncSalary} style={{
              background: "rgba(200,160,80,0.08)", border: "1px solid rgba(200,160,80,0.25)",
              color: "#c8a050", padding: "5px 14px", borderRadius: "4px",
              fontSize: "10px", letterSpacing: "1.5px", cursor: "pointer", textTransform: "uppercase",
            }}>
              Sync all salaries to {CURRENT_YEAR}
            </button>
          </div>

          <div style={{ border: "1px solid #1e1e30", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#0d0d18", borderBottom: "1px solid #1e1e30" }}>
                  {["Year", "Status", "Gross Salary", "Exempt", "Taxable Base", "Tax (no regime)", "Tax (with regime)", "Annual Saving"].map((h, i) => (
                    <th key={i} style={{
                      padding: "11px 14px", textAlign: i < 2 ? "left" : "right",
                      color: "#4a4a5a", fontWeight: "normal", fontSize: "10px",
                      letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const st = STATUS_STYLES[row.status];
                  const isExpired = row.status === "expired";
                  return (
                    <tr key={row.year} style={{ borderBottom: "1px solid #14141e", background: st.rowBg, opacity: isExpired ? 0.5 : 1 }}>
                      <td style={{ padding: "12px 14px", color: "#f0ebe0", fontWeight: "bold", fontSize: "14px" }}>
                        {row.year}
                        {row.estimated && <span style={{ fontSize: "9px", color: "#4a4a6a", marginLeft: "4px" }}>est.</span>}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "9px", letterSpacing: "1px", padding: "2px 7px", borderRadius: "20px", background: st.bg, color: st.color, whiteSpace: "nowrap", display: "inline-block" }}>
                            {st.badge}
                          </span>
                          {row.status === "refundable" && (
                            <span style={{ fontSize: "9px", color: "#c8a050" }}>⏰ Deadline: {getDeadline(row.year)}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <SalaryCell
                          value={salaries[row.year] ?? 80000}
                          onChange={val => updateSalary(row.year, val)}
                        />
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#c8a050" }}>{formatEur(row.exemption)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#8a8070" }}>{formatEur(row.taxableWithRegime)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#6a6070" }}>{formatEur(row.taxWithout)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#e8e4dc" }}>{formatEur(row.taxWith)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isExpired ? (
                          <span style={{ fontSize: "11px", color: "#6a4040" }}>Expired</span>
                        ) : (
                          <>
                            <div style={{ color: "#c8a050", fontWeight: "bold", fontSize: "13px" }}>{formatEur(row.saving)}</div>
                            <div style={{ fontSize: "10px", color: "#5a5560", marginTop: "2px" }}>
                              {row.effWithout.toFixed(1)}% → {row.effWith.toFixed(1)}%
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#12121c", borderTop: "2px solid #2a2a3e" }}>
                  <td colSpan={6} style={{ padding: "13px 14px", color: "#6a6560", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase" }}>
                    Total estimated benefit ({rows.filter(r => r.status !== "expired").length} active years)
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "#5a5560" }}>Refundable</div>
                    <div style={{ color: "#f0ebe0", fontSize: "13px" }}>{formatEur(totalRefund)}</div>
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "#5a5560" }}>Grand total</div>
                    <div style={{ color: "#c8a050", fontSize: "18px" }}>{formatEur(grandTotal)}</div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {expiredRows.length > 0 && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#6a4040", padding: "0 4px" }}>
              ✕ {expiredRows.length} year{expiredRows.length > 1 ? "s" : ""} ({expiredRows.map(r => r.year).join(", ")}) are beyond the 2-year claim window and cannot be recovered.
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div style={{ background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: "8px", padding: "16px 20px", fontSize: "11px", color: "#5a5560", lineHeight: "1.7" }}>
          <div style={{ color: "#8a8070", marginBottom: "5px", letterSpacing: "2px", textTransform: "uppercase", fontSize: "10px" }}>⚠ Important Caveats</div>
          Indicative estimate using official French barème (known scales for 2022–2025; earlier and future years use nearest known scale as proxy, marked "est."). Figures exclude social charges (CSG/CRDS), tax credits, and treaty provisions. The flat-rate 30% option does not require a contract amendment; custom % requires the bonus contractually specified before starting employment. Retroactive claims must be filed before the deadline shown per year. <strong style={{ color: "#8a8070" }}>Consult a qualified avocat fiscaliste before filing any amended return.</strong>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
