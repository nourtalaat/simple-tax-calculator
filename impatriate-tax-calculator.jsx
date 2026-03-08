const { useState, useEffect, useRef } = React;

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
    { min: 0, max: 10225, rate: 0 },
    { min: 10225, max: 26070, rate: 0.11 },
    { min: 26070, max: 74545, rate: 0.30 },
    { min: 74545, max: 160336, rate: 0.41 },
    { min: 160336, max: Infinity, rate: 0.45 },
  ],
  2022: [
    { min: 0, max: 10777, rate: 0 },
    { min: 10777, max: 27478, rate: 0.11 },
    { min: 27478, max: 78570, rate: 0.30 },
    { min: 78570, max: 168994, rate: 0.41 },
    { min: 168994, max: Infinity, rate: 0.45 },
  ],
  2023: [
    { min: 0, max: 11294, rate: 0 },
    { min: 11294, max: 28797, rate: 0.11 },
    { min: 28797, max: 82341, rate: 0.30 },
    { min: 82341, max: 177106, rate: 0.41 },
    { min: 177106, max: Infinity, rate: 0.45 },
  ],
  2024: [
    { min: 0, max: 11497, rate: 0 },
    { min: 11497, max: 29315, rate: 0.11 },
    { min: 29315, max: 83823, rate: 0.30 },
    { min: 83823, max: 180294, rate: 0.41 },
    { min: 180294, max: Infinity, rate: 0.45 },
  ],
  2025: [
    // LFI 2026 promulguée 19 fév 2026 — revalorisation +0.9%
    // Source: art. 2 LFI 2026 / economie.gouv.fr
    { min: 0, max: 11600, rate: 0 },
    { min: 11600, max: 29579, rate: 0.11 },
    { min: 29579, max: 84578, rate: 0.30 },
    { min: 84578, max: 181921, rate: 0.41 },
    { min: 181921, max: Infinity, rate: 0.45 },
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
const ARRIVAL_MAX_YEAR = CURRENT_YEAR + 1; // allow planning a move next year
const CLAIM_WINDOW = 2; // can recover last 2 years


function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

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
  expired: { badge: "✕ EXPIRED", bg: "rgba(120,60,60,0.15)", color: "#a06060", rowBg: "rgba(120,60,60,0.03)", border: "#2a1e1e" },
  refundable: { badge: "⬤ REFUNDABLE", bg: "rgba(200,160,80,0.15)", color: "#c8a050", rowBg: "rgba(200,160,80,0.04)", border: "rgba(200,160,80,0.25)" },
  current: { badge: "◯ APPLY NOW", bg: "rgba(80,160,200,0.15)", color: "#50a0c8", rowBg: "rgba(80,160,200,0.03)", border: "rgba(80,160,200,0.2)" },
  future: { badge: "◯ FUTURE", bg: "rgba(100,100,140,0.15)", color: "#6a6a9a", rowBg: "transparent", border: "#1e1e2e" },
  past: { badge: "✓ PAST", bg: "rgba(100,160,100,0.15)", color: "#70a870", rowBg: "rgba(100,160,100,0.03)", border: "#1e2e1e" },
};

const FAMILY_PARTS = {
  "Single": 1,
  "Married/PACS, no children": 2,
  "Married/PACS, 1 child": 2.5,
  "Married/PACS, 2 children": 3,
};

// ══════════════════════════════════════════════════════════════════
// NETHERLANDS — Box 1 brackets, 30% ruling, heffingskortingen
// ══════════════════════════════════════════════════════════════════

// Box 1 combined income tax + volksverzekeringen
const NL_BRACKETS = {
  2024: [
    { min: 0, max: 75518, rate: 0.3697 },
    { min: 75518, max: Infinity, rate: 0.4950 },
  ],
  2025: [
    { min: 0, max: 38441, rate: 0.3582 },
    { min: 38441, max: 76817, rate: 0.3748 },
    { min: 76817, max: Infinity, rate: 0.4950 },
  ],
  2026: [
    { min: 0, max: 38883, rate: 0.3575 },
    { min: 38883, max: 78426, rate: 0.3756 },
    { min: 78426, max: Infinity, rate: 0.4950 },
  ],
};

// Wet normering topinkomens salary cap
const NL_WNT_CAP = {
  2024: 233000,
  2025: 246000,
  2026: 262000,
};

// Minimum salary thresholds (taxable portion must meet this)
const NL_MIN_SALARY = {
  2024: { standard: 46107, msc30: 35048 },
  2025: { standard: 46660, msc30: 35468 },
};

// Algemene heffingskorting (general tax credit)
const NL_ALGEMENE_KORTING = {
  2024: { max: 3362, phaseOutStart: 24812, phaseOutRate: 0.06630 },
  2025: { max: 3068, phaseOutStart: 28406, phaseOutRate: 0.06337 },
};

