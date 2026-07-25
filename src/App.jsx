import { useState } from "react";
import { MapPin, Check, ArrowLeft, ChevronRight, Utensils, Wine, Building2, Compass, Sparkles } from "lucide-react";

const STEPS = ["destination", "details", "explore", "itinerary", "invites"];
const STEP_LABELS = { destination: "Destination", details: "Weekend", explore: "Explore", itinerary: "Plan", invites: "Invite" };
const TABS = ["dining", "bars", "stay", "activities"];
const TAB_LABELS = { dining: "Dining", bars: "Bars", stay: "Stay", activities: "Activities" };
const TAB_CLAUDE = { dining: "restaurants", bars: "bars", stay: "hotels", activities: "attractions" };
const TAB_ICONS = { dining: Utensils, bars: Wine, stay: Building2, activities: Compass };
const PRICE = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
const STARS_OPT = [2, 3, 4, 5];

function Spinner() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.9rem", padding:"3rem 1rem" }}>
      <div className="g-spin" />
      <p style={{ fontSize:"0.72rem", fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--muted)" }}>Finding the right spots</p>
    </div>
  );
}

function ProgressBar({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="pb-wrap">
      <div className="pb-line">
        <div className="pb-line-fill" style={{ width:`${(idx / (STEPS.length - 1)) * 100}%` }} />
      </div>
      <div className="pb-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`pbs ${i < idx ? "pbs-done" : ""} ${s === current ? "pbs-active" : ""}`}>
            <div className="pbs-dot">
              {i < idx ? <Check size={10} strokeWidth={3} color="#fff" /> : <span>{i+1}</span>}
            </div>
            <span className="pbs-label">{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function callClaude(prompt) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: "You are a bachelorette weekend planning expert. Respond with valid JSON only — no markdown, no backticks.",
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await resp.json();
  const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}


export default function App() {
  const [step, setStep] = useState("destination");
  const [city, setCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [details, setDetails] = useState({ brideName:"", date:"", groupSize:"", budget:"moderate", notes:"" });
  const [explore, setExplore] = useState({ dining:[], bars:[], stay:[], activities:[] });
  const [activeTab, setActiveTab] = useState("dining");
  const [loadingTab, setLoadingTab] = useState(null);
  const [starFilter, setStarFilter] = useState([]);
  const [priceFilter, setPriceFilter] = useState([]);
  const [selected, setSelected] = useState({ dining:[], bars:[], stay:[], activities:[] });
  const [itinerary, setItinerary] = useState(null);
  const [loadingItin, setLoadingItin] = useState(false);
  const [emails, setEmails] = useState("");
  const [emailPreview, setEmailPreview] = useState(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sent, setSent] = useState(false);

  async function fetchTab(tab, targetCity) {
    setLoadingTab(tab);
    const cat = TAB_CLAUDE[tab];
    try {
      const result = await callClaude(`Give me 6 real ${cat} recommendations for a bachelorette weekend in ${targetCity||city}. Return a JSON array. Each object: name, description (1-2 sentences), priceRange (1-4), ${tab==="stay"?"starRating (2-5),":"rating (1.0-5.0),"} neighborhood, mustTry. Return only the JSON array.`);
      setExplore(prev => ({ ...prev, [tab]: Array.isArray(result) ? result : [] }));
    } catch(e) { setExplore(prev => ({ ...prev, [tab]: [] })); }
    setLoadingTab(null);
  }

  async function handleCitySubmit() {
    if (!cityInput.trim()) return;
    const c = cityInput.trim();
    setCity(c); setStep("details");
  }

  async function handleDetailsSubmit() {
    setStep("explore");
    await fetchTab("dining", city);
  }

  async function handleTabChange(tab) {
    setActiveTab(tab);
    if (!explore[tab]?.length) await fetchTab(tab);
  }

  function toggleSelect(tab, item) {
    setSelected(prev => {
      const arr = prev[tab];
      const exists = arr.find(i => i.name===item.name);
      return { ...prev, [tab]: exists ? arr.filter(i => i.name!==item.name) : [...arr, item] };
    });
  }

  function isSelected(tab, item) { return selected[tab].some(i => i.name===item.name); }

  async function buildItinerary() {
    setLoadingItin(true); setStep("itinerary");
    const picks = Object.entries(selected).flatMap(([cat,items]) => items.map(i => `${cat}: ${i.name}`));
    try {
      const result = await callClaude(`Build a bachelorette weekend itinerary for ${details.brideName||"the bride"} in ${city}. Date: ${details.date||"TBD"}. Group: ${details.groupSize||"unknown"}. Budget: ${details.budget}. Spots: ${picks.join(", ")||"suggest for city"}. Notes: ${details.notes||"none"}. Return JSON: { title, days: [{ dayLabel, timeBlocks: [{ time, activity, venue, notes, emoji }] }], tips: [3 strings] }`);
      setItinerary(result);
    } catch(e) { setItinerary({ title:`${city} Weekend`, days:[], tips:[] }); }
    setLoadingItin(false);
  }

  async function draftEmail() {
    setLoadingEmail(true);
    const list = emails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    try {
      const result = await callClaude(`Write a bachelorette weekend invite for ${details.brideName||"the bride"} in ${city}. Date: ${details.date||"TBD"}. Guests: ${details.groupSize}. Highlights: ${itinerary?.days?.flatMap(d=>d.timeBlocks?.map(t=>t.venue)).filter(Boolean).slice(0,5).join(", ")||city}. Warm, specific, no filler. Return JSON: { subject, body (HTML) }`);
      setEmailPreview({ ...result, recipients: list });
    } catch(e) { setEmailPreview({ subject:"Weekend plans — say yes.", body:"<p>You're going to want to be there.</p>", recipients: list }); }
    setLoadingEmail(false);
  }

  const filtered = (tab) => {
    let items = explore[tab]||[];
    if (tab==="stay" && starFilter.length) items = items.filter(i => starFilter.includes(i.starRating));
    if (priceFilter.length) items = items.filter(i => priceFilter.includes(i.priceRange));
    return items;
  };
  const totalSelected = Object.values(selected).flat().length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        :root {
          --bg:       #FFFFFF;
          --surface:  #FAFAFA;
          --ink:      #0D0D0D;
          --muted:    #9399A6;
          --border:   #F0F0F5;
          --pink:     #FF3CAC;
          --violet:   #7C3AED;
          --peach:    #FF7B54;
          --yellow:   #FFD23F;
          --mint:     #00C9A7;
          --grad:     linear-gradient(135deg, #FF3CAC 0%, #7C3AED 100%);
          --grad-warm:linear-gradient(135deg, #FF7B54 0%, #FF3CAC 100%);
          --shadow-sm: 0 2px 8px rgba(13,13,13,0.06);
          --shadow-md: 0 8px 28px rgba(13,13,13,0.09);
          --shadow-lg: 0 16px 48px rgba(13,13,13,0.12);
        }

        body { background:var(--bg); font-family:'Plus Jakarta Sans',system-ui,sans-serif; color:var(--ink); min-height:100vh; -webkit-font-smoothing:antialiased; }
        .app { min-height:100vh; display:flex; flex-direction:column; }

        /* ── HEADER ── */
        .header {
          padding: 2.5rem 1.5rem 1.25rem;
          text-align: center;
          background: var(--bg);
          position: relative;
        }
        .header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 5%; right: 5%;
          height: 1px;
          background: var(--border);
        }
        .header-tag {
          display: inline-flex; align-items: center; gap: 0.35rem;
          background: linear-gradient(135deg, rgba(255,60,172,0.08), rgba(124,58,237,0.08));
          border: 1px solid rgba(124,58,237,0.15);
          border-radius: 50px;
          padding: 0.3rem 0.85rem;
          font-size: 0.68rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--violet);
          margin-bottom: 0.9rem;
        }
        .wordmark {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-weight: 800;
          font-size: clamp(3.2rem, 9vw, 5.5rem);
          line-height: 0.95;
          letter-spacing: -0.03em;
          background: var(--grad);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.5rem;
        }
        .header-sub {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--muted);
          letter-spacing: 0.04em;
        }

        /* ── PROGRESS ── */
        .pb-wrap { padding:1.25rem 1.5rem 1rem; background:var(--bg); position:relative; }
        .pb-line { position:absolute; top:calc(1.25rem + 13px); left:calc(1.5rem + 40px); right:calc(1.5rem + 40px); height:2px; background:var(--border); border-radius:2px; }
        .pb-line-fill { height:100%; background:var(--grad); border-radius:2px; transition:width 0.4s ease; }
        .pb-steps { display:flex; justify-content:space-between; position:relative; z-index:1; }
        .pbs { display:flex; flex-direction:column; align-items:center; gap:0.35rem; }
        .pbs-dot {
          width:28px; height:28px; border-radius:50%;
          background:var(--border);
          display:flex; align-items:center; justify-content:center;
          font-size:0.72rem; font-weight:700; color:var(--muted);
          transition:all 0.25s;
        }
        .pbs-done .pbs-dot { background:var(--grad); }
        .pbs-active .pbs-dot { background:var(--grad); box-shadow:0 0 0 4px rgba(124,58,237,0.15); }
        .pbs-label { font-size:0.6rem; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); }
        .pbs-active .pbs-label { color:var(--violet); }
        .pbs-done .pbs-label { color:var(--ink); }

        /* ── MAIN ── */
        .main { flex:1; padding:2rem 1.25rem; max-width:860px; margin:0 auto; width:100%; }

        /* ── DESTINATION HERO ── */
        .hero { padding:2rem 0.5rem; }
        .hero-headline {
          font-family:'Bricolage Grotesque',sans-serif;
          font-weight:800;
          font-size:clamp(2.2rem,6vw,3.5rem);
          line-height:1.05;
          letter-spacing:-0.025em;
          color:var(--ink);
          margin-bottom:0.9rem;
        }
        .hero-headline span { background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .hero-sub { font-size:1rem; line-height:1.6; color:var(--muted); margin-bottom:2rem; max-width:420px; }
        .city-input-wrap { display:flex; gap:0.5rem; max-width:460px; }
        .city-input-wrap .input { flex:1; font-size:1rem; padding:0.85rem 1.1rem; }

        /* ── POPULAR DESTINATIONS ── */
        .dest-label { font-size:0.68rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); margin-bottom:0.7rem; margin-top:1.75rem; }
        .dest-chips { display:flex; gap:0.5rem; flex-wrap:wrap; }
        .dest-chip {
          padding:0.4rem 0.9rem; border-radius:50px;
          border:1.5px solid var(--border);
          font-size:0.8rem; font-weight:600;
          color:var(--ink); background:var(--bg);
          cursor:pointer; transition:all 0.15s;
          font-family:'Plus Jakarta Sans',sans-serif;
        }
        .dest-chip:hover { border-color:var(--violet); color:var(--violet); background:rgba(124,58,237,0.04); }

        /* ── CARD ── */
        .card {
          background:var(--bg);
          border:1.5px solid var(--border);
          border-radius:20px;
          padding:1.75rem;
          margin-bottom:1.25rem;
          box-shadow:var(--shadow-sm);
        }
        .card-title {
          font-family:'Bricolage Grotesque',sans-serif;
          font-weight:700;
          font-size:1.6rem;
          letter-spacing:-0.02em;
          color:var(--ink);
          margin-bottom:0.3rem;
          line-height:1.15;
        }
        .card-sub { font-size:0.88rem; color:var(--muted); margin-bottom:1.6rem; line-height:1.6; }

        /* ── FORM ── */
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; }
        .ig { margin-bottom:0.85rem; }
        .il { display:block; font-size:0.7rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:0.4rem; }
        .input {
          width:100%; padding:0.72rem 1rem;
          border:1.5px solid var(--border);
          border-radius:12px;
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.92rem; font-weight:500;
          background:var(--bg); color:var(--ink);
          outline:none;
          transition:border-color 0.18s, box-shadow 0.18s;
          appearance:none;
        }
        .input:focus { border-color:var(--violet); box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
        .input::placeholder { color:var(--muted); font-weight:400; opacity:0.7; }
        textarea.input { resize:vertical; min-height:78px; }
        @media(max-width:500px){ .g2 { grid-template-columns:1fr; } }

        /* ── BUTTONS ── */
        .btn {
          display:inline-flex; align-items:center; gap:0.4rem;
          padding:0.7rem 1.5rem; border-radius:50px;
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.82rem; font-weight:700;
          cursor:pointer; border:none;
          transition:all 0.18s; letter-spacing:0.02em;
          white-space:nowrap;
        }
        .btn-grad { background:var(--grad); color:#fff; box-shadow:0 4px 18px rgba(124,58,237,0.28); }
        .btn-grad:hover { transform:translateY(-1px); box-shadow:0 7px 24px rgba(124,58,237,0.36); }
        .btn-warm { background:var(--grad-warm); color:#fff; box-shadow:0 4px 18px rgba(255,60,172,0.25); }
        .btn-warm:hover { transform:translateY(-1px); box-shadow:0 7px 24px rgba(255,60,172,0.35); }
        .btn-outline {
          background:transparent;
          border:1.5px solid var(--border);
          color:var(--ink);
        }
        .btn-outline:hover { border-color:var(--violet); color:var(--violet); }
        .btn-ghost { background:transparent; border:none; color:var(--muted); padding-left:0; }
        .btn-ghost:hover { color:var(--ink); }

        /* ── EXPLORE ── */
        .ex-header { margin-bottom:1.25rem; }
        .ex-eyebrow { font-size:0.68rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; margin-bottom:0.4rem; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .ex-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:1.9rem; letter-spacing:-0.02em; color:var(--ink); line-height:1.1; }
        .ex-title em { font-style:normal; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .ex-sub { font-size:0.85rem; color:var(--muted); margin-top:0.3rem; }

        /* Tabs */
        .tabs { display:flex; gap:0.4rem; margin-bottom:1.1rem; flex-wrap:wrap; }
        .tab {
          display:flex; align-items:center; gap:0.35rem;
          padding:0.46rem 1rem; border-radius:50px;
          border:1.5px solid var(--border);
          background:var(--bg); cursor:pointer;
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.78rem; font-weight:600;
          color:var(--muted);
          transition:all 0.18s;
        }
        .tab:hover:not(.tab-on) { border-color:rgba(124,58,237,0.3); color:var(--violet); }
        .tab.tab-on { background:var(--grad); border-color:transparent; color:#fff; box-shadow:0 4px 14px rgba(124,58,237,0.25); }
        .tab-badge { background:rgba(255,255,255,0.25); border-radius:10px; padding:0 5px; font-size:0.68rem; }

        /* Filters */
        .filters { display:flex; gap:0.5rem; margin-bottom:1.1rem; flex-wrap:wrap; align-items:center; }
        .filter-lbl { font-size:0.68rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); }
        .chip {
          padding:0.26rem 0.7rem; border-radius:20px;
          border:1.5px solid var(--border);
          font-size:0.76rem; font-weight:600; cursor:pointer;
          background:var(--bg); color:var(--muted);
          transition:all 0.15s; font-family:'Plus Jakarta Sans',sans-serif;
        }
        .chip.on { background:var(--yellow); border-color:var(--yellow); color:var(--ink); }

        /* Venue grid */
        .vgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(226px,1fr)); gap:0.85rem; }
        .vcard {
          background:var(--bg);
          border:1.5px solid var(--border);
          border-radius:16px; padding:1.15rem;
          cursor:pointer; transition:all 0.2s;
          position:relative; overflow:hidden;
        }
        .vcard:hover { border-color:rgba(124,58,237,0.25); box-shadow:var(--shadow-md); transform:translateY(-2px); }
        .vcard.von {
          border-color:transparent;
          background:linear-gradient(var(--bg),var(--bg)) padding-box,
                      var(--grad) border-box;
          border:1.5px solid transparent;
          box-shadow:var(--shadow-md);
        }
        .vcheck {
          position:absolute; top:0.85rem; right:0.85rem;
          width:22px; height:22px; border-radius:50%;
          background:var(--grad);
          display:flex; align-items:center; justify-content:center;
        }
        .vname { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:1.05rem; color:var(--ink); margin-bottom:0.2rem; line-height:1.2; letter-spacing:-0.01em; }
        .vhood { font-size:0.7rem; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin-bottom:0.55rem; display:flex; align-items:center; gap:0.2rem; }
        .vdesc { font-size:0.8rem; line-height:1.55; color:var(--muted); margin-bottom:0.65rem; }
        .vmust { font-size:0.72rem; font-weight:600; background:rgba(255,210,63,0.18); border:1px solid rgba(255,210,63,0.4); color:#7A5800; border-radius:8px; padding:0.25rem 0.6rem; margin-bottom:0.65rem; display:inline-block; }
        .vfoot { display:flex; justify-content:space-between; align-items:center; }
        .vprice { font-size:0.78rem; font-weight:700; color:var(--pink); }
        .vstars { font-size:0.7rem; color:var(--yellow); }
        .vbook {
          font-size:0.7rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
          padding:0.26rem 0.7rem; border-radius:20px;
          border:1.5px solid var(--border); color:var(--muted);
          background:transparent; text-decoration:none;
          transition:all 0.15s; font-family:'Plus Jakarta Sans',sans-serif;
        }
        .vbook:hover { border-color:var(--violet); color:var(--violet); }

        /* Action row */
        .arow { display:flex; gap:0.65rem; flex-wrap:wrap; margin-top:1.75rem; align-items:center; }
        .count-badge {
          font-size:0.75rem; font-weight:700;
          background:rgba(124,58,237,0.08);
          color:var(--violet); border-radius:50px;
          padding:0.3rem 0.8rem;
        }

        /* ── ITINERARY ── */
        .itin-hero { margin-bottom:2rem; }
        .itin-eyebrow { font-size:0.68rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; margin-bottom:0.4rem; }
        .itin-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(1.6rem,4vw,2.4rem); letter-spacing:-0.025em; color:var(--ink); line-height:1.1; }
        .day-block { margin-bottom:1.75rem; }
        .day-pill { display:inline-flex; align-items:center; gap:0.4rem; background:var(--ink); color:#fff; border-radius:50px; padding:0.28rem 0.85rem; font-size:0.7rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:1rem; }
        .itin-row { display:flex; gap:0.85rem; padding:0.7rem 0; border-bottom:1px solid var(--border); align-items:flex-start; }
        .itin-time { font-size:0.72rem; font-weight:600; color:var(--muted); min-width:60px; padding-top:2px; font-family:'Plus Jakarta Sans',sans-serif; }
        .itin-dot { width:8px; height:8px; border-radius:50%; background:var(--grad); margin-top:5px; flex-shrink:0; box-shadow:0 0 0 3px rgba(124,58,237,0.15); }
        .itin-content { flex:1; }
        .itin-act { font-weight:700; font-size:0.88rem; color:var(--ink); }
        .itin-venue { font-size:0.78rem; color:var(--violet); font-weight:600; margin-top:0.1rem; }
        .itin-note { font-size:0.76rem; color:var(--muted); margin-top:0.1rem; }
        .tips-card { background:linear-gradient(135deg, rgba(255,60,172,0.04), rgba(124,58,237,0.06)); border:1.5px solid rgba(124,58,237,0.1); border-radius:16px; padding:1.2rem 1.4rem; margin-top:1.5rem; }
        .tips-head { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:1rem; color:var(--ink); margin-bottom:0.7rem; }
        .tip-row { font-size:0.82rem; color:var(--muted); margin-bottom:0.4rem; display:flex; gap:0.5rem; }
        .tip-dot { color:var(--pink); font-weight:800; }

        /* ── INVITES ── */
        .divr { display:flex; align-items:center; gap:0.75rem; margin:1.5rem 0; }
        .divr-line { flex:1; height:1px; background:var(--border); }
        .divr-lbl { font-size:0.68rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
        .email-preview { border:1.5px solid var(--border); border-radius:16px; overflow:hidden; margin-top:1.25rem; box-shadow:var(--shadow-sm); }
        .email-head { background:var(--grad); padding:1rem 1.25rem; }
        .email-subj { color:#fff; font-weight:700; font-size:0.88rem; }
        .email-to { color:rgba(255,255,255,0.6); font-size:0.72rem; margin-top:0.2rem; }
        .email-body { padding:1.25rem; max-height:240px; overflow-y:auto; font-size:0.84rem; line-height:1.7; color:var(--ink); }
        .send-note { font-size:0.7rem; color:var(--muted); }

        /* ── SENT ── */
        .sent-wrap { text-align:center; padding:3rem 1rem; }
        .sent-badge { display:inline-block; background:var(--grad); color:#fff; border-radius:50px; padding:0.3rem 1rem; font-size:0.68rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; margin-bottom:1rem; }
        .sent-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:2.2rem; letter-spacing:-0.025em; color:var(--ink); margin-bottom:0.5rem; }
        .sent-sub { font-size:0.9rem; color:var(--muted); margin-bottom:2rem; line-height:1.6; }

        /* ── SPINNER ── */
        .g-spin {
          width:36px; height:36px; border-radius:50%;
          border:2.5px solid var(--border);
          border-top-color:var(--pink);
          border-right-color:var(--violet);
          animation:spin 0.9s linear infinite;
        }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* ── EMPTY ── */
        .empty { text-align:center; padding:3rem 1rem; }
        .empty p { font-size:0.85rem; color:var(--muted); margin-top:0.5rem; }

        /* ── LOADING WRAP ── */
        .lw { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:5rem 1rem; }

        @media(max-width:600px){
          .main { padding:1.5rem 1rem; }
          .vgrid { grid-template-columns:1fr; }
          .city-input-wrap { flex-direction:column; }
          .pbs-label { display:none; }
        }
      `}</style>

      <div className="app">

        {/* HEADER */}
        <header className="header">
          <div className="header-tag">
            <Sparkles size={10} strokeWidth={2} />
            AI-powered planning
          </div>
          <div className="wordmark">Lorette</div>
          <p className="header-sub">Bachelorette weekends, handled.</p>
        </header>

        <ProgressBar current={step} />

        <main className="main">

          {/* DESTINATION */}
          {step === "destination" && (
            <div className="hero">
              <h1 className="hero-headline">
                Where's the<br /><span>weekend?</span>
              </h1>
              <p className="hero-sub">Drop a city and Lorette finds the dining, stays, and fun — then builds the plan and sends the invites.</p>
              <div className="city-input-wrap">
                <input
                  className="input"
                  placeholder="Nashville, Miami, Austin…"
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleCitySubmit()}
                />
                <button className="btn btn-grad" onClick={handleCitySubmit}>
                  Let's go <ChevronRight size={15} strokeWidth={2.5} />
                </button>
              </div>
              <p className="dest-label">Popular weekends</p>
              <div className="dest-chips">
                {["Nashville","Miami","New Orleans","Scottsdale","Austin","Charleston"].map(c => (
                  <button key={c} className="dest-chip" onClick={() => { setCityInput(c); setCity(c); setStep("details"); }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DETAILS */}
          {step === "details" && (
            <div className="card">
              <p className="card-title">About the weekend</p>
              <p className="card-sub">A few details and Lorette personalizes everything.</p>
              <div className="g2">
                <div className="ig">
                  <label className="il">Bride's name</label>
                  <input className="input" placeholder="e.g. Jess" value={details.brideName} onChange={e => setDetails(p=>({...p,brideName:e.target.value}))} />
                </div>
                <div className="ig">
                  <label className="il">Date</label>
                  <input className="input" type="date" value={details.date} onChange={e => setDetails(p=>({...p,date:e.target.value}))} />
                </div>
                <div className="ig">
                  <label className="il">Guests</label>
                  <input className="input" placeholder="e.g. 10 guests" value={details.groupSize} onChange={e => setDetails(p=>({...p,groupSize:e.target.value}))} />
                </div>
                <div className="ig">
                  <label className="il">Budget</label>
                  <select className="input" value={details.budget} onChange={e => setDetails(p=>({...p,budget:e.target.value}))}>
                    <option value="budget">Keeping it reasonable</option>
                    <option value="moderate">Mid-range</option>
                    <option value="luxe">No ceiling</option>
                  </select>
                </div>
              </div>
              <div className="ig">
                <label className="il">Vibe notes</label>
                <textarea className="input" placeholder="Rooftop bars, no seafood, obsessed with live music…" value={details.notes} onChange={e => setDetails(p=>({...p,notes:e.target.value}))} />
              </div>
              <div className="arow">
                <button className="btn btn-ghost" onClick={() => setStep("destination")}>
                  <ArrowLeft size={14} strokeWidth={2} /> Back
                </button>
                <button className="btn btn-grad" onClick={handleDetailsSubmit}>
                  Explore {city} <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* EXPLORE */}
          {step === "explore" && (
            <div>
              <div className="ex-header">
                <p className="ex-eyebrow">Explore · {city}</p>
                <div className="ex-title">Pick your <em>spots</em></div>
                <p className="ex-sub">Select what you want — your plan builds from these.</p>
              </div>

              <div className="tabs">
                {TABS.map(t => {
                  const Icon = TAB_ICONS[t];
                  return (
                    <button key={t} className={`tab ${activeTab===t?"tab-on":""}`} onClick={()=>handleTabChange(t)}>
                      <Icon size={13} strokeWidth={1.75} />
                      {TAB_LABELS[t]}
                      {selected[t].length>0 && <span className="tab-badge">{selected[t].length}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="filters">
                {activeTab==="stay" && (
                  <>
                    <span className="filter-lbl">Stars</span>
                    {STARS_OPT.map(s => (
                      <button key={s} className={`chip ${starFilter.includes(s)?"on":""}`}
                        onClick={()=>setStarFilter(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])}>
                        {"★".repeat(s)}
                      </button>
                    ))}
                    <div style={{width:"1px",height:"14px",background:"var(--border)"}} />
                  </>
                )}
                <span className="filter-lbl">Price</span>
                {[1,2,3,4].map(p => (
                  <button key={p} className={`chip ${priceFilter.includes(p)?"on":""}`}
                    onClick={()=>setPriceFilter(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p])}>
                    {PRICE[p]}
                  </button>
                ))}
              </div>

              {loadingTab===activeTab ? <Spinner /> : filtered(activeTab).length===0 ? (
                <div className="empty">
                  <p style={{fontSize:"2rem"}}>🔍</p>
                  <p>No results — try adjusting filters.</p>
                </div>
              ) : (
                <div className="vgrid">
                  {filtered(activeTab).map((item,i) => {
                    const sel = isSelected(activeTab,item);
                    const size = details.groupSize?.replace(/\D/g,"")||"6";
                    const date = details.date||new Date().toISOString().split("T")[0];
                    const checkOut = new Date(new Date(date).getTime()+2*86400000).toISOString().split("T")[0];
                    const url = activeTab==="stay"
                      ? `https://www.booking.com/search.html?ss=${encodeURIComponent(item.name+" "+city)}&checkin=${date}&checkout=${checkOut}&group_adults=${size}`
                      : activeTab==="activities"
                      ? `https://www.google.com/search?q=${encodeURIComponent(item.name+" "+city)}`
                      : `https://www.google.com/search?q=${encodeURIComponent(item.name+" "+city+" OpenTable reservation")}`;
                    const stars = Math.round(activeTab==="stay"?(item.starRating||3):(item.rating||4));
                    return (
                      <div key={i} className={`vcard ${sel?"von":""}`} onClick={()=>toggleSelect(activeTab,item)}>
                        {sel && <div className="vcheck"><Check size={11} strokeWidth={3} color="#fff" /></div>}
                        <div className="vname">{item.name}</div>
                        <div className="vhood"><MapPin size={9} strokeWidth={1.75} />{item.neighborhood}</div>
                        <div className="vdesc">{item.description}</div>
                        {item.mustTry && <div className="vmust">✦ {item.mustTry}</div>}
                        <div className="vfoot">
                          <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                            <span className="vprice">{PRICE[item.priceRange]||"$$"}</span>
                            <span className="vstars">{"★".repeat(stars)}</span>
                          </div>
                          <a href={url} target="_blank" rel="noreferrer" className="vbook" onClick={e=>e.stopPropagation()}>
                            {activeTab==="stay"?"Book":activeTab==="activities"?"View":"Reserve"}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="arow">
                <button className="btn btn-ghost" onClick={()=>setStep("details")}>
                  <ArrowLeft size={14} strokeWidth={2} /> Back
                </button>
                {totalSelected>0 && <span className="count-badge">{totalSelected} selected</span>}
                <button className="btn btn-grad" onClick={buildItinerary}>
                  Build the weekend <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ITINERARY */}
          {step==="itinerary" && (
            <div>
              {loadingItin ? (
                <div className="lw">
                  <div className="g-spin" />
                  <p style={{fontSize:"0.72rem",fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--muted)"}}>Building the plan</p>
                </div>
              ) : itinerary && (
                <div>
                  <div className="itin-hero">
                    <p className="itin-eyebrow">Your Lorette plan</p>
                    <div className="itin-title">{itinerary.title}</div>
                  </div>
                  {itinerary.days?.map((day,di) => (
                    <div key={di} className="day-block">
                      <div className="day-pill">{day.dayLabel||`Day ${di+1}`}</div>
                      {day.timeBlocks?.map((block,bi) => (
                        <div key={bi} className="itin-row">
                          <div className="itin-time">{block.time}</div>
                          <div className="itin-dot" />
                          <div className="itin-content">
                            <div className="itin-act">{block.activity}</div>
                            {block.venue && <div className="itin-venue">{block.venue}</div>}
                            {block.notes && <div className="itin-note">{block.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {itinerary.tips?.length>0 && (
                    <div className="tips-card">
                      <div className="tips-head">Good to know</div>
                      {itinerary.tips.map((tip,i) => (
                        <div key={i} className="tip-row"><span className="tip-dot">—</span><span>{tip}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="arow">
                    <button className="btn btn-ghost" onClick={()=>setStep("explore")}>
                      <ArrowLeft size={14} strokeWidth={2} /> Edit picks
                    </button>
                    <button className="btn btn-warm" onClick={()=>setStep("invites")}>
                      Send invites <ChevronRight size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INVITES */}
          {step==="invites" && (
            <div className="card">
              <p className="card-title">Send invites</p>
              <p className="card-sub">Add guest emails and Lorette writes a clean invite with the full plan included.</p>
              {!sent ? (
                <>
                  <div className="ig">
                    <label className="il">Guest emails</label>
                    <textarea className="input" style={{minHeight:"110px"}}
                      placeholder={"ashley@email.com\njessica@email.com\n(one per line or comma separated)"}
                      value={emails} onChange={e=>setEmails(e.target.value)} />
                  </div>
                  <div className="arow" style={{marginBottom:"1.25rem"}}>
                    <button className="btn btn-ghost" onClick={()=>setStep("itinerary")}>
                      <ArrowLeft size={14} strokeWidth={2} /> Back to plan
                    </button>
                    <button className="btn btn-outline" onClick={draftEmail} disabled={loadingEmail}>
                      {loadingEmail?"Drafting…":"Preview invite"}
                    </button>
                  </div>
                  {loadingEmail && <Spinner />}
                  {emailPreview && !loadingEmail && (
                    <>
                      <div className="divr">
                        <div className="divr-line" />
                        <span className="divr-lbl">Preview</span>
                        <div className="divr-line" />
                      </div>
                      <div className="email-preview">
                        <div className="email-head">
                          <div className="email-subj">{emailPreview.subject}</div>
                          <div className="email-to">{emailPreview.recipients?.join(", ")}</div>
                        </div>
                        <div className="email-body" dangerouslySetInnerHTML={{__html:emailPreview.body}} />
                      </div>
                      <div className="arow">
                        <button className="btn btn-grad" onClick={()=>setSent(true)}>Send to all guests</button>
                        <p className="send-note">* Live sending requires Resend API</p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="sent-wrap">
                  <div className="sent-badge">Booked</div>
                  <div className="sent-title">Invites sent.</div>
                  <p className="sent-sub">Every guest just got the plan. {details.brideName?`${details.brideName}'s`:"The"} weekend is locked in.</p>
                  <button className="btn btn-grad" onClick={()=>{
                    setStep("destination"); setCityInput(""); setCity("");
                    setExplore({dining:[],bars:[],stay:[],activities:[]});
                    setSelected({dining:[],bars:[],stay:[],activities:[]});
                    setItinerary(null); setEmailPreview(null); setSent(false); setEmails("");
                  }}>Plan another weekend</button>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </>
  );
}
