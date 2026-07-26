import { useState, useRef, useEffect } from "react";
import { MapPin, Check, ArrowLeft, ChevronRight, ChevronLeft, Calendar, Utensils, Wine, Building2, Compass, Sparkles } from "lucide-react";

const STEPS = ["destination", "details", "explore", "itinerary", "invites"];
const STEP_LABELS = { destination: "Destination", details: "Weekend", explore: "Explore", itinerary: "Plan", invites: "Invite" };
const TABS = ["dining", "bars", "stay", "activities"];
const TAB_LABELS = { dining: "Dining", bars: "Bars", stay: "Stay", activities: "Activities" };
const TAB_CLAUDE = { dining: "restaurants", bars: "bars", stay: "hotels", activities: "attractions" };
const TAB_ICONS = { dining: Utensils, bars: Wine, stay: Building2, activities: Compass };
const PRICE = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
const STARS_OPT = [2, 3, 4, 5];

// Turns the two date inputs into readable text for prompts, e.g.
// "Friday, May 15 through Sunday, May 17 2026 (3 days, 2 nights)"
function describeDates(startDate, endDate) {
  if (!startDate && !endDate) return "";
  const fmt = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  };
  if (startDate && !endDate) return fmt(startDate);
  if (!startDate && endDate) return fmt(endDate);
  if (startDate === endDate) return fmt(startDate);
  const nights = Math.round(
    (new Date(endDate) - new Date(startDate)) / 86400000
  );
  const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
  return `${fmt(startDate)} through ${fmt(endDate)} (${nights + 1} days, ${nightLabel})`;
}

// ── DATE RANGE PICKER ────────────────────────────────────────────────────────
// One field, one calendar. First tap sets arrival, second sets departure —
// the way a hotel booking widget behaves.

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"];