// Arbeidskorting (employment tax credit) — piecewise tiers
const NL_ARBEIDSKORTING = {
  2024: [
    { max: 11490, base: 0, rate: 0.08425, offset: 0 },
    { max: 24820, base: 968, rate: 0.31433, offset: 11490 },
    { max: 39957, base: 5158, rate: 0.02471, offset: 24820 },
    { max: 124934, base: 5532, rate: -0.06510, offset: 39957 },
    { max: Infinity, base: 0, rate: 0, offset: 0 },
  ],
  2025: [
    { max: 12169, base: 0, rate: 0.08053, offset: 0 },
    { max: 26288, base: 980, rate: 0.30030, offset: 12169 },
    { max: 43071, base: 5220, rate: 0.02258, offset: 26288 },
    { max: 129078, base: 5599, rate: -0.06510, offset: 43071 },
    { max: Infinity, base: 0, rate: 0, offset: 0 },
  ],
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
    taxWithout, taxWith, netPostTax: gross - taxWith, saving, estimated,
    effWithout: (taxWithout / gross) * 100,
    effWith: (taxWith / gross) * 100,
  };
}

// ══════════════════════════════════════════════════════════════════
// NETHERLANDS — Calculation functions
// ══════════════════════════════════════════════════════════════════

function getNLBrackets(year) {
  const keys = Object.keys(NL_BRACKETS).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return { brackets: NL_BRACKETS[k], estimated: year > k };
  }
  return { brackets: NL_BRACKETS[keys[keys.length - 1]], estimated: true };
}

function getNLWNTCap(year) {
  const keys = Object.keys(NL_WNT_CAP).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return NL_WNT_CAP[k];
  }
  return NL_WNT_CAP[keys[keys.length - 1]];
}

function getNLMinSalary(year, profile) {
  const keys = Object.keys(NL_MIN_SALARY).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    if (year >= k) return NL_MIN_SALARY[k][profile];
  }
  return NL_MIN_SALARY[keys[keys.length - 1]][profile];
}

function getNLRulingPct(arrivalYear, incomeYear) {
  if (arrivalYear < 2024) return 30;
  if (incomeYear <= 2026) return 30;
  return 27;
}

function getNLYearStatus(year) {
  if (year < CURRENT_YEAR) return "past";
  if (year === CURRENT_YEAR) return "current";
  return "future";
}

function calcNLTax(taxable, brackets) {
  let t = 0;
  for (const b of brackets) {
    if (taxable <= b.min) break;
    t += (Math.min(taxable, b.max) - b.min) * b.rate;
  }
  return t;
}

function calcAlgemeneKorting(taxable, year) {
  const keys = Object.keys(NL_ALGEMENE_KORTING).map(Number).sort((a, b) => b - a);
  let params;
  for (const k of keys) {
    if (year >= k) { params = NL_ALGEMENE_KORTING[k]; break; }
  }
  if (!params) params = Object.values(NL_ALGEMENE_KORTING)[0];
  if (taxable <= params.phaseOutStart) return params.max;
  return Math.max(0, params.max - (taxable - params.phaseOutStart) * params.phaseOutRate);
}

function calcArbeidskorting(income, year) {
  const keys = Object.keys(NL_ARBEIDSKORTING).map(Number).sort((a, b) => b - a);
  let tiers;
  for (const k of keys) {
    if (year >= k) { tiers = NL_ARBEIDSKORTING[k]; break; }
  }
  if (!tiers) tiers = Object.values(NL_ARBEIDSKORTING)[0];
  for (const tier of tiers) {
    if (income <= tier.max) {
      return Math.max(0, tier.base + tier.rate * (income - tier.offset));
    }
  }
  return 0;
}

function calcRowDataNL(gross, year, arrivalYear, profile) {
  const { brackets, estimated } = getNLBrackets(year);
  const wntCap = getNLWNTCap(year);
  const rulingPct = getNLRulingPct(arrivalYear, year);
  const minSalary = getNLMinSalary(year, profile);

  const cappedGross = Math.min(gross, wntCap);
  const wntCapApplied = gross > wntCap;
  const exemption = cappedGross * (rulingPct / 100);
  const taxable = gross - exemption;
  const belowMinSalary = taxable < minSalary;

  // Tax without ruling (on full gross)
  const taxBeforeCreditsWithout = calcNLTax(gross, brackets);
  const algKortingWithout = calcAlgemeneKorting(gross, year);
  const arbKortingWithout = calcArbeidskorting(gross, year);
  const taxWithout = Math.max(0, taxBeforeCreditsWithout - algKortingWithout - arbKortingWithout);

  // Tax with ruling (on taxable = gross - exemption)
  const taxBeforeCreditsWith = calcNLTax(taxable, brackets);
  const algKortingWith = calcAlgemeneKorting(taxable, year);
  const arbKortingWith = calcArbeidskorting(taxable, year);
  const taxWith = Math.max(0, taxBeforeCreditsWith - algKortingWith - arbKortingWith);

  const saving = Math.max(0, taxWithout - taxWith);

  return {
    gross, taxable, exemption, rulingPct, wntCap, wntCapApplied,
    belowMinSalary, minSalary, cappedGross,
    taxBeforeCreditsWithout, taxBeforeCreditsWith,
    algKortingWithout, arbKortingWithout, algKortingWith, arbKortingWith,
    taxWithout, taxWith, netPostTax: gross - taxWith, saving, estimated,
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

// Inline slider cell — click value to type custom amount outside slider bounds
function SalaryCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n >= 1) onChange(n);
    setEditing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{
            background: "#1a1a2e", border: "1px solid #c8a050",
            color: "#f0ebe0", padding: "2px 6px", borderRadius: "4px",
            fontSize: "13px", width: "90px", textAlign: "right",
            fontFamily: "monospace", outline: "none",
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to type a custom value"
          style={{ fontSize: "13px", fontFamily: "monospace", color: "#c8a050", letterSpacing: "0.3px", cursor: "text", borderBottom: "1px dashed rgba(200,160,80,0.4)" }}
        >
          {formatEur(value)}
        </span>
      )}
      <input
        type="range" min="30000" max="300000" step="1000"
        value={Math.min(Math.max(value, 30000), 300000)}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "120px", accentColor: "#c8a050", cursor: "pointer", height: "4px" }}
      />
    </div>
  );
}

