import { useState } from "react";

const STEPS = ["destination", "details", "explore", "itinerary", "invites"];
const STEP_LABELS = { destination: "Destination", details: "Details", explore: "Explore", itinerary: "Itinerary", invites: "Invites" };
const TABS = ["restaurants", "bars", "hotels", "attractions"];
const TAB_ICONS = { restaurants: "🍽️", bars: "🍸", hotels: "🏨", attractions: "✨" };
const PRICE_LABELS = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
const STAR_OPTIONS = [2, 3, 4, 5];

function Spinner() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"3rem", gap:"1rem" }}>
      <div className="lorette-spinner" />
      <p style={{ color:"var(--muted)", fontSize:"0.78rem", letterSpacing:"0.1em", textTransform:"uppercase" }}>Finding perfect spots…</p>
    </div>
  );
}

function ProgressBar({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="progress-wrap">
      <div className="progress-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`ps ${i <= idx ? "ps-done" : ""} ${s === current ? "ps-active" : ""}`}>
            <div className="ps-dot">{i < idx ? "✓" : i + 1}</div>
            <span className="ps-label">{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width:`${(idx / (STEPS.length - 1)) * 100}%` }} />
      </div>
    </div>
  );
}

async function callClaude(prompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: "You are a bachelorette party planning expert. Always respond with valid JSON only, no markdown, no backticks.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export default function App() {
  const [step, setStep] = useState("destination");
  const [city, setCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [partyDetails, setPartyDetails] = useState({ brideName:"", date:"", groupSize:"", budget:"moderate", notes:"" });
  const [explore, setExplore] = useState({ restaurants:[], bars:[], hotels:[], attractions:[] });
  const [activeTab, setActiveTab] = useState("restaurants");
  const [loadingTab, setLoadingTab] = useState(null);
  const [starFilter, setStarFilter] = useState([]);
  const [priceFilter, setPriceFilter] = useState([]);
  const [selected, setSelected] = useState({ restaurants:[], bars:[], hotels:[], attractions:[] });
  const [itinerary, setItinerary] = useState(null);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [emails, setEmails] = useState("");
  const [emailPreview, setEmailPreview] = useState(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function fetchTabData(tab, targetCity) {
    setLoadingTab(tab);
    try {
      const result = await callClaude(`Give me 6 real ${tab} recommendations for a bachelorette party in ${targetCity || city}. Return a JSON array. Each object must have: name, description (1-2 sentences), priceRange (1-4), ${tab === "hotels" ? "starRating (2-5)," : "rating (1-5),"} neighborhood, mustTry, bookingUrl ("#"). Return only the JSON array.`);
      setExplore(prev => ({ ...prev, [tab]: Array.isArray(result) ? result : [] }));
    } catch(e) { setExplore(prev => ({ ...prev, [tab]: [] })); }
    setLoadingTab(null);
  }

  async function handleCitySubmit() {
    if (!cityInput.trim()) return;
    setCity(cityInput.trim());
    setStep("details");
  }

  async function handleDetailsSubmit() {
    setStep("explore");
    await fetchTabData("restaurants", cityInput.trim());
  }

  async function handleTabChange(tab) {
    setActiveTab(tab);
    if (!explore[tab]?.length) await fetchTabData(tab);
  }

  function toggleSelected(tab, item) {
    setSelected(prev => {
      const arr = prev[tab];
      const exists = arr.find(i => i.name === item.name);
      return { ...prev, [tab]: exists ? arr.filter(i => i.name !== item.name) : [...arr, item] };
    });
  }

  function isSelected(tab, item) { return selected[tab].some(i => i.name === item.name); }

  async function generateItinerary() {
    setLoadingItinerary(true);
    setStep("itinerary");
    const allSelected = Object.entries(selected).flatMap(([cat, items]) => items.map(i => `${cat}: ${i.name}`));
    try {
      const result = await callClaude(`Create a bachelorette itinerary for ${partyDetails.brideName || "the bride"} in ${city}. Date: ${partyDetails.date || "TBD"}. Group: ${partyDetails.groupSize || "unknown"}. Budget: ${partyDetails.budget}. Venues: ${allSelected.join(", ") || "suggest based on city"}. Notes: ${partyDetails.notes || "none"}. Return JSON: { title, days: [{dayLabel, timeBlocks: [{time, activity, venue, notes, emoji}]}], tips: [3 strings] }`);
      setItinerary(result);
    } catch(e) { setItinerary({ title:"Your Weekend in " + city, days:[], tips:[] }); }
    setLoadingItinerary(false);
  }

  async function generateEmail() {
    setLoadingEmail(true);
    const emailList = emails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    try {
      const result = await callClaude(`Write a bachelorette party invite for ${partyDetails.brideName || "the bride"} in ${city}. Date: ${partyDetails.date || "TBD"}. Group: ${partyDetails.groupSize}. Highlights: ${itinerary?.days?.flatMap(d => d.timeBlocks?.map(t => t.venue)).filter(Boolean).slice(0,5).join(", ") || city}. Return JSON: { subject, body (HTML string with emojis) }`);
      setEmailPreview({ ...result, recipients: emailList });
    } catch(e) { setEmailPreview({ subject:"You're Invited! 🎉", body:"<p>Join us for an unforgettable bachelorette!</p>", recipients: emailList }); }
    setLoadingEmail(false);
  }

  const filteredItems = (tab) => {
    let items = explore[tab] || [];
    if (tab === "hotels" && starFilter.length > 0) items = items.filter(i => starFilter.includes(i.starRating));
    if (priceFilter.length > 0) items = items.filter(i => priceFilter.includes(i.priceRange));
    return items;
  };

  const totalSelected = Object.values(selected).flat().length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,500;1,400;1,500&family=Lato:wght@300;400;700&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        :root {
          --blush:     #FDF6F8;
          --rose:      #D4919F;
          --rose-dk:   #B87080;
          --rose-lt:   #F2D4DA;
          --petal:     #FDF4F6;
          --mauve:     #9A6B78;
          --text:      #5C4048;
          --muted:     #C0A8B0;
          --border:    #F5E8EC;
          --card:      #FFFFFF;
          --gold:      #D4B87A;
          --sage:      #9DB5A8;
          --lavender:  #C8C0E0;
          --cream:     #FEFCFA;
        }

        body { background:var(--cream); font-family:'Lato',sans-serif; color:var(--text); min-height:100vh; }
        .app { min-height:100vh; display:flex; flex-direction:column; }

        /* ── HEADER ── */
        .header {
          background: linear-gradient(160deg, #FFFFFF 0%, #FDF2F5 50%, #FAE8EE 100%);
          border-bottom: 1px solid var(--border);
          padding: 2.5rem 1.5rem 2rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .header::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 15% 50%, rgba(201,123,143,0.06) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 30%, rgba(184,174,212,0.08) 0%, transparent 55%);
          pointer-events: none;
        }
        .header-florals {
          font-size: 0.85rem;
          letter-spacing: 0.6rem;
          color: var(--rose-lt);
          margin-bottom: 0.5rem;
          position: relative;
        }
        .header-logo {
          font-family: 'Bodoni Moda', serif;
          font-size: clamp(3rem, 7vw, 4.5rem);
          font-weight: 400;
          color: var(--mauve);
          letter-spacing: 0.12em;
          line-height: 1;
          position: relative;
        }
        .header-logo em {
          font-style: italic;
          color: var(--rose);
        }
        .header-tagline {
          font-family: 'Lato', sans-serif;
          font-size: 0.72rem;
          font-weight: 300;
          color: var(--muted);
          letter-spacing: 0.25em;
          text-transform: uppercase;
          margin-top: 0.7rem;
          position: relative;
        }
        .header-dot { color: var(--rose-lt); margin: 0 0.5rem; }

        /* ── PROGRESS ── */
        .progress-wrap {
          background: #fff;
          border-bottom: 1px solid var(--border);
          padding: 0.9rem 1.5rem;
        }
        .progress-steps {
          display: flex; justify-content: space-between;
          margin-bottom: 0.6rem;
        }
        .ps { display:flex; flex-direction:column; align-items:center; gap:0.25rem; }
        .ps-dot {
          width: 26px; height: 26px; border-radius: 50%;
          border: 1.5px solid var(--border);
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 700; color: var(--muted);
          transition: all 0.25s;
          font-family: 'Lato', sans-serif;
        }
        .ps-done .ps-dot { background: var(--rose); border-color: var(--rose); color: #fff; }
        .ps-active .ps-dot { background: var(--mauve); border-color: var(--mauve); color: #fff; box-shadow: 0 0 0 4px rgba(122,79,92,0.1); }
        .ps-label { font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 400; }
        .ps-done .ps-label, .ps-active .ps-label { color: var(--mauve); font-weight: 700; }
        .progress-track { height: 2px; background: var(--border); border-radius: 2px; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--lavender), var(--rose)); border-radius: 2px; transition: width 0.4s ease; }

        /* ── MAIN ── */
        .main { flex:1; padding:2.5rem 1.5rem; max-width:880px; margin:0 auto; width:100%; }

        /* ── DESTINATION HERO ── */
        .hero { text-align:center; padding:3rem 1rem 2rem; }
        .hero-ribbon {
          display: inline-flex; align-items: center; gap: 0.6rem;
          margin-bottom: 1.5rem;
        }
        .hero-ribbon-line { width: 40px; height: 1px; background: var(--rose-lt); }
        .hero-ribbon-text {
          font-size: 0.65rem; font-weight: 700; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--rose);
        }
        .hero h2 {
          font-family: 'Bodoni Moda', serif;
          font-size: clamp(1.8rem, 4vw, 2.8rem);
          font-weight: 400;
          color: var(--mauve);
          line-height: 1.25;
          margin-bottom: 0.8rem;
        }
        .hero h2 em { font-style: italic; color: var(--rose); }
        .hero-sub { color: var(--muted); font-size: 0.9rem; line-height: 1.75; max-width: 380px; margin: 0 auto 2.5rem; font-weight: 300; }
        .city-row { display:flex; gap:0.6rem; max-width:440px; margin:0 auto; }
        .city-row .input { flex:1; }

        /* ── CARDS ── */
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 2rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 24px rgba(122,79,92,0.05);
        }
        .card-title {
          font-family: 'Bodoni Moda', serif;
          font-size: 1.7rem;
          font-weight: 400;
          color: var(--mauve);
          margin-bottom: 0.4rem;
        }
        .card-sub { color: var(--muted); font-size: 0.87rem; margin-bottom: 1.8rem; line-height: 1.7; font-weight: 300; }

        /* ── INPUTS ── */
        .input-group { margin-bottom: 1.1rem; }
        .input-label { display:block; font-size:0.7rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); margin-bottom:0.45rem; }
        .input {
          width: 100%; padding: 0.78rem 1rem;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          font-family: 'Lato', sans-serif;
          font-size: 0.92rem;
          background: #fff; color: var(--text);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          appearance: none;
        }
        .input:focus { border-color: var(--rose); box-shadow: 0 0 0 3px rgba(201,123,143,0.1); }
        textarea.input { resize: vertical; min-height: 80px; }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
        @media(max-width:500px){ .grid-2 { grid-template-columns:1fr; } }

        /* ── BUTTONS ── */
        .btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.75rem 1.9rem;
          border-radius: 50px;
          font-family: 'Lato', sans-serif;
          font-size: 0.85rem; font-weight: 700;
          cursor: pointer; border: none;
          transition: all 0.2s; letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .btn-primary { background: var(--mauve); color: #fff; box-shadow: 0 4px 16px rgba(122,79,92,0.2); }
        .btn-primary:hover { background: #6A3F4C; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(122,79,92,0.28); }
        .btn-rose { background: linear-gradient(135deg, var(--rose), var(--rose-dk)); color: #fff; box-shadow: 0 4px 16px rgba(201,123,143,0.3); }
        .btn-rose:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(201,123,143,0.4); }
        .btn-outline { background: #fff; border: 1.5px solid var(--border); color: var(--mauve); }
        .btn-outline:hover { border-color: var(--rose); color: var(--rose); }
        .btn-ghost { background: transparent; border: 1.5px solid var(--border); color: var(--muted); }
        .btn-ghost:hover { border-color: var(--mauve); color: var(--mauve); }

        /* ── TABS ── */
        .tabs { display:flex; gap:0.4rem; margin-bottom:1.5rem; flex-wrap:wrap; }
        .tab {
          padding: 0.5rem 1.1rem; border-radius: 50px;
          border: 1.5px solid var(--border);
          background: #fff; cursor: pointer;
          font-size: 0.82rem; font-family: 'Lato', sans-serif; font-weight: 700;
          transition: all 0.18s; display: flex; align-items: center; gap: 0.3rem;
          color: var(--muted); letter-spacing: 0.02em;
        }
        .tab:hover:not(.tab-active) { border-color: var(--rose); color: var(--rose); }
        .tab.tab-active { background: var(--mauve); border-color: var(--mauve); color: #fff; }
        .tab-count { background: rgba(255,255,255,0.25); border-radius: 10px; padding: 0 5px; font-size: 0.72rem; }

        /* ── FILTERS ── */
        .filters { display:flex; gap:0.8rem; margin-bottom:1.5rem; flex-wrap:wrap; align-items:center; }
        .filter-label { font-size:0.7rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.1em; }
        .chip { padding:0.3rem 0.8rem; border-radius:20px; border:1.5px solid var(--border); font-size:0.78rem; cursor:pointer; background:#fff; color:var(--muted); font-family:'Lato',sans-serif; transition:all 0.15s; }
        .chip.chip-active { background:var(--petal); border-color:var(--rose-lt); color:var(--rose-dk); font-weight:700; }

        /* ── EXPLORE HEADER ── */
        .explore-header { margin-bottom:1.5rem; }
        .explore-title { font-family:'Bodoni Moda',serif; font-size:1.9rem; font-weight:400; color:var(--mauve); }
        .explore-title em { font-style:italic; color:var(--rose); }
        .explore-sub { font-size:0.83rem; color:var(--muted); margin-top:0.25rem; font-weight:300; }

        /* ── VENUE GRID ── */
        .venue-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:1rem; }
        .venue-card {
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: 18px;
          padding: 1.3rem;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .venue-card:hover { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(122,79,92,0.09); border-color: var(--rose-lt); }
        .venue-card.selected { border-color: var(--rose); background: var(--petal); box-shadow: 0 0 0 3px rgba(201,123,143,0.12); }
        .venue-top-bar {
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--lavender), var(--rose));
          opacity: 0; transition: opacity 0.2s;
        }
        .venue-card:hover .venue-top-bar, .venue-card.selected .venue-top-bar { opacity: 1; }
        .venue-check { position:absolute; top:0.9rem; right:0.9rem; width:22px; height:22px; border-radius:50%; background:var(--rose); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.72rem; font-weight:700; }
        .venue-name { font-family:'Bodoni Moda',serif; font-size:1.05rem; font-weight:400; color:var(--mauve); margin-bottom:0.2rem; line-height:1.3; }
        .venue-hood { font-size:0.72rem; color:var(--muted); display:flex; align-items:center; gap:0.2rem; margin-bottom:0.6rem; }
        .venue-desc { font-size:0.81rem; color:#B89AA0; line-height:1.6; margin-bottom:0.75rem; font-weight:300; }
        .venue-must { font-size:0.75rem; background:linear-gradient(135deg,rgba(201,169,110,0.08),rgba(201,169,110,0.04)); border:1px solid rgba(201,169,110,0.2); padding:0.3rem 0.65rem; border-radius:8px; color:var(--gold); margin-bottom:0.7rem; }
        .venue-footer { display:flex; align-items:center; justify-content:space-between; }
        .price-tag { font-size:0.75rem; font-weight:700; color:var(--rose); letter-spacing:0.04em; }
        .stars { font-size:0.72rem; color:var(--gold); }
        .book-link { font-size:0.72rem; padding:0.28rem 0.75rem; border-radius:20px; border:1.5px solid var(--rose); color:var(--rose); background:#fff; text-decoration:none; display:inline-block; transition:all 0.15s; font-family:'Lato',sans-serif; font-weight:700; letter-spacing:0.04em; }
        .book-link:hover { background:var(--rose); color:#fff; }

        /* ── ACTION ROW ── */
        .action-row { display:flex; gap:0.8rem; flex-wrap:wrap; margin-top:2rem; align-items:center; }
        .selected-pill { background:var(--petal); border:1px solid var(--rose-lt); border-radius:20px; padding:0.35rem 0.9rem; font-size:0.78rem; color:var(--rose-dk); font-weight:700; }

        /* ── ITINERARY ── */
        .itin-hero { text-align:center; padding:1rem 0 2rem; border-bottom:1px solid var(--border); margin-bottom:2rem; }
        .itin-eyebrow { font-size:0.65rem; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; color:var(--rose); margin-bottom:0.5rem; }
        .itin-title { font-family:'Bodoni Moda',serif; font-size:clamp(1.6rem,4vw,2.5rem); font-weight:400; color:var(--mauve); font-style:italic; }
        .itin-day { margin-bottom:2rem; }
        .itin-day-label { font-size:0.68rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--rose); padding-bottom:0.6rem; border-bottom:1px solid var(--border); margin-bottom:1rem; }
        .itin-block { display:flex; gap:1rem; padding:0.85rem 0; border-bottom:1px dashed var(--border); align-items:flex-start; }
        .itin-time { font-size:0.72rem; font-weight:700; color:var(--muted); min-width:65px; padding-top:2px; }
        .itin-emoji { font-size:1.2rem; }
        .itin-body { flex:1; }
        .itin-activity { font-weight:700; color:var(--mauve); font-size:0.88rem; }
        .itin-venue { font-size:0.8rem; color:var(--rose); margin-top:0.1rem; }
        .itin-notes { font-size:0.78rem; color:var(--muted); font-style:italic; margin-top:0.15rem; font-weight:300; }
        .tips-box { background:linear-gradient(135deg,var(--petal),#fff); border:1px solid var(--border); border-radius:16px; padding:1.3rem 1.5rem; margin-top:1.5rem; }
        .tips-title { font-family:'Bodoni Moda',serif; font-size:1.1rem; color:var(--mauve); margin-bottom:0.8rem; }
        .tip-row { font-size:0.83rem; color:var(--muted); margin-bottom:0.45rem; display:flex; gap:0.5rem; font-weight:300; }
        .tip-arrow { color:var(--rose); font-weight:700; }

        /* ── EMAIL ── */
        .divider { display:flex; align-items:center; gap:1rem; margin:1.5rem 0; color:var(--muted); font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; }
        .divider::before, .divider::after { content:''; flex:1; height:1px; background:var(--border); }
        .email-card { border:1.5px solid var(--border); border-radius:16px; overflow:hidden; margin-top:1.5rem; box-shadow:0 4px 20px rgba(122,79,92,0.06); }
        .email-top { background:linear-gradient(135deg, var(--mauve), #5A3545); padding:1rem 1.25rem; }
        .email-subject { color:#fff; font-weight:700; font-size:0.88rem; }
        .email-to { color:rgba(255,255,255,0.55); font-size:0.75rem; margin-top:0.2rem; }
        .email-body-wrap { padding:1.25rem; max-height:280px; overflow-y:auto; font-size:0.86rem; line-height:1.7; color:var(--text); }

        /* ── SENT ── */
        .sent-wrap { text-align:center; padding:3rem 1rem; }
        .sent-icon { font-size:4rem; margin-bottom:1rem; }
        .sent-title { font-family:'Bodoni Moda',serif; font-size:2.2rem; font-weight:400; color:var(--mauve); margin-bottom:0.5rem; font-style:italic; }
        .sent-sub { color:var(--muted); font-size:0.88rem; margin-bottom:2rem; font-weight:300; }

        /* ── LOADING ── */
        .loading-wrap { text-align:center; padding:4rem 1rem; }
        .lorette-spinner { width:36px; height:36px; border:2px solid var(--border); border-top-color:var(--rose); border-radius:50%; animation:spin 0.85s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* ── EMPTY ── */
        .empty { text-align:center; padding:3rem 1rem; color:var(--muted); }
        .empty-icon { font-size:2.5rem; margin-bottom:0.75rem; opacity:0.4; }

        @media(max-width:600px){
          .main { padding:1.5rem 1rem; }
          .venue-grid { grid-template-columns:1fr; }
          .city-row { flex-direction:column; }
          .ps-label { display:none; }
          .card { padding:1.25rem; }
        }
      `}</style>

      <div className="app">

        {/* HEADER */}
        <div className="header">
          <div className="header-logo"><em>Lorette</em></div>
          <div className="header-tagline">
            <span className="header-dot">—</span>
            Your celebration, perfectly planned.
            <span className="header-dot">—</span>
          </div>
        </div>

        <ProgressBar current={step} />

        <div className="main">

          {/* ── STEP 1: DESTINATION ── */}
          {step === "destination" && (
            <div className="hero">
              <div className="hero-ribbon">
                <div className="hero-ribbon-line" />
                <span className="hero-ribbon-text">✦ AI-Powered Planning</span>
                <div className="hero-ribbon-line" />
              </div>
              <h2>Where is the <em>celebration?</em></h2>
              <p className="hero-sub">Enter your destination and Lorette handles everything — venues, itinerary, and guest invitations, all in one beautiful place.</p>
              <div className="city-row">
                <input className="input" placeholder="Nashville, Miami, New Orleans…" value={cityInput} onChange={e => setCityInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCitySubmit()} />
                <button className="btn btn-rose" onClick={handleCitySubmit}>Let's Go →</button>
              </div>
            </div>
          )}

          {/* ── STEP 2: DETAILS ── */}
          {step === "details" && (
            <div className="card">
              <p className="card-title">Tell us about the party ✨</p>
              <p className="card-sub">A few details help Lorette personalize every recommendation and itinerary for your group.</p>
              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Bride's Name</label>
                  <input className="input" placeholder="e.g. Olivia" value={partyDetails.brideName} onChange={e => setPartyDetails(p => ({ ...p, brideName:e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Party Date</label>
                  <input className="input" type="date" value={partyDetails.date} onChange={e => setPartyDetails(p => ({ ...p, date:e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Group Size</label>
                  <input className="input" placeholder="e.g. 10 guests" value={partyDetails.groupSize} onChange={e => setPartyDetails(p => ({ ...p, groupSize:e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Budget Vibe</label>
                  <select className="input" value={partyDetails.budget} onChange={e => setPartyDetails(p => ({ ...p, budget:e.target.value }))}>
                    <option value="budget">Budget-Friendly 💸</option>
                    <option value="moderate">Moderate 🌸</option>
                    <option value="luxe">Luxe & Splurge 👑</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Special Notes / Vibe</label>
                <textarea className="input" placeholder="Bride loves rooftop bars, no seafood, obsessed with country music…" value={partyDetails.notes} onChange={e => setPartyDetails(p => ({ ...p, notes:e.target.value }))} />
              </div>
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => setStep("destination")}>← Back</button>
                <button className="btn btn-rose" onClick={handleDetailsSubmit}>Explore {city} →</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: EXPLORE ── */}
          {step === "explore" && (
            <div>
              <div className="explore-header">
                <div className="explore-title">Discovering <em>{city}</em></div>
                <div className="explore-sub">Browse and select your favorite spots — your itinerary builds from your picks.</div>
              </div>
              <div className="tabs">
                {TABS.map(t => (
                  <button key={t} className={`tab ${activeTab === t ? "tab-active" : ""}`} onClick={() => handleTabChange(t)}>
                    {TAB_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                    {selected[t].length > 0 && <span className="tab-count">{selected[t].length}</span>}
                  </button>
                ))}
              </div>
              <div className="filters">
                {activeTab === "hotels" && (
                  <>
                    <span className="filter-label">Stars</span>
                    {STAR_OPTIONS.map(s => (
                      <button key={s} className={`chip ${starFilter.includes(s) ? "chip-active" : ""}`} onClick={() => setStarFilter(p => p.includes(s) ? p.filter(x => x !== s) : [...p,s])}>
                        {"★".repeat(s)}
                      </button>
                    ))}
                    <span style={{width:"1px",height:"16px",background:"var(--border)"}} />
                  </>
                )}
                <span className="filter-label">Price</span>
                {[1,2,3,4].map(p => (
                  <button key={p} className={`chip ${priceFilter.includes(p) ? "chip-active" : ""}`} onClick={() => setPriceFilter(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev,p])}>
                    {PRICE_LABELS[p]}
                  </button>
                ))}
              </div>
              {loadingTab === activeTab ? <Spinner /> : filteredItems(activeTab).length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔍</div>
                  <p>No results — try adjusting your filters.</p>
                </div>
              ) : (
                <div className="venue-grid">
                  {filteredItems(activeTab).map((item, i) => {
                    const sel = isSelected(activeTab, item);
                    const size = partyDetails.groupSize?.replace(/\D/g,'') || '6';
                    const date = partyDetails.date || new Date().toISOString().split('T')[0];
                    const checkOut = new Date(new Date(date).getTime() + 2*86400000).toISOString().split('T')[0];
                    const url = activeTab === "hotels"
                      ? `https://www.booking.com/search.html?ss=${encodeURIComponent(item.name+' '+city)}&checkin=${date}&checkout=${checkOut}&group_adults=${size}`
                      : activeTab === "attractions"
                      ? `https://www.google.com/search?q=${encodeURIComponent(item.name+' '+city)}`
                      : `https://www.google.com/search?q=${encodeURIComponent(item.name+' '+city+' OpenTable reservation')}`;
                    return (
                      <div key={i} className={`venue-card ${sel ? "selected" : ""}`} onClick={() => toggleSelected(activeTab, item)}>
                        <div className="venue-top-bar" />
                        {sel && <div className="venue-check">✓</div>}
                        <div className="venue-name">{item.name}</div>
                        <div className="venue-hood">📍 {item.neighborhood}</div>
                        <div className="venue-desc">{item.description}</div>
                        <div className="venue-must">✦ {item.mustTry}</div>
                        <div className="venue-footer">
                          <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                            <span className="price-tag">{PRICE_LABELS[item.priceRange] || "$$"}</span>
                            <span className="stars">{"★".repeat(Math.round(activeTab === "hotels" ? (item.starRating||3) : (item.rating||4)))}</span>
                          </div>
                          <a href={url} target="_blank" rel="noreferrer" className="book-link" onClick={e => e.stopPropagation()}>
                            {activeTab === "hotels" ? "Book" : activeTab === "attractions" ? "View" : "Reserve"}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => setStep("details")}>← Back</button>
                {totalSelected > 0 && <span className="selected-pill">{totalSelected} spot{totalSelected !== 1 ? "s" : ""} selected</span>}
                <button className="btn btn-primary" onClick={generateItinerary}>Build Itinerary →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4: ITINERARY ── */}
          {step === "itinerary" && (
            <div>
              {loadingItinerary ? (
                <div className="loading-wrap">
                  <div className="lorette-spinner" style={{margin:"0 auto 1rem"}} />
                  <p style={{color:"var(--muted)",fontSize:"0.78rem",letterSpacing:"0.1em",textTransform:"uppercase"}}>Crafting your perfect weekend…</p>
                </div>
              ) : itinerary && (
                <div>
                  <div className="itin-hero">
                    <div className="itin-eyebrow">Your Lorette Itinerary</div>
                    <div className="itin-title">{itinerary.title}</div>
                  </div>
                  {itinerary.days?.map((day, di) => (
                    <div key={di} className="itin-day">
                      <div className="itin-day-label">{day.dayLabel || `Day ${di + 1}`}</div>
                      {day.timeBlocks?.map((block, bi) => (
                        <div key={bi} className="itin-block">
                          <div className="itin-time">{block.time}</div>
                          <div className="itin-emoji">{block.emoji || "✦"}</div>
                          <div className="itin-body">
                            <div className="itin-activity">{block.activity}</div>
                            {block.venue && <div className="itin-venue">@ {block.venue}</div>}
                            {block.notes && <div className="itin-notes">{block.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {itinerary.tips?.length > 0 && (
                    <div className="tips-box">
                      <div className="tips-title">✦ Lorette's Pro Tips</div>
                      {itinerary.tips.map((tip, i) => (
                        <div key={i} className="tip-row"><span className="tip-arrow">→</span><span>{tip}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="action-row">
                    <button className="btn btn-ghost" onClick={() => setStep("explore")}>← Edit Picks</button>
                    <button className="btn btn-rose" onClick={() => setStep("invites")}>Send Invites 💌</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: INVITES ── */}
          {step === "invites" && (
            <div className="card">
              <p className="card-title">Send Invites 💌</p>
              <p className="card-sub">Enter your guests' emails and Lorette will write a beautiful personalized invitation with your full itinerary included.</p>
              {!emailSent ? (
                <>
                  <div className="input-group">
                    <label className="input-label">Guest Email Addresses</label>
                    <textarea className="input" style={{minHeight:"130px"}} placeholder={"ashley@email.com\njessica@email.com\nemma@email.com\n\n(one per line or comma separated)"} value={emails} onChange={e => setEmails(e.target.value)} />
                  </div>
                  <div className="action-row" style={{marginBottom:"1.5rem"}}>
                    <button className="btn btn-ghost" onClick={() => setStep("itinerary")}>← Back to Itinerary</button>
                    <button className="btn btn-outline" onClick={generateEmail} disabled={loadingEmail}>
                      {loadingEmail ? "Drafting…" : "✍️ Preview Invitation"}
                    </button>
                  </div>
                  {loadingEmail && <div style={{marginTop:"1.5rem"}}><Spinner /></div>}
                  {emailPreview && !loadingEmail && (
                    <>
                      <div className="divider">Preview</div>
                      <div className="email-card">
                        <div className="email-top">
                          <div className="email-subject">📬 {emailPreview.subject}</div>
                          <div className="email-to">To: {emailPreview.recipients?.join(", ")}</div>
                        </div>
                        <div className="email-body-wrap" dangerouslySetInnerHTML={{ __html: emailPreview.body }} />
                      </div>
                      <div className="action-row">
                        <button className="btn btn-rose" onClick={() => setEmailSent(true)}>🚀 Send to All Guests</button>
                        <p style={{fontSize:"0.75rem",color:"var(--muted)"}}>* Live sending requires Resend API</p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="sent-wrap">
                  <div className="sent-icon">🥂</div>
                  <div className="sent-title">Invites are on their way!</div>
                  <p className="sent-sub">Your guests are going to be so excited for {partyDetails.brideName ? `${partyDetails.brideName}'s` : "the"} bachelorette in {city}.</p>
                  <button className="btn btn-rose" onClick={() => {
                    setStep("destination"); setCityInput(""); setCity("");
                    setExplore({restaurants:[],bars:[],hotels:[],attractions:[]});
                    setSelected({restaurants:[],bars:[],hotels:[],attractions:[]});
                    setItinerary(null); setEmailPreview(null); setEmailSent(false); setEmails("");
                  }}>Plan Another Trip ✦</button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