// All date math is on local calendar days, never timestamps, so a timezone
// offset can't shift May 15 into May 14.
function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shortLabel(iso) {
  const d = fromISO(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}
function nightsBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

// ── INLINE EDITING ───────────────────────────────────────────────────────────
// Any itinerary text becomes an input on click. Enter or clicking away saves,
// Escape reverts.

function EditableText({ value, onChange, multiline, placeholder, className = "", ariaLabel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef(null);

  // stay in sync when the itinerary is regenerated underneath us
  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    if (multiline) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [editing, multiline]);

  function commit() {
    const next = draft.trim();
    if (next !== (value ?? "")) onChange(next);
    setEditing(false);
  }
  function cancel() { setDraft(value ?? ""); setEditing(false); }

  if (editing) {
    const shared = {
      ref,
      value: draft,
      "aria-label": ariaLabel,
      className: `ed-input ${className}`,
      onChange: (e) => {
        setDraft(e.target.value);
        if (multiline) { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }
      },
      onBlur: commit,
      onKeyDown: (e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        // single-line fields commit on Enter; textareas allow newlines
        if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
        if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      },
    };
    return multiline ? <textarea rows={1} {...shared} /> : <input type="text" {...shared} />;
  }

  return (
    <span
      className={`ed ${className} ${!value ? "ed-empty" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); }
      }}
    >
      {value || placeholder || "Add text"}
    </span>
  );
}

function DateRangeField({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const todayISO = toISO(new Date());
  const [view, setView] = useState(() => {
    const base = startDate ? fromISO(startDate) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const wrapRef = useRef(null);

  // close on outside tap or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(iso) {
    // no range yet, or a complete range → start a fresh one
    if (!startDate || (startDate && endDate)) {
      onChange({ startDate: iso, endDate: "" });
      setHover(null);
      return;
    }
    // half-open range: earlier tap replaces the start, later tap closes it
    if (iso < startDate) {
      onChange({ startDate: iso, endDate: "" });
      return;
    }
    onChange({ startDate, endDate: iso });
    setHover(null);
    setOpen(false);
  }

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const lead = monthStart.getDay();
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];

  // preview the range as the finger/cursor moves before the second tap
  const previewEnd = !endDate && startDate && hover && hover > startDate ? hover : endDate;
  const atCurrentMonth =
    view.getFullYear() === new Date().getFullYear() && view.getMonth() === new Date().getMonth();

  const nights = startDate && endDate ? nightsBetween(startDate, endDate) : 0;

  let label = "Add dates";
  if (startDate && endDate) label = `${shortLabel(startDate)} – ${shortLabel(endDate)}`;
  else if (startDate) label = `${shortLabel(startDate)} – Add return`;

  return (
    <div className="dr-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`dr-trigger ${!startDate ? "dr-empty" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <Calendar size={15} strokeWidth={1.9} />
        <span className="dr-label">{label}</span>
        {nights > 0 && <span className="dr-nights">{nights} {nights === 1 ? "night" : "nights"}</span>}
      </button>

      {open && (
        <div className="dr-pop">
          <div className="dr-head">
            <button
              type="button"
              className="dr-nav"
              disabled={atCurrentMonth}
              onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
            <div className="dr-month">{MONTHS[view.getMonth()]} {view.getFullYear()}</div>
            <button
              type="button"
              className="dr-nav"
              onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="dr-dow">
            {DOW.map((d, i) => <span key={i}>{d}</span>)}
          </div>

          <div className="dr-grid" onMouseLeave={() => setHover(null)}>
            {cells.map((d, i) => {
              if (!d) return <span key={i} className="dr-cell dr-blank" />;
              const iso = toISO(d);
              const past = iso < todayISO;
              const isStart = iso === startDate;
              const isEnd = iso === endDate;
              const inRange = startDate && previewEnd && iso > startDate && iso < previewEnd;
              const cls = [
                "dr-cell",
                "dr-day",
                past ? "is-past" : "",
                isStart ? "is-start" : "",
                isEnd ? "is-end" : "",
                inRange ? "is-between" : "",
                iso === todayISO ? "is-today" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  disabled={past}
                  onMouseEnter={() => !past && setHover(iso)}
                  onClick={() => pick(iso)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="dr-foot">
            <span className="dr-hint">
              {!startDate ? "Pick your arrival day"
                : !endDate ? "Now pick when you leave"
                : describeDates(startDate, endDate)}
            </span>
            {(startDate || endDate) && (
              <button
                type="button"
                className="dr-clear"
                onClick={() => { onChange({ startDate: "", endDate: "" }); setHover(null); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The app runs in two places: on lorette.ai, where /api/chat proxies the key
// safely, and in a preview sandbox where that route doesn't exist. Try the
// proxy first; if it 404s, fall back to calling the API directly.
let useDirectApi = false;

async function postMessages({ system, messages, maxTokens, stream }) {
  if (!useDirectApi) {
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages, max_tokens: maxTokens, stream }),
      });
      // A real function replies with JSON or an event stream. Anything else
      // (an HTML shell, a 404 page) means the route isn't there — checking
      // headers doesn't consume the body, so the response stays usable.
      const ct = resp.headers.get('content-type') || '';
      const isOurApi = ct.includes('application/json') || ct.includes('text/event-stream');
      // Only route around a genuinely absent endpoint. A 5xx means the
      // function exists and failed — surface that rather than hiding it.
      const routeMissing = resp.status === 404 || (!isOurApi && resp.status < 500);
      if (!routeMissing) return { resp, via: 'proxy' };
      useDirectApi = true;
    } catch {
      useDirectApi = true; // network-level failure reaching the route
    }
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 4000,
      system,
      messages,
      ...(stream ? { stream: true } : {}),
    }),
  });
  return { resp, via: 'direct' };
}

// The browser has no API key of its own. If the direct path is rejected for
// auth, the real problem is that the server route never answered.
function describeAuthFailure(via) {
  return via === 'direct'
    ? "The /api/chat route isn't responding, so the browser tried to reach the API on its own and was refused. Check that api/chat.js deployed and ANTHROPIC_API_KEY is set in Vercel."
    : "The API key is missing or invalid on the server.";
}

const SYSTEM_PROMPT = "You are a bachelorette weekend planning expert. Always respond with valid JSON only. No markdown, no backticks, no explanation — just the raw JSON.";

// A response can arrive as a normal message object, as a server-sent event
// stream delivered in one piece, or as bare text. Pull the model's words out
// of whichever shape showed up instead of assuming one.
function extractText(bodyText) {
  if (!bodyText || !bodyText.trim()) return { text: "" };

  try {
    const data = JSON.parse(bodyText);
    if (data?.error) return { error: data.error };
    if (Array.isArray(data?.content)) {
      return {
        text: data.content.filter(b => b.type === "text").map(b => b.text).join(""),
        stopReason: data.stop_reason || null,
      };
    }
  } catch { /* not a plain message object — keep going */ }

  if (/(^|\n)\s*data:\s*\{/.test(bodyText)) {
    let text = "", stopReason = null, err = null, sawEvent = false;
    for (const line of bodyText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        sawEvent = true;
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") text += evt.delta.text;
        else if (evt.type === "message_delta" && evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        else if (evt.type === "error") err = evt.error;
      } catch { /* skip a partial event line */ }
    }
    if (err) return { error: err };
    // Return even with no text — a lone stop_reason still tells us why
    if (sawEvent) return { text, stopReason };
  }

  return { text: bodyText };
}

// Parses incomplete JSON mid-stream by closing the structure at the last
// point it was valid — lets the UI render the plan as it arrives.
function parsePartialJSON(raw) {
  if (!raw) return null;
  let s = raw.replace(/```json/gi, "").replace(/```/g, "");
  const starts = [s.indexOf("{"), s.indexOf("[")].filter(i => i !== -1);
  if (!starts.length) return null;
  s = s.slice(Math.min(...starts));

  try { return JSON.parse(s); } catch {}

  const cuts = [], stacks = [], stack = [];
  let inStr = false, esc = false;
  const mark = (i) => { cuts.push(i); stacks.push(stack.slice()); };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; mark(i + 1); }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { stack.push("}"); continue; }
    if (c === "[") { stack.push("]"); continue; }
    if (c === "}" || c === "]") { stack.pop(); mark(i + 1); continue; }
    if (c === ",") { mark(i); continue; }
    if (/[0-9]/.test(c)) {
      const n = s[i + 1];
      if (!n || !/[0-9.eE+-]/.test(n)) mark(i + 1);
      continue;
    }
    if (c === "e" || c === "l") {
      if (/(true|false|null)$/.test(s.slice(Math.max(0, i - 4), i + 1))) mark(i + 1);
    }
  }

  if (inStr && !esc) {
    try { return JSON.parse(s + '"' + stack.slice().reverse().join("")); } catch {}
  }
  const limit = Math.max(0, cuts.length - 60);
  for (let k = cuts.length - 1; k >= limit; k--) {
    const head = s.slice(0, cuts[k]).replace(/[,:\s]*$/, "");
    try { return JSON.parse(head + stacks[k].slice().reverse().join("")); } catch {}
  }
  try { return JSON.parse(s.replace(/[,:\s]*$/, "") + stack.slice().reverse().join("")); } catch {}
  return null;
}

// Streams a response, calling onPartial with the plan-so-far as it builds.
// Falls back to the plain request if streaming isn't available.
async function callClaudeStreaming(prompt, { maxTokens = 4000, onPartial } = {}) {
  // Streaming is a progressive-rendering nicety, and only the server proxy is
  // known to support it. On the direct path, take the plain request instead.
  if (useDirectApi) throw new Error("STREAM_UNSUPPORTED");

  const { resp, via } = await postMessages({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    stream: true,
  });

  // postMessages may have discovered the proxy is absent and gone direct —
  // that path isn't known to stream, so hand back to the plain request.
  if (via === 'direct') throw new Error("STREAM_UNSUPPORTED");

  if (!resp.ok) {
    const bodyText = await resp.text();
    if (resp.status === 401 || resp.status === 403) throw new Error(describeAuthFailure(via));
    let detail = {};
    try { detail = JSON.parse(bodyText); }
    catch {
      if (resp.status === 504 || /timed?.?out|FUNCTION_INVOCATION_TIMEOUT/i.test(bodyText)) {
        throw new Error("The request timed out on the server. Set maxDuration in api/chat.js.");
      }
      const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 120) || "(empty body)";
      throw new Error(`Got ${resp.status} via ${via} but not data. Response began: ${snippet}`);
    }
    const raw = detail?.error?.message || `Request failed (${resp.status})`;
    if (/credit|balance|quota/i.test(raw)) throw new Error("Out of API credit. Add credits at console.anthropic.com.");
    if (/api.?key|authentication|unauthorized/i.test(raw)) throw new Error("The API key is missing or invalid in Vercel.");
    const retryable = resp.status === 429 || resp.status >= 500 || /overload|rate.?limit/i.test(raw);
    throw new Error(retryable ? "Claude is busy right now." : raw);
  }
  if (!resp.body?.getReader) throw new Error("STREAM_UNSUPPORTED");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", stopReason = null, lastEmit = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text;
      } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
        stopReason = evt.delta.stop_reason;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Stream error");
      }
    }

    // Repaint at most ~8x/sec so long plans don't thrash the DOM
    if (onPartial && Date.now() - lastEmit > 120) {
      const partial = parsePartialJSON(text);
      if (partial) onPartial(partial);
      lastEmit = Date.now();
    }
  }

  if (stopReason === "max_tokens") {
    throw new Error("The plan ran longer than the space allowed. Try a shorter trip or fewer picks.");
  }
  if (!text.trim()) throw new Error("Claude sent back an empty response.");

  const final = parsePartialJSON(text);
  if (!final) throw new Error("Claude's answer wasn't in the expected format.");
  return final;
}

async function callClaude(prompt, { maxTokens = 4000, retries = 2 } = {}) {
  let lastError = new Error("Request failed");

  for (let attempt = 0; attempt <= retries; attempt++) {
    let retryable = false;
    try {
      const { resp, via } = await postMessages({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
      });

      const bodyText = await resp.text();

      // Timeouts and error shells never parse — catch them before anything else
      if (resp.status === 504 || /FUNCTION_INVOCATION_TIMEOUT/i.test(bodyText)) {
        throw new Error("The request timed out on the server. Set maxDuration in api/chat.js.");
      }

      const { text, stopReason, error } = extractText(bodyText);

      // API-level failure — surface the actual reason
      if (!resp.ok || error) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(describeAuthFailure(via));
        }
        const raw = error?.message
          || bodyText.replace(/\s+/g, " ").trim().slice(0, 100)
          || `Request failed (${resp.status})`;
        retryable = resp.status === 429 || resp.status >= 500 || /overload|rate.?limit/i.test(raw);
        if (/credit|balance|quota/i.test(raw)) {
          throw new Error("Out of API credit. Add credits at console.anthropic.com.");
        }
        throw new Error(retryable ? "Claude is busy right now." : `${resp.status} via ${via}: ${raw}`);
      }

      if (stopReason === "max_tokens") {
        throw new Error("The answer ran longer than the space allowed. Try a shorter trip or fewer picks.");
      }
      if (!text || !text.trim()) throw new Error("Claude sent back an empty response.");

      // parsePartialJSON handles complete JSON, fenced JSON, leading prose,
      // and answers that were cut off — all in one path.
      const parsed = parsePartialJSON(text);
      if (parsed === null) {
        retryable = true;
        const snippet = text.replace(/\s+/g, " ").trim().slice(0, 100) || "(empty)";
        throw new Error(`Couldn't read the answer. It began: ${snippet}`);
      }
      return parsed;
    } catch (e) {
      lastError = e;
      if (!retryable || attempt === retries) break;
      await sleep(600 * (attempt + 1));
    }
  }

  throw lastError;
}

