import { useState, useEffect, useRef } from "react";
import React from "react";

// Official barèmes keyed by INCOME YEAR (année des revenus), not declaration year.
// Sources: Légifrance art. 197 CGI, BOFiP, Lois de finances annuelles.
//
// 2021 income → declared spring 2022 → LFI 2022 barème (0/10225/26070/74545/160336)
// 2022 income → declared spring 2023 → LFI 2023 barème: +5.4% (0/10777/27478/78570/168994)
// 2023 income → declared spring 2024 → LFI 2024 barème: +4.8% (0/11294/28797/82341/177106)
// 2024 income → declared spring 2025 → LFI 2025 barème: +1.8% (0/11497/29315/83823/180294)
// 2025 income → declared spring 2026 → LFI 2026 barème: +0.9% (promulguée 19 fév 2026)
const KNOWN_BRACKETS = {
  2021: [
    { min: 0,       max: 10225,   rate: 0    },
    { min: 10225,   max: 26070,   rate: 0.11 },
    { min: 26070,   max: 74545,   rate: 0.30 },
    { min: 74545,   max: 160336,  rate: 0.41 },
    { min: 160336,  max: Infinity, rate: 0.45 },
  ],
  2022: [
    { min: 0,       max: 10777,   rate: 0    },
    { min: 10777,   max: 27478,   rate: 0.11 },
    { min: 27478,   max: 78570,   rate: 0.30 },
    { min: 78570,   max: 168994,  rate: 0.41 },
    { min: 168994,  max: Infinity, rate: 0.45 },
  ],
  2023: [
    { min: 0,       max: 11294,   rate: 0    },
    { min: 11294,   max: 28797,   rate: 0.11 },
    { min: 28797,   max: 82341,   rate: 0.30 },
    { min: 82341,   max: 177106,  rate: 0.41 },
    { min: 177106,  max: Infinity, rate: 0.45 },
  ],
  2024: [
    { min: 0,       max: 11497,   rate: 0    },
    { min: 11497,   max: 29315,   rate: 0.11 },
    { min: 29315,   max: 83823,   rate: 0.30 },
    { min: 83823,   max: 180294,  rate: 0.41 },
    { min: 180294,  max: Infinity, rate: 0.45 },
  ],
  2025: [
    // LFI 2026 promulguée 19 fév 2026 — revalorisation +0.9%
    // Source: art. 2 LFI 2026 / economie.gouv.fr
    { min: 0,       max: 11600,   rate: 0    },
    { min: 11600,   max: 29579,   rate: 0.11 },
    { min: 29579,   max: 84578,   rate: 0.30 },
    { min: 84578,   max: 181921,  rate: 0.41 },
    { min: 181921,  max: Infinity, rate: 0.45 },
  ],
};

// Déduction forfaitaire 10% — plafond indexé annuellement (art. 83 CGI)
// Source: BOFiP BOI-BAREME-000035 / service-public.fr / toutsurmesfinances.com
const DEDUCTION_CAP = {
  2021: 12829,
  2022: 13522,  // +5.4% vs 2021
  2023: 14171,  // +4.8% vs 2022
  2024: 14426,  // source: service-public.fr (impôts 2025 sur revenus 2024)
  2025: 14555,  // source: service-public.fr (impôts 2026 sur revenus 2025)
};

const CURRENT_YEAR = 2025;
const CLAIM_WINDOW = 2; // can recover last 2 years

function getBrackets(year) {
  const keys = Object.keys(KNOWN_BRACKETS).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return { brackets: KNOWN_BRACKETS[k], estimated: year > k };
  }
  return { brackets: KNOWN_BRACKETS[keys[keys.length - 1]], estimated: true };
}