function App() {
  const [country, setCountry] = useState("FR");
  const [arrivalYear, setArrivalYear] = useState(2020);
  const [arrivalDraft, setArrivalDraft] = useState("2020");
  const [salaries, setSalaries] = useState({});
  const [family, setFamily] = useState("Single");
  const [bonusMethod, setBonusMethod] = useState("flatrate");
  const [customPct, setCustomPct] = useState(30);
  const [nlProfile, setNlProfile] = useState("standard");

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 700;
  const parts = FAMILY_PARTS[family];
  const exemptPct = bonusMethod === "flatrate" ? 30 : customPct;

  const regimeDuration = country === "FR" ? 8 : 5;
  const arrivalMin = country === "FR" ? 2010 : 2015;
  const regimeEndYear = arrivalYear + regimeDuration;
  const regimeYears = Array.from({ length: regimeDuration }, (_, i) => arrivalYear + i);

  const handleCountryChange = (newCountry) => {
    if (newCountry === country) return;
    setCountry(newCountry);
    const defaultYear = newCountry === "FR" ? 2020 : 2023;
    setArrivalYear(defaultYear);
    setArrivalDraft(String(defaultYear));
  };

  // Sync salaries when regime window changes
  useEffect(() => {
    setSalaries(prev => {
      const next = {};
      for (const y of regimeYears) {
        next[y] = prev[y] ?? 80000;
      }
      return next;
    });
  }, [arrivalYear, regimeDuration]);

  const updateSalary = (year, val) => setSalaries(s => ({ ...s, [year]: val }));

  const rows = regimeYears.map(year => {
    if (country === "NL") {
      const status = getNLYearStatus(year);
      const data = calcRowDataNL(salaries[year] ?? 80000, year, arrivalYear, nlProfile);
      return { year, status, ...data };
    }
    const status = getYearStatus(year);
    const data = calcRowData(salaries[year] ?? 80000, year, parts, exemptPct);
    return { year, status, ...data };
  });

  const pastRows = rows.filter(r => r.status === "past");
  const refundableRows = rows.filter(r => r.status === "refundable");
  const currentRows = rows.filter(r => r.status === "current");
  const futureRows = rows.filter(r => r.status === "future");
  const expiredRows = rows.filter(r => r.status === "expired");

  const totalPast = pastRows.reduce((s, r) => s + r.saving, 0);
  const totalRefund = refundableRows.reduce((s, r) => s + r.saving, 0);
  const totalForward = [...currentRows, ...futureRows].reduce((s, r) => s + r.saving, 0);
  const grandTotal = country === "NL" ? totalPast + totalForward : totalRefund + totalForward;

  const syncSalary = () => {
    const base = salaries[CURRENT_YEAR] ?? salaries[regimeYears[0]] ?? 80000;
    const next = {};
    for (const y of regimeYears) next[y] = base;
    setSalaries(next);
  };

  const commitArrival = () => {
    const n = parseInt(arrivalDraft, 10);
    if (!isNaN(n) && n >= arrivalMin && n <= ARRIVAL_MAX_YEAR) setArrivalYear(n);
    else setArrivalDraft(String(arrivalYear));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e4dc", fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #0a0a0f 60%)",
        borderBottom: "1px solid #2a2a3e",
        padding: isMobile ? "24px 16px 20px" : "36px 40px 28px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-40px", right: "-40px", width: "320px", height: "320px",
          background: "radial-gradient(circle, rgba(200,160,80,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Country selector */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
          {[{ val: "FR", label: "\ud83c\uddeb\ud83c\uddf7 France" }, { val: "NL", label: "\ud83c\uddf3\ud83c\uddf1 Netherlands" }].map(opt => (
            <div key={opt.val} onClick={() => handleCountryChange(opt.val)} style={{
              padding: "5px 16px", borderRadius: "20px", cursor: "pointer",
              border: country === opt.val ? "1px solid #c8a050" : "1px solid #2a2a3e",
              background: country === opt.val ? "rgba(200,160,80,0.10)" : "transparent",
              fontSize: "12px", color: country === opt.val ? "#c8a050" : "#6a6070",
              transition: "all 0.15s", letterSpacing: "0.5px",
            }}>{opt.label}</div>
          ))}
        </div>
        {country === "FR" ? (
          <>
            <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#c8a050", textTransform: "uppercase", marginBottom: "10px" }}>
              Régime des Impatriés · Article 155 B CGI
            </div>
            <h1 style={{ margin: 0, fontSize: "26px", fontWeight: "normal", letterSpacing: "1px", color: "#f0ebe0" }}>
              Tax Refund Calculator
            </h1>
            <p style={{ margin: "6px 0 0", color: "#8a8070", fontSize: "13px" }}>
              France · Full 8-year regime window · Per-year salary · Official barème
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#c8a050", textTransform: "uppercase", marginBottom: "10px" }}>
              30% Ruling · Belastingdienst
            </div>
            <h1 style={{ margin: 0, fontSize: "26px", fontWeight: "normal", letterSpacing: "1px", color: "#f0ebe0" }}>
              Tax Savings Calculator
            </h1>
            <p style={{ margin: "6px 0 0", color: "#8a8070", fontSize: "13px" }}>
              Netherlands · 5-year ruling window · Per-year salary · Official Box 1 rates
            </p>
          </>
        )}
      </div>

      <div style={{ padding: isMobile ? "16px 12px" : "28px 40px", maxWidth: "980px", margin: "0 auto" }}>

        {/* Settings row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr 1fr", gap: "14px", marginBottom: "28px", alignItems: "start" }}>

          {/* Arrival year — shared structure, country-specific label */}
          <div style={{ background: "#12121c", border: "1px solid rgba(200,160,80,0.3)", borderRadius: "8px", padding: "18px 20px", minWidth: "180px" }}>
            <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
              {country === "FR" ? "Year Arrived in France" : "Year Arrived in Netherlands"}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={() => { const y = Math.max(arrivalMin, arrivalYear - 1); setArrivalYear(y); setArrivalDraft(String(y)); }}
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
              <button onClick={() => { const y = Math.min(ARRIVAL_MAX_YEAR, arrivalYear + 1); setArrivalYear(y); setArrivalDraft(String(y)); }}
                style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#c8a050", width: "28px", height: "28px", borderRadius: "4px", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>+</button>
            </div>
            <div style={{ fontSize: "10px", color: "#5a5560", marginTop: "8px" }}>
              {country === "FR" ? "Regime" : "Ruling"} ends: Dec 31, {regimeEndYear - 1}
            </div>
          </div>

          {country === "FR" ? (
            <>
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
            </>
          ) : (
            <>
              {/* NL Profile */}
              <div style={{ background: "#12121c", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "18px 20px" }}>
                <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
                  Profile
                </label>
                <select
                  value={nlProfile}
                  onChange={e => setNlProfile(e.target.value)}
                  style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#e8e4dc", padding: "8px 12px", borderRadius: "4px", width: "100%", fontSize: "13px" }}
                >
                  <option value="standard">Standard</option>
                  <option value="msc30">Under-30 with MSc</option>
                </select>
                <div style={{ fontSize: "10px", color: "#5a5560", marginTop: "8px", lineHeight: 1.5 }}>
                  Min salary threshold: {formatEur(getNLMinSalary(CURRENT_YEAR, nlProfile))}
                </div>
              </div>

              {/* NL Ruling details */}
              <div style={{ background: "#12121c", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "18px 20px" }}>
                <label style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a050", textTransform: "uppercase", display: "block", marginBottom: "10px" }}>
                  Ruling Details
                </label>
                <div style={{ fontSize: "12px", color: "#e8e4dc", lineHeight: 1.8 }}>
                  {arrivalYear < 2024 ? (
                    <div>
                      <div>Ruling: <strong style={{ color: "#c8a050" }}>30%</strong> for all years</div>
                      <div style={{ fontSize: "11px", color: "#5a5560" }}>Arrived before 2024 — grandfathered at 30%</div>
                    </div>
                  ) : (
                    <div>
                      <div>2024–2026: <strong style={{ color: "#c8a050" }}>30%</strong></div>
                      <div>2027+: <strong style={{ color: "#c8a050" }}>27%</strong></div>
                      <div style={{ fontSize: "11px", color: "#5a5560", marginTop: "4px" }}>Transitional rules (Belastingplan 2024)</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Totals banner */}
        <div style={{
          background: "linear-gradient(135deg, rgba(200,160,80,0.10), rgba(200,160,80,0.02))",
          border: "1px solid rgba(200,160,80,0.28)",
          borderRadius: "10px", padding: isMobile ? "16px 14px" : "22px 28px", marginBottom: "28px", gap: isMobile ? "14px" : "0",
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1px 1fr 1px 1fr",
          alignItems: "center",
        }}>
          {(country === "FR" ? [
            { title: "Retroactive Refund", value: totalRefund, sub: refundableRows.length ? `${refundableRows.map(r => r.year).join(" + ")} · Claim now` : "No refundable years", color: "#f0ebe0" },
            null,
            { title: "Forward Savings", value: totalForward, sub: `${[...currentRows, ...futureRows].length} years remaining`, color: "#8a8aaa" },
            null,
            { title: "Total Benefit", value: grandTotal, sub: `Over ${rows.length} years of the regime`, color: "#c8a050" },
          ] : [
            { title: "Past Savings", value: totalPast, sub: pastRows.length ? `${pastRows.map(r => r.year).join(" + ")} · Already realized` : "No past years", color: "#f0ebe0" },
            null,
            { title: "Current + Future", value: totalForward, sub: `${[...currentRows, ...futureRows].length} years remaining`, color: "#8a8aaa" },
            null,
            { title: "Total Benefit", value: grandTotal, sub: `Over ${rows.length} years of the ruling`, color: "#c8a050" },
          ]).map((item, i) => item === null
            ? (isMobile ? null : <div key={i} style={{ width: "1px", background: "#2a2a3e", alignSelf: "stretch" }} />)
            : (
              <div key={i} style={{ padding: isMobile ? "0" : "0 20px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#6a6560", textTransform: "uppercase", marginBottom: "6px" }}>{item.title}</div>
                <div style={{ fontSize: isMobile ? "22px" : "30px", color: item.color, letterSpacing: "-1px" }}>{formatEur(item.value)}</div>
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

          {/* Table — desktop grid or mobile cards */}
          {isMobile ? (
            /* Mobile: one card per year */
            <div style={{ border: "1px solid #1e1e30", borderRadius: "8px", overflow: "hidden" }}>
              {rows.map((row, ri) => {
                const st = STATUS_STYLES[row.status];
                const isExpired = row.status === "expired";
                return (
                  <div key={row.year} style={{
                    borderBottom: ri < rows.length - 1 ? "1px solid #14141e" : "none",
                    background: st.rowBg,
                    opacity: isExpired ? 0.5 : 1,
                    padding: "14px 14px",
                  }}>
                    {/* Card header: year + status */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div>
                        <span style={{ color: "#f0ebe0", fontWeight: "bold", fontSize: "16px" }}>{row.year}</span>
                        {row.estimated && <span style={{ fontSize: "9px", color: "#4a4a6a", marginLeft: "6px" }}>est.</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-end" }}>
                        <span style={{ fontSize: "9px", letterSpacing: "1px", padding: "2px 7px", borderRadius: "20px", background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
                          {st.badge}
                        </span>
                        {row.status === "refundable" && (
                          <span style={{ fontSize: "9px", color: "#c8a050" }}>⏰ {getDeadline(row.year)}</span>
                        )}
                      </div>
                    </div>
                    {/* Salary slider */}
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Gross Salary</div>
                      <SalaryCell value={salaries[row.year] ?? 80000} onChange={val => updateSalary(row.year, val)} />
                    </div>
                    {/* Data grid 2-col */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                      {(country === "FR" ? [
                        { label: "Exempt", value: formatEur(row.exemption), color: "#c8a050", sub: row.cappedByGlobal ? "⚠ 50% cap" : null },
                        { label: "Taxable Income", value: formatEur(row.taxableWithRegime), color: "#8a8aff", sub: `of ${formatEur(row.net)}` },
                        { label: "Tax without", value: formatEur(row.taxWithout), color: "#6a6070", sub: null },
                        { label: "Tax with", value: formatEur(row.taxWith), color: "#e8e4dc", sub: null },
                        { label: "Net Post-Tax", value: formatEur(row.netPostTax), color: "#a0d0a0", sub: null },
                      ] : [
                        { label: "Exempt", value: formatEur(row.exemption), color: "#c8a050", sub: `${row.rulingPct}% ruling${row.wntCapApplied ? " · ⚠ WNT cap" : ""}` },
                        { label: "Taxable Income", value: formatEur(row.taxable), color: "#8a8aff", sub: row.belowMinSalary ? "⚠ Below min salary" : null },
                        { label: "Tax without", value: formatEur(row.taxWithout), color: "#6a6070", sub: null },
                        { label: "Tax with", value: formatEur(row.taxWith), color: "#e8e4dc", sub: null },
                        { label: "Net Post-Tax", value: formatEur(row.netPostTax), color: "#a0d0a0", sub: null },
                      ]).map(({ label, value, color, sub }) => (
                        <div key={label}>
                          <div style={{ fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>{label}</div>
                          <div style={{ fontSize: "13px", color, fontFamily: "monospace" }}>{value}</div>
                          {sub && <div style={{ fontSize: "9px", color: "#5a5560", marginTop: "1px" }}>{sub}</div>}
                        </div>
                      ))}
                    </div>
                    {/* Saving */}
                    {!isExpired && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "uppercase" }}>Saving</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "#c8a050", fontWeight: "bold", fontSize: "16px" }}>{formatEur(row.saving)}</div>
                          <div style={{ fontSize: "10px", color: "#5a5560" }}>{row.effWithout.toFixed(1)}% → {row.effWith.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Footer totals */}
              <div style={{ padding: "14px", background: "#12121c", borderTop: "2px solid #2a2a3e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "uppercase" }}>{country === "FR" ? "Refundable" : "Past savings"}</div>
                  <div style={{ color: "#f0ebe0", fontSize: "14px", fontFamily: "monospace" }}>{formatEur(country === "FR" ? totalRefund : totalPast)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "#5a5560", letterSpacing: "1px", textTransform: "uppercase" }}>Grand Total</div>
                  <div style={{ color: "#c8a050", fontSize: "20px", fontFamily: "monospace" }}>{formatEur(grandTotal)}</div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop: traditional grid table */
            <div>
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
                gap: "0 8px",
                padding: "8px 14px",
                background: "#0d0d18",
                borderRadius: "8px 8px 0 0",
                border: "1px solid #1e1e30",
                borderBottom: "none",
              }}>
                {(country === "FR" ? [
                  { label: "Year", tip: "The income year. The impatriate regime applies from your year of arrival for up to 8 calendar years (art. 155 B CGI)." },
                  { label: "Status", tip: "REFUNDABLE: you can file an amended return to recover overpaid tax. APPLY NOW: file when declaring this year's income. FUTURE: upcoming years where the regime will apply. EXPIRED: beyond the 2-year claim window — cannot be recovered." },
                  { label: "Gross Salary", tip: "Your gross annual salary (brut), assumed to be net of social charges (cotisations sociales). Click any value to adjust it with a slider or by typing." },
                  { label: "Exempt", tip: "The prime d'impatriation: the portion of your salary exempt from income tax under the regime. Flat-rate = 30% of gross salary (BOFiP BOI-RSA-GEO-40-10-20 §90). Capped at 50% of gross (art. 155 B I CGI)." },
                  { label: "Taxable Income", tip: "Your net taxable income after applying the impatriate exemption and the 10% frais professionnels deduction (art. 83 CGI). This is the base on which your income tax is actually computed under the regime." },
                  { label: "Tax without", tip: "Estimated income tax without the impatriate regime, computed on your net salary after the 10% frais professionnels deduction only, using the official progressive barème (art. 197 CGI) for this income year." },
                  { label: "Tax with", tip: "Estimated income tax with the impatriate regime applied, computed on the reduced taxable base (after exemption). The difference between this and 'Tax without' is your annual saving." },
                  { label: "Net Post-Tax", tip: "Your estimated annual take-home pay after income tax: Gross salary minus Tax with regime. Does not deduct social charges (CSG/CRDS)." },
                  { label: "Saving", tip: "Annual tax saving = Tax without regime − Tax with regime. The percentage shown is your effective tax rate (tax ÷ gross salary) shifting from the standard rate to the impatriate rate." },
                ] : [
                  { label: "Year", tip: "The income year. The 30% ruling applies from your year of arrival for up to 5 calendar years." },
                  { label: "Status", tip: "PAST: tax year already completed. APPLY NOW: current tax year. FUTURE: upcoming years where the ruling will apply." },
                  { label: "Gross Salary", tip: "Your gross annual salary including 8% holiday allowance (vakantiegeld). This is your total fiscal jaarloon as shown on your jaaropgave. Click any value to adjust it with a slider or by typing." },
                  { label: "Exempt", tip: "The 30% ruling exemption: the tax-free portion of your salary. Applied to gross up to the WNT salary cap (Wet normering topinkomens)." },
                  { label: "Taxable Income", tip: "Your taxable income after applying the 30% ruling exemption (gross minus exempt amount). This is the base for Box 1 income tax + volksverzekeringen." },
                  { label: "Tax without", tip: "Estimated Box 1 tax without the 30% ruling, on your full gross salary, minus heffingskortingen (algemene heffingskorting + arbeidskorting)." },
                  { label: "Tax with", tip: "Estimated Box 1 tax with the 30% ruling applied, on the reduced taxable base, minus heffingskortingen." },
                  { label: "Net Post-Tax", tip: "Your estimated annual take-home pay after income tax: Gross salary minus Tax with ruling. Does not deduct social insurance contributions separately." },
                  { label: "Saving", tip: "Annual tax saving = Tax without ruling − Tax with ruling. The percentage shown is your effective tax rate shifting from the standard rate to the ruling rate." },
                ]).map(({ label, tip }, i) => (
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
                        gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
                        gap: "0 8px",
                        padding: "12px 14px",
                        alignItems: "center",
                      }}>
                        {/* Year */}
                        <div>
                          <Tooltip text={country === "FR"
                            ? `Income year ${row.year}${row.estimated ? " (estimated — using nearest known barème as proxy)" : ""}. Tax declared in spring ${row.year + 1}. Barème: ${row.estimated ? "proxy from nearest known year" : `official LFI ${row.year + 1}`}.`
                            : `Income year ${row.year}${row.estimated ? " (estimated — using nearest known brackets)" : ""}. Box 1 rates: ${row.estimated ? "estimated from nearest known year" : "official"}.`
                          }>
                            <div style={{ color: "#f0ebe0", fontWeight: "bold", fontSize: "15px", display: "inline-block", cursor: "help" }}>{row.year}</div>
                          </Tooltip>
                          {row.estimated && <div style={{ fontSize: "9px", color: "#4a4a6a" }}>est.</div>}
                        </div>

                        {/* Status */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <Tooltip text={country === "FR"
                            ? (row.status === "refundable" ? `You can file a réclamation contentieuse (amended return) for ${row.year} income before ${getDeadline(row.year)}. Deadline = Dec 31 of the 2nd year after assessment (income year + 1 + 2). Source: impots.gouv.fr/particulier/delais-de-reclamation.`
                              : row.status === "current" ? `Declare the impatriate exemption on your ${row.year} income tax return (filed spring ${row.year + 1}). Use the "autres renseignements" section of form 2042.`
                                : row.status === "future" ? `Upcoming year within your 8-year regime window. The exemption will apply automatically if you remain with your employer and are tax-resident in France.`
                                  : `This year is outside the 2-year amendment window (délai de réclamation). Tax paid for ${row.year} cannot be recovered.`)
                            : (row.status === "past" ? `Tax year ${row.year} has been completed.`
                              : row.status === "current" ? `Current tax year. Apply the 30% ruling on your ${row.year} income tax return.`
                                : `Upcoming year within your 5-year ruling window.`)
                          }>
                            <span style={{ fontSize: "9px", letterSpacing: "1px", padding: "2px 7px", borderRadius: "20px", background: st.bg, color: st.color, whiteSpace: "nowrap", display: "inline-block", cursor: "help" }}>
                              {st.badge}
                            </span>
                          </Tooltip>
                          {row.status === "refundable" && (
                            <span style={{ fontSize: "9px", color: "#c8a050" }}>⏰ {getDeadline(row.year)}</span>
                          )}
                        </div>

                        {/* Salary cell — inline slider */}
                        <div style={{ textAlign: "right" }}>
                          <SalaryCell
                            value={salaries[row.year] ?? 80000}
                            onChange={val => updateSalary(row.year, val)}
                          />
                        </div>

                        {/* Exempt */}
                        {country === "FR" ? (
                          <div style={{ textAlign: "right" }}>
                            <Tooltip text={`Prime d'impatriation (forfait ${exemptPct}%): ${exemptPct}% × ${formatEur(row.gross)} = ${formatEur(row.rawExemption)}${row.cappedByGlobal ? ` → capped at 50% max = ${formatEur(row.exemption)}` : ""}. Source: BOFiP BOI-RSA-GEO-40-10-20 §90.`}>
                              <div style={{ color: "#c8a050", fontSize: "13px", display: "inline-block" }}>{formatEur(row.exemption)}</div>
                            </Tooltip>
                            {row.cappedByGlobal && (
                              <div style={{ fontSize: "9px", color: "#a06030", marginTop: "2px" }}>⚠ 50% cap applied</div>
                            )}
                          </div>
                        ) : (
                          <div style={{ textAlign: "right" }}>
                            <Tooltip text={`${row.rulingPct}% ruling exemption: ${row.rulingPct}% × ${formatEur(row.cappedGross)} = ${formatEur(row.exemption)}${row.wntCapApplied ? ` (WNT cap applied: gross ${formatEur(row.gross)} capped at ${formatEur(row.wntCap)})` : ""}.`}>
                              <div style={{ color: "#c8a050", fontSize: "13px", display: "inline-block" }}>{formatEur(row.exemption)}</div>
                            </Tooltip>
                            <div style={{ fontSize: "9px", color: "#5a5560", marginTop: "2px" }}>{row.rulingPct}% ruling</div>
                            {row.wntCapApplied && (
                              <div style={{ fontSize: "9px", color: "#a06030", marginTop: "1px" }}>⚠ WNT cap</div>
                            )}
                          </div>
                        )}

                        {/* Taxable */}
                        {country === "FR" ? (
                          <div style={{ textAlign: "right" }}>
                            <Tooltip text={`Step 1 — 10% frais professionnels deduction (art. 83 CGI): ${formatEur(row.gross)} × 90% = ${formatEur(row.net)} (net imposable). Step 2 — Deduct impatriate exemption: ${formatEur(row.net)} − ${formatEur(row.exemption)} = ${formatEur(row.taxableWithRegime)}. This is the base taxed at the progressive barème.`}>
                              <div style={{ color: "#8a8aff", fontSize: "13px", display: "inline-block" }}>{formatEur(row.taxableWithRegime)}</div>
                            </Tooltip>
                            <div style={{ fontSize: "10px", color: "#4a4a6a", marginTop: "2px" }}>of {formatEur(row.net)}</div>
                          </div>
                        ) : (
                          <div style={{ textAlign: "right" }}>
                            <Tooltip text={`Taxable income: ${formatEur(row.gross)} − ${formatEur(row.exemption)} = ${formatEur(row.taxable)}.${row.belowMinSalary ? ` ⚠ Below minimum salary threshold of ${formatEur(row.minSalary)}.` : ""}`}>
                              <div style={{ color: "#8a8aff", fontSize: "13px", display: "inline-block" }}>{formatEur(row.taxable)}</div>
                            </Tooltip>
                            {row.belowMinSalary && (
                              <div style={{ fontSize: "9px", color: "#a06030", marginTop: "2px" }}>⚠ Below min salary</div>
                            )}
                          </div>
                        )}

                        {/* Tax without */}
                        <Tooltip text={country === "FR"
                          ? `Progressive barème (art. 197 CGI) applied to ${formatEur(row.net)} net imposable (gross minus 10% deduction). Divided by ${parts} part(s) for quotient familial, taxed by bracket, then multiplied back. No impatriate exemption applied here.`
                          : `Box 1 tax on ${formatEur(row.gross)}: ${formatEur(row.taxBeforeCreditsWithout)} before credits. Minus algemene heffingskorting (${formatEur(row.algKortingWithout)}) + arbeidskorting (${formatEur(row.arbKortingWithout)}).`
                        }>
                          <div style={{ textAlign: "right", color: "#6a6070", fontSize: "13px", cursor: "help" }}>{formatEur(row.taxWithout)}</div>
                        </Tooltip>

                        {/* Tax with */}
                        <Tooltip text={country === "FR"
                          ? `Progressive barème (art. 197 CGI) applied to the reduced taxable base of ${formatEur(row.taxableWithRegime)} (after impatriate exemption). Divided by ${parts} part(s), taxed by bracket, then multiplied back.`
                          : `Box 1 tax on ${formatEur(row.taxable)}: ${formatEur(row.taxBeforeCreditsWith)} before credits. Minus algemene heffingskorting (${formatEur(row.algKortingWith)}) + arbeidskorting (${formatEur(row.arbKortingWith)}).`
                        }>
                          <div style={{ textAlign: "right", color: "#e8e4dc", fontSize: "13px", cursor: "help" }}>{formatEur(row.taxWith)}</div>
                        </Tooltip>

                        {/* Net Post-Tax */}
                        <Tooltip text={`Take-home pay: ${formatEur(row.gross)} gross − ${formatEur(row.taxWith)} tax = ${formatEur(row.netPostTax)}.`}>
                          <div style={{ textAlign: "right", color: "#a0d0a0", fontSize: "13px", cursor: "help" }}>{formatEur(row.netPostTax)}</div>
                        </Tooltip>

                        {/* Saving */}
                        <div style={{ textAlign: "right" }}>
                          {isExpired ? (
                            <span style={{ fontSize: "11px", color: "#6a4040" }}>Expired</span>
                          ) : (
                            <>
                              <Tooltip text={`Annual saving = Tax without (${formatEur(row.taxWithout)}) − Tax with ${country === "FR" ? "regime" : "ruling"} (${formatEur(row.taxWith)}) = ${formatEur(row.saving)}. Effective rate: ${row.effWithout.toFixed(2)}% → ${row.effWith.toFixed(2)}% (tax ÷ gross salary).`}>
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
                  gridTemplateColumns: "60px 130px 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
                  gap: "0 8px",
                  padding: "13px 14px",
                  background: "#12121c",
                  borderTop: "2px solid #2a2a3e",
                  alignItems: "center",
                }}>
                  <div style={{ gridColumn: "1 / 8", fontSize: "10px", color: "#6a6560", letterSpacing: "1px", textTransform: "uppercase" }}>
                    Total · {rows.filter(r => r.status !== "expired").length} active years
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "#5a5560" }}>{country === "FR" ? "Refundable" : "Past savings"}</div>
                    <div style={{ color: "#f0ebe0", fontSize: "13px" }}>{formatEur(country === "FR" ? totalRefund : totalPast)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "#5a5560" }}>Grand total</div>
                    <div style={{ color: "#c8a050", fontSize: "18px" }}>{formatEur(grandTotal)}</div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {expiredRows.length > 0 && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#6a4040", padding: "0 4px" }}>
              ✕ {expiredRows.length} year{expiredRows.length > 1 ? "s" : ""} ({expiredRows.map(r => r.year).join(", ")}) are beyond the 2-year claim window and cannot be recovered.
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div style={{ background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: "8px", padding: "16px 20px", fontSize: "11px", color: "#5a5560", lineHeight: "1.7" }}>
          <div style={{ color: "#8a8070", marginBottom: "5px", letterSpacing: "2px", textTransform: "uppercase", fontSize: "10px" }}>⚠ Important Caveats</div>
          {country === "FR"
            ? <>Indicative estimates using official French barèmes (2021–2025 income years exact; earlier/future years use nearest known scale, marked "est."). Barèmes source: art. 197 CGI / Lois de finances / Légifrance. The 2025-income barème (LFI 2026, promulguée 19 fév. 2026, +0.9%) is official. Déduction forfaitaire 10% caps are indexed per year (BOI-BAREME-000035). The flat-rate 30% prime exemption is calculated on gross salary before the 10% deduction (BOFiP BOI-RSA-GEO-40-10-20 §90). The 50% global ceiling on the exempt amount is enforced per art. 155 B I CGI / BOFiP §290. Figures exclude social charges (CSG/CRDS ~17.2%), tax credits, and treaty provisions. The "rémunération de référence" floor (salary for analogous role in same company) is not independently verifiable here and is approximated conservatively. <strong style={{ color: "#8a8070" }}>Consult a qualified avocat fiscaliste before filing any amended return.</strong></>
            : <>Indicative estimates using official Dutch Box 1 brackets (2024–2026 exact; other years use nearest known scale, marked "est."). Sources: Belastingdienst, Belastingplan 2024/2025. Box 1 rates include income tax (inkomstenbelasting) and social insurance contributions (volksverzekeringen). Tax credits include algemene heffingskorting and arbeidskorting, computed per official piecewise formulas. The 30% ruling exemption is subject to the WNT salary cap (Wet normering topinkomens). The minimum salary threshold must be met after applying the ruling. The 27% rate from 2027 for post-2023 arrivals reflects Belastingplan 2024 transitional rules. Figures do not include local taxes, Box 2/3 income, or toeslagen. <strong style={{ color: "#8a8070" }}>Consult a belastingadviseur before making tax decisions.</strong></>
          }
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