export default function App() {
  const [step, setStep] = useState("destination");
  const [city, setCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [details, setDetails] = useState({ brideName:"", startDate:"", endDate:"", groupSize:"", budget:"moderate", notes:"" });
  const [explore, setExplore] = useState({ dining:[], bars:[], stay:[], activities:[] });
  const [activeTab, setActiveTab] = useState("dining");
  const [loadingTabs, setLoadingTabs] = useState({});
  const [tabErrors, setTabErrors] = useState({});
  const loadedRef = useRef({});
  const inFlightRef = useRef({});
  const cityRef = useRef("");
  const reqIdRef = useRef({});
  const [starFilter, setStarFilter] = useState([]);
  const [priceFilter, setPriceFilter] = useState([]);
  const [selected, setSelected] = useState({ dining:[], bars:[], stay:[], activities:[] });
  const [itinerary, setItinerary] = useState(null);
  const [loadingItin, setLoadingItin] = useState(false);
  const [itinError, setItinError] = useState("");
  const [fillingDays, setFillingDays] = useState({});
  const [planBuilding, setPlanBuilding] = useState(false);
  const [emails, setEmails] = useState("");
  const [emailPreview, setEmailPreview] = useState(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sent, setSent] = useState(false);

  async function fetchTab(tab, targetCity) {
    const forCity = targetCity || cityRef.current || city;
    if (!forCity) return; // nothing to search for yet

    // One request per tab at a time. Clicking a tab the background loader is
    // already fetching used to start a duplicate, and whichever finished last
    // won — so a rate-limited retry could blank a tab that had just loaded.
    if (inFlightRef.current[tab]) return inFlightRef.current[tab];

    // Token per request. Only the newest one for a tab may touch state, which
    // means a superseded response can't clobber results or strand a spinner.
    const myId = (reqIdRef.current[tab] || 0) + 1;
    reqIdRef.current[tab] = myId;
    const isCurrent = () => reqIdRef.current[tab] === myId;

    const cat = TAB_CLAUDE[tab];
    const run = (async () => {
      setLoadingTabs(prev => ({ ...prev, [tab]: true }));
      setTabErrors(prev => ({ ...prev, [tab]: "" }));
      try {
        const result = await callClaude(
          `Give me 6 real ${cat} recommendations for a bachelorette weekend in ${forCity}. Return a JSON array. Each object: name, description (one short sentence, under 20 words), priceRange (1-4), ${tab==="stay"?"starRating (2-5),":"rating (1.0-5.0),"} neighborhood, mustTry (under 8 words). Return only the JSON array.`,
          { maxTokens: 2000 }
        );
        if (!isCurrent()) return;
        if (!Array.isArray(result) || result.length === 0) {
          throw new Error("No places came back for this one.");
        }
        setExplore(prev => ({ ...prev, [tab]: result }));
        loadedRef.current[tab] = true;
      } catch(e) {
        if (!isCurrent()) return;
        setExplore(prev => ({ ...prev, [tab]: [] }));
        setTabErrors(prev => ({ ...prev, [tab]: e.message || "Couldn't load these." }));
      } finally {
        // Always release the spinner for the newest request, whatever happened
        if (isCurrent()) setLoadingTabs(prev => ({ ...prev, [tab]: false }));
        if (inFlightRef.current[tab] === run) delete inFlightRef.current[tab];
      }
    })();

    inFlightRef.current[tab] = run;
    return run;
  }

  // Every path into a city goes through here — typing one in, or tapping a
  // popular-destination chip. Bypassing it left refs unset and stranded a spinner.
  function startCity(c) {
    if (!c) return;
    if (c !== cityRef.current) {
      setExplore({ dining:[], bars:[], stay:[], activities:[] });
      setSelected({ dining:[], bars:[], stay:[], activities:[] });
      setTabErrors({});
      setItinerary(null);
      setItinError("");
      setActiveTab("dining");
      loadedRef.current = {};
      inFlightRef.current = {};
      // Invalidate anything still in flight for the old city
      for (const t of TABS) reqIdRef.current[t] = (reqIdRef.current[t] || 0) + 1;
    }
    cityRef.current = c;
    setCityInput(c);
    setCity(c);
    setStep("details");
  }

  async function handleCitySubmit() {
    if (!cityInput.trim()) return;
    startCity(cityInput.trim());
  }

  async function handleDetailsSubmit() {
    setStep("explore");
    // Dining first so there's something on screen fast, then the rest one at
    // a time in the background. Firing all four at once trips API rate limits.
    for (const t of TABS) {
      if (!loadedRef.current[t]) await fetchTab(t, cityRef.current);
    }
  }

  async function handleTabChange(tab) {
    setActiveTab(tab);
    // fetchTab dedupes, so clicking a tab the loader is already on just
    // waits on the request already in flight instead of starting a second.
    if (!loadedRef.current[tab]) fetchTab(tab, cityRef.current);
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
    setLoadingItin(true);
    setItinError("");
    setStep("itinerary");
    setItinerary(null);

    const picks = Object.entries(selected).flatMap(([cat,items]) => items.map(i => `${i.name} (${cat})`));
    const venueList = picks.length > 0 ? picks.join(", ") : `none selected — pick great real spots in ${city} yourself`;
    const dateText = describeDates(details.startDate, details.endDate);
    const dayCount = details.startDate && details.endDate
      ? Math.round((new Date(details.endDate) - new Date(details.startDate)) / 86400000) + 1
      : null;

    const context = `Bachelorette weekend in ${city} for ${details.brideName || "the bride"}.
Group: ${details.groupSize || "8 guests"}
Dates: ${dateText || "a weekend, dates TBD"}
Budget: ${details.budget}
Spots they picked: ${venueList}
${details.notes ? `What she's into: ${details.notes}` : ""}`;

    const voice = `Write in the voice of a friend who lives in ${city} and has already made the reservations — warm, specific, unbothered. Skip filler like "enjoy the city" or "celebrate the bride"; say the actual thing. Ground everything in real ${city} neighborhoods and venues.`;

    const isTerminal = (msg) => /credit|balance|quota|API key/i.test(msg || "");

    try {
      // ── Pass 1: the shape of the weekend. Small and fast, so something is
      // on screen in seconds instead of after a minute of blank spinner.
      const skeletonPrompt = `${context}

${voice}

Give me the shape of this weekend — the title, the day labels, and three tips. No schedule yet.
${dayCount
  ? `The trip runs ${dayCount} day${dayCount === 1 ? "" : "s"}, so give exactly ${dayCount} day labels, each with its real weekday and date.`
  : `Give 2 or 3 day labels for a typical weekend.`}
Tips should be things only someone who's done this in ${city} would know — not generic advice about booking ahead. One line each, under 15 words.

Respond with a single JSON object and nothing else:
{"title": string, "dayLabels": [string], "tips": [string, string, string]}`;

      const skeleton = await callClaude(skeletonPrompt, { maxTokens: 500 });
      const labels = Array.isArray(skeleton?.dayLabels) ? skeleton.dayLabels.filter(Boolean) : [];
      if (!labels.length) throw new Error("Claude sent back a plan with no days in it.");

      const base = {
        title: skeleton.title || `${city} Weekend`,
        days: labels.map(l => ({ dayLabel: l, timeBlocks: [] })),
        tips: Array.isArray(skeleton.tips) ? skeleton.tips : [],
      };
      setItinerary(base);
      setLoadingItin(false);
      setPlanBuilding(true);

      // ── Pass 2: days are written two at a time. Sequential was safe but
      // slow on a 5-day trip; four at once is what tripped rate limits during
      // venue loading. Two is the middle ground.
      const CONCURRENCY = 2;
      let cursor = 0;
      let filled = 0;
      let terminal = null;

      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= labels.length || terminal) return;

          setFillingDays(prev => ({ ...prev, [i]: true }));
          const dayPrompt = `${context}

${voice}

Write the schedule for just this one day: "${labels[i]}" (day ${i + 1} of ${labels.length}).
${i === 0 ? "This is arrival day — it starts partway through, not first thing in the morning." : ""}${i === labels.length - 1 && labels.length > 1 ? "This is departure day — keep it short and end before checkout." : ""}
Give 4 or 5 time blocks.

Keep activity names to 2 to 5 words. Notes are one or two short sentences, under 25 words — real detail worth knowing: what to order, what to wear, when to leave, what fills up, what to ask for. Specific over general. Skip the note entirely rather than padding it with filler.

Respond with a single JSON object and nothing else:
{"timeBlocks": [{"time": string, "activity": string, "venue": string, "notes": string, "emoji": string}]}`;

          try {
            const day = await callClaude(dayPrompt, { maxTokens: 1000 });
            const blocks = Array.isArray(day?.timeBlocks) ? day.timeBlocks : [];
            if (blocks.length) {
              filled++;
              setItinerary(prev => {
                if (!prev) return prev;
                const next = structuredClone ? structuredClone(prev) : JSON.parse(JSON.stringify(prev));
                if (next.days[i]) next.days[i].timeBlocks = blocks;
                return next;
              });
            }
          } catch (dayErr) {
            // Out of credit or a bad key won't fix itself — stop the whole run
            if (isTerminal(dayErr.message)) terminal = dayErr;
            // Otherwise leave this day empty and let the others finish
          } finally {
            setFillingDays(prev => ({ ...prev, [i]: false }));
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, labels.length) }, worker)
      );

      setPlanBuilding(false);
      setFillingDays({});
      if (terminal) throw terminal;
      if (filled === 0) throw new Error("The days came back empty. Try again.");
    } catch(e) {
      setPlanBuilding(false);
      setFillingDays({});
      setItinerary(null);
      setItinError(e.message || "Something went wrong.");
    }
    setLoadingItin(false);
  }

  // Immutable edit of any field inside the itinerary tree.
  function editItinerary(mutate) {
    setItinerary(prev => {
      if (!prev) return prev;
      const next = typeof structuredClone === "function"
        ? structuredClone(prev)
        : JSON.parse(JSON.stringify(prev));
      mutate(next);
      return next;
    });
  }

  async function draftEmail() {
    setLoadingEmail(true);
    const list = emails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    try {
      const result = await callClaude(`Write a bachelorette weekend invite for ${details.brideName||"the bride"} in ${city}. Dates: ${describeDates(details.startDate, details.endDate)||"TBD"}. Guests: ${details.groupSize}. Highlights: ${itinerary?.days?.flatMap(d=>d.timeBlocks?.map(t=>t.venue)).filter(Boolean).slice(0,5).join(", ")||city}. Warm, specific, no filler. Return JSON: { subject, body (HTML) }`);
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

        /* ── INLINE EDITING ── */
        .ed {
          display:inline-block;
          cursor:text;
          border-radius:6px;
          box-decoration-break:clone;
          -webkit-box-decoration-break:clone;
          transition:background 0.12s, box-shadow 0.12s;
        }
        .ed:hover {
          background:rgba(124,58,237,0.08);
          box-shadow:0 0 0 4px rgba(124,58,237,0.08);
        }
        .ed:focus-visible {
          outline:2px solid var(--violet);
          outline-offset:3px;
          background:rgba(124,58,237,0.08);
        }
        .ed-empty { color:var(--muted); font-weight:400; opacity:0.6; }
        .ed-grow { flex:1; }
        .ed-input {
          /* inherit everything so the text doesn't jump when it becomes a field */
          font:inherit;
          font-family:inherit;
          color:inherit;
          letter-spacing:inherit;
          line-height:inherit;
          text-transform:inherit;
          width:100%;
          background:var(--bg);
          border:1.5px solid var(--violet);
          border-radius:8px;
          padding:2px 7px;
          margin:-3px -8px;
          outline:none;
          resize:none;
          overflow:hidden;
          box-shadow:0 0 0 3px rgba(124,58,237,0.12);
        }
        .day-pill .ed:hover { background:rgba(255,255,255,0.18); box-shadow:0 0 0 4px rgba(255,255,255,0.18); }
        .day-pill .ed-input { background:var(--ink); color:#fff; border-color:rgba(255,255,255,0.5); }

        /* ── DATE RANGE PICKER ── */
        .dr-wrap { position:relative; }
        .dr-trigger {
          width:100%; display:flex; align-items:center; gap:0.55rem;
          padding:0.72rem 1rem;
          border:1.5px solid var(--border); border-radius:12px;
          background:var(--bg); color:var(--ink);
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.92rem; font-weight:600;
          cursor:pointer; text-align:left;
          transition:border-color 0.18s, box-shadow 0.18s;
        }
        .dr-trigger:hover { border-color:rgba(124,58,237,0.35); }
        .dr-trigger:focus-visible { outline:none; border-color:var(--violet); box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
        .dr-trigger svg { color:var(--violet); flex-shrink:0; }
        .dr-empty { color:var(--muted); font-weight:400; }
        .dr-empty svg { color:var(--muted); }
        .dr-label { flex:1; }
        .dr-nights {
          font-size:0.72rem; font-weight:700;
          background:rgba(124,58,237,0.08); color:var(--violet);
          border-radius:50px; padding:0.18rem 0.6rem;
        }

        .dr-pop {
          position:absolute; z-index:50;
          top:calc(100% + 0.5rem); left:0;
          width:min(340px, calc(100vw - 2.5rem));
          background:var(--bg);
          border:1.5px solid var(--border); border-radius:18px;
          box-shadow:var(--shadow-lg);
          padding:1rem 1rem 0.85rem;
        }
        .dr-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; }
        .dr-month { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:1rem; letter-spacing:-0.01em; }
        .dr-nav {
          width:30px; height:30px; border-radius:50%;
          border:1.5px solid var(--border); background:var(--bg);
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--ink); transition:all 0.15s;
        }
        .dr-nav:hover:not(:disabled) { border-color:var(--violet); color:var(--violet); }
        .dr-nav:disabled { opacity:0.25; cursor:not-allowed; }

        .dr-dow, .dr-grid { display:grid; grid-template-columns:repeat(7,1fr); }
        .dr-dow { margin-bottom:0.3rem; }
        .dr-dow span {
          text-align:center; font-size:0.65rem; font-weight:700;
          color:var(--muted); letter-spacing:0.04em; padding:0.2rem 0;
        }
        .dr-grid { row-gap:2px; }
        .dr-cell { aspect-ratio:1; border:none; background:transparent; }
        .dr-day {
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.82rem; font-weight:600;
          color:var(--ink); cursor:pointer;
          border-radius:50%;
          transition:background 0.12s, color 0.12s;
          display:flex; align-items:center; justify-content:center;
        }
        .dr-day:hover:not(:disabled):not(.is-start):not(.is-end) { background:rgba(124,58,237,0.1); }
        .dr-day.is-past { color:var(--border); cursor:not-allowed; }
        .dr-day.is-today { text-decoration:underline; text-underline-offset:3px; }
        .dr-day.is-between { background:rgba(124,58,237,0.09); border-radius:0; }
        .dr-day.is-start, .dr-day.is-end {
          background:linear-gradient(135deg,#FF3CAC,#7C3AED);
          color:#fff;
        }
        .dr-day.is-start { border-radius:50% 0 0 50%; }
        .dr-day.is-end { border-radius:0 50% 50% 0; }
        .dr-day.is-start.is-end { border-radius:50%; }

        .dr-foot {
          display:flex; align-items:center; justify-content:space-between; gap:0.5rem;
          margin-top:0.7rem; padding-top:0.7rem;
          border-top:1px solid var(--border);
        }
        .dr-hint { font-size:0.7rem; color:var(--muted); font-weight:500; line-height:1.35; }
        .dr-clear {
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:0.7rem; font-weight:700;
          color:var(--pink); background:none; border:none;
          cursor:pointer; padding:0.2rem 0.1rem; flex-shrink:0;
        }
        .dr-clear:hover { text-decoration:underline; }

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
                  <button key={c} className="dest-chip" onClick={() => startCity(c)}>
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
                  <label className="il">Guests</label>
                  <input className="input" placeholder="e.g. 10 guests" value={details.groupSize} onChange={e => setDetails(p=>({...p,groupSize:e.target.value}))} />
                </div>
              </div>
              <div className="ig">
                <label className="il">Dates</label>
                <DateRangeField
                  startDate={details.startDate}
                  endDate={details.endDate}
                  onChange={({ startDate, endDate }) => setDetails(p => ({ ...p, startDate, endDate }))}
                />
              </div>
              <div className="ig">
                <label className="il">Budget</label>
                <select className="input" value={details.budget} onChange={e => setDetails(p=>({...p,budget:e.target.value}))}>
                  <option value="budget">Keeping it reasonable</option>
                  <option value="moderate">Mid-range</option>
                  <option value="luxe">No ceiling</option>
                </select>
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

              {loadingTabs[activeTab] ? <Spinner /> : filtered(activeTab).length===0 ? (
                <div className="empty">
                  {tabErrors[activeTab] ? (
                    <>
                      <p style={{fontWeight:700,color:"var(--ink)",marginBottom:"0.4rem"}}>
                        Couldn't load {TAB_LABELS[activeTab].toLowerCase()}
                      </p>
                      <p style={{marginBottom:"1.25rem"}}>{tabErrors[activeTab]}</p>
                      <button className="btn btn-grad" onClick={() => {
                        delete inFlightRef.current[activeTab];
                        fetchTab(activeTab, cityRef.current);
                      }}>
                        Try again
                      </button>
                    </>
                  ) : explore[activeTab]?.length > 0 ? (
                    <p>Nothing matches those filters.</p>
                  ) : (
                    <p>No places found here yet.</p>
                  )}
                </div>
              ) : (
                <div className="vgrid">
                  {filtered(activeTab).map((item,i) => {
                    const sel = isSelected(activeTab,item);
                    const size = details.groupSize?.replace(/\D/g,"")||"6";
                    const checkIn = details.startDate || new Date().toISOString().split("T")[0];
                    const checkOut = details.endDate
                      || new Date(new Date(checkIn).getTime()+2*86400000).toISOString().split("T")[0];
                    const url = activeTab==="stay"
                      ? `https://www.booking.com/search.html?ss=${encodeURIComponent(item.name+" "+city)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${size}`
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
              ) : itinError ? (
                <div style={{textAlign:"center",padding:"3rem 1rem"}}>
                  <p style={{fontWeight:700,fontSize:"1.15rem",marginBottom:"0.5rem",color:"var(--ink)"}}>The plan didn't come through</p>
                  <p style={{color:"var(--muted)",fontSize:"0.88rem",marginBottom:"2rem",maxWidth:"380px",marginLeft:"auto",marginRight:"auto",lineHeight:1.6}}>
                    {itinError}
                  </p>
                  <div className="arow" style={{justifyContent:"center"}}>
                    <button className="btn btn-ghost" onClick={()=>setStep("explore")}>
                      <ArrowLeft size={14} strokeWidth={2} /> Edit picks
                    </button>
                    <button className="btn btn-grad" onClick={() => { setItinError(""); setLoadingItin(true); buildItinerary(); }}>
                      Try again
                    </button>
                  </div>
                </div>
              ) : itinerary && (
                <div>
                  <div className="itin-hero">
                    <p className="itin-eyebrow">Your Lorette plan · tap any text to edit</p>
                    <div className="itin-title">
                      <EditableText
                        value={itinerary.title}
                        ariaLabel="Itinerary title"
                        placeholder="Name this weekend"
                        onChange={v => editItinerary(d => { d.title = v; })}
                      />
                    </div>
                  </div>
                  {itinerary.days?.map((day,di) => (
                    <div key={di} className="day-block">
                      <div className="day-pill">
                        <EditableText
                          value={day.dayLabel || `Day ${di+1}`}
                          ariaLabel={`Label for day ${di+1}`}
                          onChange={v => editItinerary(d => { d.days[di].dayLabel = v; })}
                        />
                      </div>
                      {(!day.timeBlocks || day.timeBlocks.length === 0) && (
                        <div style={{
                          display:"flex", alignItems:"center", gap:"0.6rem",
                          padding:"0.85rem 0", color:"var(--muted)", fontSize:"0.82rem",
                        }}>
                          {fillingDays[di] ? (
                            <>
                              <span className="g-spin" style={{width:16,height:16,borderWidth:2}} />
                              <span>Writing this day…</span>
                            </>
                          ) : planBuilding ? (
                            <span>Up next…</span>
                          ) : (
                            <span>Nothing here yet.</span>
                          )}
                        </div>
                      )}
                      {day.timeBlocks?.map((block,bi) => (
                        <div key={bi} className="itin-row">
                          <div className="itin-time">
                            <EditableText
                              value={block.time}
                              ariaLabel="Time"
                              placeholder="Time"
                              onChange={v => editItinerary(d => { d.days[di].timeBlocks[bi].time = v; })}
                            />
                          </div>
                          <div className="itin-dot" />
                          <div className="itin-content">
                            <div className="itin-act">
                              <EditableText
                                value={block.activity}
                                ariaLabel="Activity"
                                placeholder="What's happening"
                                onChange={v => editItinerary(d => { d.days[di].timeBlocks[bi].activity = v; })}
                              />
                            </div>
                            <div className="itin-venue">
                              <EditableText
                                value={block.venue}
                                ariaLabel="Venue"
                                placeholder="Add a place"
                                onChange={v => editItinerary(d => { d.days[di].timeBlocks[bi].venue = v; })}
                              />
                            </div>
                            <div className="itin-note">
                              <EditableText
                                value={block.notes}
                                ariaLabel="Notes"
                                placeholder="Add a note"
                                multiline
                                onChange={v => editItinerary(d => { d.days[di].timeBlocks[bi].notes = v; })}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {itinerary.tips?.length>0 && (
                    <div className="tips-card">
                      <div className="tips-head">Good to know</div>
                      {itinerary.tips.map((tip,i) => (
                        <div key={i} className="tip-row">
                          <span className="tip-dot">—</span>
                          <EditableText
                            value={tip}
                            ariaLabel={`Tip ${i+1}`}
                            placeholder="Add a tip"
                            multiline
                            className="ed-grow"
                            onChange={v => editItinerary(d => { d.tips[i] = v; })}
                          />
                        </div>
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
                    setTabErrors({}); setItinError(""); setActiveTab("dining");
                    // Without this the next trip thinks every tab is already loaded
                    cityRef.current = "";
                    loadedRef.current = {};
                    inFlightRef.current = {};
                    for (const t of TABS) reqIdRef.current[t] = (reqIdRef.current[t] || 0) + 1;
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