function getDeductionCap(year) {
  const keys = Object.keys(DEDUCTION_CAP).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return DEDUCTION_CAP[k];
  }
  return DEDUCTION_CAP[keys[keys.length - 1]];
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

  // Step 1 — Déduction forfaitaire 10% (art. 83 CGI), plafond indexé par année
  const cap = getDeductionCap(year);
  const deduction = Math.min(gross * 0.10, cap);
  const net = gross - deduction;

  // Step 2 — Prime d'impatriation forfaitaire
  // Base = rémunération brute AVANT déduction 10% (BOFiP BOI-RSA-GEO-40-10-20 §90).
  // "gross" here is treated as net of social charges (the declared salary input).
  const rawExemption = gross * (exemptPct / 100);

  // Step 3 — Plafonnement global 50% (art. 155 B I CGI / BOFiP §290)
  // The total exempt amount cannot exceed 50% of total gross remuneration.
  const maxExemption = gross * 0.50;
  const exemption = Math.min(rawExemption, maxExemption);
  const cappedByGlobal = rawExemption > maxExemption;

  // Step 4 — Taxable base with regime = net minus exempt prime.
  // There is no separate 70% statutory floor — the 50% gross ceiling already ensures
  // at least 50% of gross remains taxable. The floor here matches the 50% ceiling.
  const taxableWithRegime = Math.max(net - exemption, net * 0.50);

  const taxWithout = calcTax(net, brackets, parts);
  const taxWith = calcTax(taxableWithRegime, brackets, parts);
  const saving = Math.max(0, taxWithout - taxWith);
  return {
    gross, net, deduction, exemption, rawExemption, cappedByGlobal, taxableWithRegime,
    taxWithout, taxWith, saving, estimated,
    effWithout: (taxWithout / gross) * 100,
    effWith: (taxWith / gross) * 100,
  };
}

function formatEur(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

// Reusable tooltip component
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        left: Math.max(8, Math.min(r.left + r.width / 2 - 140, window.innerWidth - 288)),
      });
    }
    setVisible(true);
  };

  return (
    <span ref={ref} style={{ display: "inline-block", cursor: "help" }}
      onMouseEnter={show} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: "280px",
          background: "#1e1e32",
          border: "1px solid rgba(200,160,80,0.7)",
          borderRadius: "7px",
          padding: "10px 13px",
          fontSize: "11px",
          lineHeight: "1.6",
          color: "#e8e4dc",
          zIndex: 9999,
          pointerEvents: "none",
          boxShadow: "0 8px 28px rgba(0,0,0,0.85)",
          whiteSpace: "normal",
          textAlign: "left",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.2px",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// Expanded salary editor: slider + manual text input
function SalaryEditor({ value, onChange, onClose }) {
  const [draft, setDraft] = useState(String(value));
  const [textEditing, setTextEditing] = useState(false);

  const commitText = () => {
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n >= 1000 && n <= 2000000) { onChange(n); setDraft(String(n)); }
    else setDraft(String(value));
    setTextEditing(false);
  };

  return (
    <div style={{
      background: "#0e0e1a",
      border: "1px solid rgba(200,160,80,0.35)",
      borderRadius: "8px",
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: "10px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    }}>
      {/* Value display + text input toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", letterSpacing: "2px", color: "#6a6560", textTransform: "uppercase" }}>Gross Salary</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {textEditing ? (
            <>
              <span style={{ fontSize: "11px", color: "#c8a050" }}>€</span>
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitText}
                onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setDraft(String(value)); setTextEditing(false); } }}
                style={{
                  background: "#1a1a2e", border: "2px solid #c8a050",
                  boxShadow: "0 0 0 3px rgba(200,160,80,0.12)",
                  color: "#f0ebe0", padding: "4px 8px", borderRadius: "5px",
                  fontSize: "16px", width: "110px", textAlign: "right",
                  fontFamily: "monospace", outline: "none",
                }}
              />
              <button onMouseDown={e => { e.preventDefault(); commitText(); }} style={{
                background: "#c8a050", border: "none", color: "#0a0a0f",
                width: "24px", height: "24px", borderRadius: "4px",
                cursor: "pointer", fontSize: "12px", fontWeight: "bold",
              }}>✓</button>
            </>
          ) : (
            <button
              onClick={() => { setDraft(String(value)); setTextEditing(true); }}
              title="Click to type a value"
              style={{
                background: "rgba(200,160,80,0.08)", border: "1px solid rgba(200,160,80,0.25)",
                borderRadius: "5px", padding: "4px 10px 4px 12px",
                color: "#f0ebe0", fontSize: "17px", fontFamily: "monospace",
                cursor: "text", display: "inline-flex", alignItems: "center", gap: "7px",
                letterSpacing: "0.3px",
              }}
            >
              {formatEur(value)}
              <span style={{ fontSize: "12px", color: "#c8a050" }}>✎</span>
            </button>
          )}
          <button onClick={onClose} title="Close" style={{
            background: "none", border: "1px solid #2a2a3e", color: "#5a5560",
            width: "24px", height: "24px", borderRadius: "4px",
            cursor: "pointer", fontSize: "14px", lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      {/* Slider */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", color: "#3a3a4a", minWidth: "28px" }}>€30k</span>
        <input
          type="range" min="30000" max="300000" step="1000"
          value={value}
          onChange={e => { const n = Number(e.target.value); onChange(n); setDraft(String(n)); }}
          style={{ flex: 1, accentColor: "#c8a050", cursor: "pointer", height: "4px" }}
        />
        <span style={{ fontSize: "10px", color: "#3a3a4a", minWidth: "32px", textAlign: "right" }}>€300k</span>
      </div>

      {/* Quick presets */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {[40000, 60000, 80000, 100000, 120000, 150000, 200000].map(v => (
          <button key={v} onClick={() => { onChange(v); setDraft(String(v)); }} style={{
            background: value === v ? "rgba(200,160,80,0.2)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${value === v ? "rgba(200,160,80,0.5)" : "#2a2a3e"}`,
            color: value === v ? "#c8a050" : "#5a5560",
            padding: "3px 8px", borderRadius: "4px", fontSize: "10px",
            cursor: "pointer", letterSpacing: "0.5px",
          }}>€{v >= 1000 ? (v/1000)+"k" : v}</button>
        ))}
      </div>
    </div>
  );
}

// Collapsed pill button that shows the salary and opens the editor
function SalaryCell({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (open) {
    return <SalaryEditor value={value} onChange={onChange} onClose={() => setOpen(false)} />;
  }

  return (
    <button
      onClick={() => setOpen(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Click to adjust salary"
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
      <span style={{ fontSize: "11px", color: hovered ? "#c8a050" : "#5a5060", transition: "color 0.15s" }}>✎</span>
    </button>
  );
}

export default function App() {
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
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  <input type="range" min="5" max="50" step="1" value={customPct}
                    onChange={e => setCustomPct(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#c8a050" }} />
                  <span style={{ fontSize: "16px", color: customPct === 50 ? "#c8a050" : "#f0ebe0", minWidth: "38px", textAlign: "right" }}>{customPct}%</span>
                </div>
                <div style={{ fontSize: "10px", color: "#5a5560", lineHeight: 1.5 }}>
                  Legal max: <span style={{ color: "#c8a050" }}>50%</span> of gross (art. 155 B I CGI).
                  {customPct === 50 && <span style={{ color: "#c8a050" }}> · At ceiling.</span>}
                </div>
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

        {/* Year-by-year breakdown — card rows */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a050", textTransform: "uppercase" }}>
              Year-by-Year Breakdown
              <span style={{ marginLeft: "12px", fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "none" }}>
                · Click salary to adjust
              </span>
            </div>
            <button onClick={syncSalary} style={{
              background: "rgba(200,160,80,0.08)", border: "1px solid rgba(200,160,80,0.25)",
              color: "#c8a050", padding: "5px 14px", borderRadius: "4px",
              fontSize: "10px", letterSpacing: "1.5px", cursor: "pointer", textTransform: "uppercase",
            }}>
              Sync all to {CURRENT_YEAR}
            </button>
          </div>

          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr",
            gap: "0 8px",
            padding: "8px 14px",
            background: "#0d0d18",
            borderRadius: "8px 8px 0 0",
            border: "1px solid #1e1e30",
            borderBottom: "none",
          }}>
            {[
              { label: "Year",          tip: "The income year. The impatriate regime applies from your year of arrival for up to 8 calendar years (art. 155 B CGI)." },
              { label: "Status",        tip: "REFUNDABLE: you can file an amended return to recover overpaid tax. APPLY NOW: file when declaring this year's income. FUTURE: upcoming years where the regime will apply. EXPIRED: beyond the 2-year claim window — cannot be recovered." },
              { label: "Gross Salary",  tip: "Your gross annual salary (brut), assumed to be net of social charges (cotisations sociales). Click any value to adjust it with a slider or by typing." },
              { label: "Exempt",        tip: "The prime d'impatriation: the portion of your salary exempt from income tax under the regime. Flat-rate = 30% of gross salary (BOFiP BOI-RSA-GEO-40-10-20 §90). Capped at 50% of gross (art. 155 B I CGI)." },
              { label: "Taxable Income",tip: "Your net taxable income after applying the impatriate exemption and the 10% frais professionnels deduction (art. 83 CGI). This is the base on which your income tax is actually computed under the regime." },
              { label: "Tax without",   tip: "Estimated income tax without the impatriate regime, computed on your net salary after the 10% frais professionnels deduction only, using the official progressive barème (art. 197 CGI) for this income year." },
              { label: "Tax with",      tip: "Estimated income tax with the impatriate regime applied, computed on the reduced taxable base (after exemption). The difference between this and 'Tax without' is your annual saving." },
              { label: "Saving",        tip: "Annual tax saving = Tax without regime − Tax with regime. The percentage shown is your effective tax rate (tax ÷ gross salary) shifting from the standard rate to the impatriate rate." },
            ].map(({ label, tip }, i) => (
              <div key={i} style={{
                fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase",
                color: "#4a4a5a", textAlign: i >= 2 ? "right" : "left",
              }}>
                <Tooltip text={tip}>
                  <span style={{ borderBottom: "1px dashed #3a3a5a", paddingBottom: "1px" }}>{label}</span>
                </Tooltip>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ border: "1px solid #1e1e30", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {rows.map((row, ri) => {
              const st = STATUS_STYLES[row.status];
              const isExpired = row.status === "expired";
              return (
                <div key={row.year} style={{
                  borderBottom: ri < rows.length - 1 ? "1px solid #14141e" : "none",
                  background: st.rowBg,
                  opacity: isExpired ? 0.5 : 1,
                }}>
                  {/* Main data row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: "0 8px",
                    padding: "12px 14px",
                    alignItems: "center",
                  }}>
                    {/* Year */}
                    <div>
                      <Tooltip text={`Income year ${row.year}${row.estimated ? " (estimated — using nearest known barème as proxy)" : ""}. Tax declared in spring ${row.year + 1}. Barème: ${row.estimated ? "proxy from nearest known year" : `official LFI ${row.year + 1}`}.`}>
                        <div style={{ color: "#f0ebe0", fontWeight: "bold", fontSize: "15px", display: "inline-block", cursor: "help" }}>{row.year}</div>
                      </Tooltip>
                      {row.estimated && <div style={{ fontSize: "9px", color: "#4a4a6a" }}>est.</div>}
                    </div>

                    {/* Status */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <Tooltip text={
                        row.status === "refundable" ? `You can file a réclamation contentieuse (amended return) for ${row.year} income before ${getDeadline(row.year)}. Deadline = Dec 31 of the 2nd year after assessment (income year + 1 + 2). Source: impots.gouv.fr/particulier/delais-de-reclamation.`
                        : row.status === "current" ? `Declare the impatriate exemption on your ${row.year} income tax return (filed spring ${row.year + 1}). Use the "autres renseignements" section of form 2042.`
                        : row.status === "future" ? `Upcoming year within your 8-year regime window. The exemption will apply automatically if you remain with your employer and are tax-resident in France.`
                        : `This year is outside the 2-year amendment window (délai de réclamation). Tax paid for ${row.year} cannot be recovered.`
                      }>
                        <span style={{ fontSize: "9px", letterSpacing: "1px", padding: "2px 7px", borderRadius: "20px", background: st.bg, color: st.color, whiteSpace: "nowrap", display: "inline-block", cursor: "help" }}>
                          {st.badge}
                        </span>
                      </Tooltip>
                      {row.status === "refundable" && (
                        <span style={{ fontSize: "9px", color: "#c8a050" }}>⏰ {getDeadline(row.year)}</span>
                      )}
                    </div>

                    {/* Salary cell — opens editor below */}
                    <div style={{ textAlign: "right" }}>
                      <Tooltip text={`Gross annual salary (brut) for ${row.year}, assumed net of social charges (cotisations sociales ~22% employee). Click to adjust with a slider or type a custom value. The 10% frais professionnels deduction (art. 83 CGI) is applied automatically in the calculation.`}>
                        <span style={{ display: "inline-block" }}>
                          <SalaryCell
                            value={salaries[row.year] ?? 80000}
                            onChange={val => updateSalary(row.year, val)}
                          />
                        </span>
                      </Tooltip>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <Tooltip text={`Prime d'impatriation (forfait ${exemptPct}%): ${exemptPct}% × ${formatEur(row.gross)} = ${formatEur(row.rawExemption)}${row.cappedByGlobal ? ` → capped at 50% max = ${formatEur(row.exemption)}` : ""}. Source: BOFiP BOI-RSA-GEO-40-10-20 §90.`}>
                        <div style={{ color: "#c8a050", fontSize: "13px", display: "inline-block" }}>{formatEur(row.exemption)}</div>
                      </Tooltip>
                      {row.cappedByGlobal && (
                        <div style={{ fontSize: "9px", color: "#a06030", marginTop: "2px" }}>⚠ 50% cap applied</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Tooltip text={`Step 1 — 10% frais professionnels deduction (art. 83 CGI): ${formatEur(row.gross)} × 90% = ${formatEur(row.net)} (net imposable). Step 2 — Deduct impatriate exemption: ${formatEur(row.net)} − ${formatEur(row.exemption)} = ${formatEur(row.taxableWithRegime)}. This is the base taxed at the progressive barème.`}>
                        <div style={{ color: "#8a8aff", fontSize: "13px", display: "inline-block" }}>{formatEur(row.taxableWithRegime)}</div>
                      </Tooltip>
                      <div style={{ fontSize: "10px", color: "#4a4a6a", marginTop: "2px" }}>of {formatEur(row.net)}</div>
                    </div>
                    <Tooltip text={`Progressive barème (art. 197 CGI) applied to ${formatEur(row.net)} net imposable (gross minus 10% deduction). Divided by ${parts} part(s) for quotient familial, taxed by bracket, then multiplied back. No impatriate exemption applied here.`}>
                      <div style={{ textAlign: "right", color: "#6a6070", fontSize: "13px", cursor: "help" }}>{formatEur(row.taxWithout)}</div>
                    </Tooltip>
                    <Tooltip text={`Progressive barème (art. 197 CGI) applied to the reduced taxable base of ${formatEur(row.taxableWithRegime)} (after impatriate exemption). Divided by ${parts} part(s), taxed by bracket, then multiplied back.`}>
                      <div style={{ textAlign: "right", color: "#e8e4dc", fontSize: "13px", cursor: "help" }}>{formatEur(row.taxWith)}</div>
                    </Tooltip>
                    <div style={{ textAlign: "right" }}>
                      {isExpired ? (
                        <span style={{ fontSize: "11px", color: "#6a4040" }}>Expired</span>
                      ) : (
                        <>
                          <Tooltip text={`Annual saving = Tax without (${formatEur(row.taxWithout)}) − Tax with regime (${formatEur(row.taxWith)}) = ${formatEur(row.saving)}. Effective rate: ${row.effWithout.toFixed(2)}% → ${row.effWith.toFixed(2)}% (tax ÷ gross salary).`}>
                            <div style={{ color: "#c8a050", fontWeight: "bold", fontSize: "13px", display: "inline-block", cursor: "help" }}>{formatEur(row.saving)}</div>
                          </Tooltip>
                          <div style={{ fontSize: "10px", color: "#5a5560", marginTop: "2px" }}>
                            {row.effWithout.toFixed(1)}% → {row.effWith.toFixed(1)}%
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Footer totals */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr",
              gap: "0 8px",
              padding: "13px 14px",
              background: "#12121c",
              borderTop: "2px solid #2a2a3e",
              alignItems: "center",
            }}>
              <div style={{ gridColumn: "1 / 7", fontSize: "10px", color: "#6a6560", letterSpacing: "1px", textTransform: "uppercase" }}>
                Total · {rows.filter(r => r.status !== "expired").length} active years
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "#5a5560" }}>Refundable</div>
                <div style={{ color: "#f0ebe0", fontSize: "13px" }}>{formatEur(totalRefund)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "#5a5560" }}>Grand total</div>
                <div style={{ color: "#c8a050", fontSize: "18px" }}>{formatEur(grandTotal)}</div>
              </div>
            </div>
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
          Indicative estimates using official French barèmes (2021–2025 income years exact; earlier/future years use nearest known scale, marked "est."). Barèmes source: art. 197 CGI / Lois de finances / Légifrance. The 2025-income barème (LFI 2026, promulguée 19 fév. 2026, +0.9%) is official. Déduction forfaitaire 10% caps are indexed per year (BOI-BAREME-000035). The flat-rate 30% prime exemption is calculated on gross salary before the 10% deduction (BOFiP BOI-RSA-GEO-40-10-20 §90). The 50% global ceiling on the exempt amount is enforced per art. 155 B I CGI / BOFiP §290. Figures exclude social charges (CSG/CRDS ~17.2%), tax credits, and treaty provisions. The "rémunération de référence" floor (salary for analogous role in same company) is not independently verifiable here and is approximated conservatively. <strong style={{ color: "#8a8070" }}>Consult a qualified avocat fiscaliste before filing any amended return.</strong>
        </div>
      </div>
    </div>
  );
}
