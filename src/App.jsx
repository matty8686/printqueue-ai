import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ── Supabase ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://ubdjtfbjfdguvahehmbr.supabase.co";
const SUPABASE_KEY = "sb_publishable_tmJkU6S_VgLgF03V5J9qiQ_JrVMLdsQ";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Constants ──────────────────────────────────────────────────────────────────
const PURGE_WARN_THRESHOLD = 25;
const LOW_STOCK_THRESHOLD  = 250;
const LS_APIKEY  = "pqai_apikey";
const LS_RECENT  = "pqai_recent_colors_v1";

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "Other"];
const BRANDS    = ["Bambu Lab", "Elegoo", "Overture", "Hatchbox", "eSUN", "Polymaker", "Prusament", "Sunlu", "Amazon Basics", "Other"];

const INITIAL_PRINTERS = [
  { id: 1, name: "Ender 5 Pro", status: "idle", loadedColors: ["#E53E3E"], colorNames: ["Red PLA"], hasToolChanger: false, maxColors: 1, queue: [] },
  { id: 2, name: "Bambu X1C",   status: "idle", loadedColors: ["#2B6CB0","#1A202C","#FFFFFF","#68D391"], colorNames: ["Blue PETG","Black PLA","White PLA","Green PLA"], hasToolChanger: true, maxColors: 4, queue: [] },
  { id: 3, name: "Prusa MK4",   status: "idle", loadedColors: ["#F6E05E","#FFFFFF"], colorNames: ["Yellow PLA","White PLA"], hasToolChanger: false, maxColors: 1, queue: [] },
];

const BLANK_PRINTER  = { name: "", hasToolChanger: false, maxColors: 1, loadedColors: ["#FFFFFF"], colorNames: ["White PLA"], status: "idle", queue: [] };
const BLANK_FILAMENT = { id: null, color: "#FFFFFF", colorName: "White", material: "PLA", brand: "Bambu Lab", totalGrams: 1000 };

const DEFAULT_COLORS = [
  { hex: "#1A202C", name: "Black"  }, { hex: "#FFFFFF", name: "White"  },
  { hex: "#E53E3E", name: "Red"    }, { hex: "#F6AD55", name: "Orange" },
  { hex: "#F6E05E", name: "Yellow" }, { hex: "#68D391", name: "Green"  },
  { hex: "#2B6CB0", name: "Blue"   }, { hex: "#9F7AEA", name: "Purple" },
  { hex: "#F687B3", name: "Pink"   }, { hex: "#A0AEC0", name: "Grey"   },
  { hex: "#C6A96A", name: "Tan"    }, { hex: "#805AD5", name: "Violet" },
];

// ── Global Styles ──────────────────────────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById("pqai-styles")) return;
  const el = document.createElement("style");
  el.id = "pqai-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@400;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0f; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #2a4; border-radius: 2px; }
    .tab-btn { background: none; border: none; cursor: pointer; padding: 8px 10px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #666; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
    .tab-btn.active { color: #2aff6e; border-bottom-color: #2aff6e; }
    .tab-btn:hover:not(.active) { color: #aaa; }
    .chip { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; }
    .btn { border: none; border-radius: 4px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600; padding: 6px 14px; transition: all 0.15s; }
    .btn-green { background: #1a3d2a; color: #2aff6e; border: 1px solid #2aff6e44; }
    .btn-green:hover { background: #2aff6e22; }
    .btn-red { background: #3d1a1a; color: #ff6e6e; border: 1px solid #ff6e6e44; }
    .btn-red:hover { background: #ff6e6e22; }
    .btn-gray { background: #1a1a2a; color: #888; border: 1px solid #333; }
    .btn-gray:hover { background: #2a2a3a; }
    .btn-blue { background: #1a2a3d; color: #00b8ff; border: 1px solid #00b8ff44; }
    .btn-blue:hover { background: #00b8ff22; }
    .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 8px; }
    .printer-card { transition: border-color 0.2s; }
    .printer-card:hover { border-color: #2aff6e44; }
    select { background: #111118; color: #e2e8f0; border: 1px solid #333; border-radius: 4px; padding: 4px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
    input[type=number] { color-scheme: dark; }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    @media(max-width:600px) {
      .tab-btn { padding: 8px 7px; font-size: 11px; }
      .btn { padding: 8px 10px; }
      .hide-mobile { display: none !important; }
    }
  `;
  document.head.appendChild(el);
})();

// ── Utility ────────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
}
function colorDistance(h1, h2) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}
function scorePrinterForJob(printer, jobColors, multiTool, purgeWeightG=null) {
  if (multiTool && !printer.hasToolChanger) return -1;
  if (multiTool && jobColors.length > printer.maxColors) return -1;
  let matched = 0;
  for (const jc of jobColors) {
    if (Math.min(...printer.loadedColors.map(pc => colorDistance(jc,pc))) < 80) matched++;
  }
  const perfectBonus  = (jobColors.length > 0 && matched === jobColors.length) ? 60 : 0;
  const idleBonus     = printer.status === "idle" ? 20 : 0;
  const queuePenalty  = printer.queue.length * 10;
  const purgeIsHigh   = purgeWeightG !== null && purgeWeightG >= PURGE_WARN_THRESHOLD;
  const wastePenalty  = purgeIsHigh && !printer.hasToolChanger ? -20 : 0;
  const purgeBonus    = purgeIsHigh && printer.hasToolChanger  ?  30 : 0;
  const overkill      = !multiTool && jobColors.length === 1 && printer.hasToolChanger ? -5 : 0;
  return Math.max(0, matched*30 + perfectBonus + idleBonus - queuePenalty + wastePenalty + purgeBonus + overkill);
}
function rankPrinters(printers, colors, multiTool, purgeWeightG) {
  return printers
    .map(p => {
      const score = scorePrinterForJob(p, colors, multiTool, purgeWeightG);
      const matchedColors = colors.filter(jc => Math.min(...p.loadedColors.map(pc => colorDistance(jc,pc))) < 80).length;
      return { printer: p, score, matchedColors, perfectMatch: matchedColors === colors.length };
    })
    .filter(s => s.score !== -1)
    .sort((a,b) => b.score - a.score);
}

// ── Shared UI Components ───────────────────────────────────────────────────────
function Modal({ onClose, children, maxWidth=480 }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} className="card"
        style={{width:"100%",maxWidth,padding:"24px 20px",animation:"slideIn 0.2s ease",maxHeight:"92vh",overflowY:"auto"}}>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <div style={{width:28,height:28,border:"3px solid #2aff6e22",borderTopColor:"#2aff6e",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />;
}

// ── Printer Editor Modal ───────────────────────────────────────────────────────
function PrinterModal({ printer, onSave, onClose }) {
  const [form, setForm] = useState({ ...printer, loadedColors:[...printer.loadedColors], colorNames:[...printer.colorNames] });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  function handleMaxColors(val) {
    const n = Math.max(1, parseInt(val)||1);
    const c = [...form.loadedColors], nm = [...form.colorNames];
    while (c.length < n)  { c.push("#AAAAAA"); nm.push(""); }
    while (c.length > n)  { c.pop(); nm.pop(); }
    setForm(f=>({...f, maxColors:n, loadedColors:c, colorNames:nm}));
  }

  const valid = form.name.trim().length > 0;
  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,color:"#fff",marginBottom:20}}>
        {printer.id ? "Edit Printer" : "Add Printer"}
      </div>

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>PRINTER NAME</label>
      <input value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="e.g. Bambu X1C #2"
        style={{width:"100%",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,padding:"8px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,marginBottom:18,outline:"none"}} />

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>COLOR CAPACITY</label>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <input type="number" min="1" max="16" value={form.maxColors} onChange={e=>handleMaxColors(e.target.value)}
          style={{width:70,background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,padding:"8px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}} />
        <span style={{fontSize:12,color:"#555"}}>filament slot{form.maxColors!==1?"s":""}</span>
      </div>

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:10}}>PRINTER TYPE</label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        {[{val:false,icon:"🖨️",label:"Single Tool",sub:"High purge waste"},{val:true,icon:"🔧",label:"Multi-Tool",sub:"Near-zero waste"}].map(o=>(
          <button key={String(o.val)} onClick={()=>sf("hasToolChanger",o.val)}
            style={{background:form.hasToolChanger===o.val?(o.val?"#3d2a1a":"#1a3d2a"):"#0d0d15",border:`2px solid ${form.hasToolChanger===o.val?(o.val?"#ffaa2a":"#2aff6e"):"#2a2a3a"}`,borderRadius:8,padding:"12px 10px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:5}}>{o.icon}</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:form.hasToolChanger===o.val?(o.val?"#ffaa2a":"#2aff6e"):"#aaa"}}>{o.label}</div>
            <div style={{fontSize:10,color:"#555",marginTop:2}}>{o.sub}</div>
          </button>
        ))}
      </div>

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:10}}>LOADED FILAMENTS</label>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
        {form.loadedColors.map((c,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
            <label style={{position:"relative",width:28,height:28,flexShrink:0,cursor:"pointer",display:"block"}}>
              <div style={{width:28,height:28,borderRadius:6,background:c,border:"2px solid #2a2a3a"}} />
              <input type="color" value={c} onChange={e=>{const nc=[...form.loadedColors];nc[i]=e.target.value;sf("loadedColors",nc);}}
                style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}} />
            </label>
            <span style={{fontSize:11,color:"#444",flexShrink:0,width:18}}>T{i+1}</span>
            <input value={form.colorNames[i]} onChange={e=>{const nn=[...form.colorNames];nn[i]=e.target.value;sf("colorNames",nn);}} placeholder="e.g. Black PLA"
              style={{flex:1,background:"#0d0d15",border:"1px solid #1e1e2e",borderRadius:4,padding:"5px 10px",color:"#ccc",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,outline:"none"}} />
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-gray" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-green" style={{flex:2,opacity:valid?1:0.4,cursor:valid?"pointer":"not-allowed"}} onClick={()=>valid&&onSave(form)}>
          {printer.id ? "Save Changes" : "Add Printer"}
        </button>
      </div>
    </Modal>
  );
}

// ── Filament Editor Modal ──────────────────────────────────────────────────────
function FilamentModal({ filament, onSave, onClose }) {
  const [form, setForm] = useState({ ...filament });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const valid = form.colorName.trim().length > 0 && form.totalGrams >= 0;

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,color:"#fff",marginBottom:20}}>
        {filament.id ? "Edit Filament" : "Add Filament"}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div>
          <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>MATERIAL</label>
          <select value={form.material} onChange={e=>sf("material",e.target.value)}
            style={{width:"100%",padding:"8px 10px",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}}>
            {MATERIALS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>BRAND</label>
          <select value={form.brand} onChange={e=>sf("brand",e.target.value)}
            style={{width:"100%",padding:"8px 10px",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}}>
            {BRANDS.map(b=><option key={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>COLOR NAME</label>
      <input value={form.colorName} onChange={e=>sf("colorName",e.target.value)} placeholder="e.g. Jade Green"
        style={{width:"100%",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,padding:"8px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,marginBottom:16,outline:"none"}} />

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>COLOR</label>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <label style={{position:"relative",width:40,height:40,flexShrink:0,cursor:"pointer",display:"block",borderRadius:8,border:"2px solid #2a2a3a"}}>
          <div style={{width:"100%",height:"100%",borderRadius:6,background:form.color}} />
          <input type="color" value={form.color} onChange={e=>sf("color",e.target.value)}
            style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}} />
        </label>
        <span style={{fontSize:12,color:"#666",fontFamily:"monospace"}}>{form.color}</span>
      </div>

      <label style={{fontSize:11,color:"#555",letterSpacing:"0.08em",display:"block",marginBottom:6}}>TOTAL GRAMS ON HAND</label>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
        <input type="number" min="0" max="99999" value={form.totalGrams} onChange={e=>sf("totalGrams",parseInt(e.target.value)||0)}
          style={{width:100,background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,padding:"8px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}} />
        <span style={{fontSize:12,color:"#555"}}>grams</span>
        {form.totalGrams > 0 && form.totalGrams <= LOW_STOCK_THRESHOLD &&
          <span className="chip" style={{background:"#3d2a0a",color:"#fbbf24",border:"1px solid #fbbf2444"}}>⚠ LOW</span>}
        {form.totalGrams === 0 &&
          <span className="chip" style={{background:"#3d1a1a",color:"#ff6e6e",border:"1px solid #ff6e6e44"}}>OUT OF STOCK</span>}
      </div>

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-gray" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-green" style={{flex:2,opacity:valid?1:0.4,cursor:valid?"pointer":"not-allowed"}} onClick={()=>valid&&onSave(form)}>
          {filament.id ? "Save Changes" : "Add Filament"}
        </button>
      </div>
    </Modal>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,animation:"fadeIn 0.4s ease"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,background:"linear-gradient(135deg,#2aff6e,#00b8ff)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px"}}>⬡</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:26,color:"#fff",letterSpacing:"-0.02em"}}>PrintQueue<span style={{color:"#2aff6e"}}>AI</span></div>
          <div style={{fontSize:13,color:"#555",marginTop:6}}>Smart FDM Print Manager</div>
        </div>
        <div className="card" style={{padding:"28px 24px"}}>
          {!sent ? (<>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:16,color:"#fff",marginBottom:6}}>Sign in</div>
            <div style={{fontSize:12,color:"#555",marginBottom:20}}>Enter your email — we'll send a magic link.</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSend()}
              placeholder="your@email.com" autoFocus
              style={{width:"100%",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:6,padding:"10px 14px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:14,outline:"none",marginBottom:12}} />
            {error && <div style={{fontSize:12,color:"#ff6e6e",marginBottom:10}}>{error}</div>}
            <button className="btn btn-green" style={{width:"100%",padding:"10px",fontSize:14,opacity:loading?0.6:1}} onClick={handleSend} disabled={loading}>
              {loading ? "Sending…" : "Send Magic Link →"}
            </button>
          </>) : (
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:12}}>📬</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:16,color:"#fff",marginBottom:8}}>Check your email</div>
              <div style={{fontSize:13,color:"#555",marginBottom:20}}>Sent to <strong style={{color:"#aaa"}}>{email}</strong>. Click the link to sign in.</div>
              <button className="btn btn-gray" style={{fontSize:12}} onClick={()=>{setSent(false);setEmail("");}}>Use a different email</button>
            </div>
          )}
        </div>
        <div style={{textAlign:"center",fontSize:11,color:"#333",marginTop:16}}>Access restricted to authorised users only</div>
      </div>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing,     setSyncing]     = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setSession(session); setAuthLoading(false); });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Spinner />
    </div>
  );
  if (!session) return <LoginScreen />;
  return <AppInner session={session} syncing={syncing} setSyncing={setSyncing} />;
}

// ── App Inner ──────────────────────────────────────────────────────────────────
function AppInner({ session, syncing, setSyncing }) {
  // ── State ──
  const [printers,              setPrinters]              = useState(INITIAL_PRINTERS);
  const [jobs,                  setJobs]                  = useState([]);
  const [inventory,             setInventory]             = useState([]);
  const [loaded,                setLoaded]                = useState(false);
  const [analyzing,             setAnalyzing]             = useState(false);
  const [dragOver,              setDragOver]              = useState(false);
  const [activeTab,             setActiveTab]             = useState("queue");
  const [notification,          setNotification]          = useState(null);
  const [pendingFile,           setPendingFile]           = useState(null);
  const [pendingPreview,        setPendingPreview]        = useState(null);
  const [slicedForMultiTool,    setSlicedForMultiTool]    = useState(null);
  const [editingPrinter,        setEditingPrinter]        = useState(null);
  const [editingFilament,       setEditingFilament]       = useState(null);
  const [confirmDelete,         setConfirmDelete]         = useState(null);
  const [confirmDeleteFilament, setConfirmDeleteFilament] = useState(null);
  const [confirmComplete,       setConfirmComplete]       = useState(null);
  const [editingJob,            setEditingJob]            = useState(null);
  const [dragInfo,              setDragInfo]              = useState(null);
  const [showApiKey,            setShowApiKey]            = useState(false);
  const [invSort,               setInvSort]               = useState("brand");
  const [invFilter,             setInvFilter]             = useState("");
  const [recentColors,          setRecentColors]          = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_RECENT)||"[]"); } catch(_) { return []; }
  });
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(LS_APIKEY)||""; } catch(_) { return ""; }
  });

  const apiKeyRef  = useRef("");
  const fileRef    = useRef();
  const syncTimer  = useRef(null);

  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);

  function saveApiKey(val) {
    apiKeyRef.current = val; setApiKey(val);
    try { localStorage.setItem(LS_APIKEY, val); } catch(_) {}
  }

  // ── Cloud Load ──
  useEffect(() => {
    async function load() {
      setSyncing(true);
      try {
        const uid = session.user.id;
        const [{ data: pd }, { data: jd }, { data: id }] = await Promise.all([
          supabase.from("printers").select("id,data").eq("user_id", uid),
          supabase.from("jobs").select("id,data").eq("user_id", uid),
          supabase.from("inventory").select("id,data").eq("user_id", uid),
        ]);
        if (pd?.length) setPrinters(pd.map(r=>r.data));
        if (jd?.length) setJobs(jd.map(r=>r.data));
        if (id?.length) setInventory(id.map(r=>r.data));
      } catch(e) { console.error("Load error:", e); }
      setSyncing(false);
      setLoaded(true);
    }
    load();
  }, [session]);

  // ── Cloud Sync ──
  const syncToCloud = useCallback(async (p, j, inv) => {
    if (!loaded) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const uid = session.user.id;
        const ops = [];
        if (p.length)   ops.push(supabase.from("printers").upsert(p.map(x=>({id:x.id,user_id:uid,data:x})),{onConflict:"id"}));
        if (j.length)   ops.push(supabase.from("jobs").upsert(j.map(x=>({id:x.id,user_id:uid,data:x})),{onConflict:"id"}));
        if (inv.length) ops.push(supabase.from("inventory").upsert(inv.map(x=>({id:x.id,user_id:uid,data:x})),{onConflict:"id"}));
        // Delete removed records
        if (p.length)   ops.push(supabase.from("printers").delete().eq("user_id",uid).not("id","in",`(${p.map(x=>x.id).join(",")})`));
        if (j.length)   ops.push(supabase.from("jobs").delete().eq("user_id",uid).not("id","in",`(${j.map(x=>x.id).join(",")})`));
        else            ops.push(supabase.from("jobs").delete().eq("user_id",uid));
        if (inv.length) ops.push(supabase.from("inventory").delete().eq("user_id",uid).not("id","in",`(${inv.map(x=>x.id).join(",")})`));
        else            ops.push(supabase.from("inventory").delete().eq("user_id",uid));
        await Promise.all(ops);
      } catch(e) { console.error("Sync error:", e); }
      setSyncing(false);
    }, 1500);
  }, [loaded, session]);

  useEffect(() => { if (loaded) syncToCloud(printers, jobs, inventory); }, [printers, jobs, inventory, loaded]);

  // ── Notifications ──
  function showNotif(msg, type="success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  }

  // ── Recent Colors ──
  function trackRecentColor(hex) {
    setRecentColors(prev => {
      const next = [hex, ...prev.filter(c=>c!==hex)].slice(0,12);
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)); } catch(_) {}
      return next;
    });
  }

  // ── Printer CRUD ──
  function savePrinter(form) {
    if (form.id) {
      setPrinters(prev => prev.map(p => p.id===form.id ? {...form} : p));
      showNotif(`"${form.name}" updated`);
    } else {
      const np = { ...form, id: Date.now(), queue: [], status: "idle" };
      setPrinters(prev => [...prev, np]);
      showNotif(`"${np.name}" added`);
    }
    setEditingPrinter(null);
  }
  function deletePrinter(id) {
    const p = printers.find(p=>p.id===id);
    setPrinters(prev => prev.filter(p=>p.id!==id));
    setJobs(prev => prev.map(j => j.assignedPrinterId===id ? {...j,assignedPrinterId:null} : j));
    setConfirmDelete(null);
    showNotif(`"${p?.name}" removed`, "warn");
  }
  function togglePrinterStatus(id) {
    setPrinters(prev => prev.map(p => p.id===id ? {...p, status: p.status==="idle"?"printing":"idle"} : p));
  }

  // ── Inventory CRUD ──
  function saveFilament(form) {
    if (form.id) {
      setInventory(prev => prev.map(f => f.id===form.id ? {...form} : f));
      showNotif(`"${form.brand} ${form.colorName} ${form.material}" updated`);
    } else {
      const nf = { ...form, id: Date.now() };
      setInventory(prev => [...prev, nf]);
      showNotif(`Added ${nf.totalGrams}g of ${nf.brand} ${nf.colorName} ${nf.material}`);
    }
    setEditingFilament(null);
  }
  function deleteFilament(id) {
    setInventory(prev => prev.filter(f=>f.id!==id));
    setConfirmDeleteFilament(null);
    showNotif("Filament removed", "warn");
  }
  function deductFilamentUsage(job) {
    const total = job.totalGrams || 0;
    if (total <= 0 || !job.colors?.length) return;
    const perColor = Math.round(total / job.colors.length);
    setInventory(prev => {
      const updated = [...prev];
      job.colors.forEach(jc => {
        let bestIdx=-1, bestDist=Infinity;
        updated.forEach((f,i) => { const d=colorDistance(jc,f.color); if(d<bestDist){bestDist=d;bestIdx=i;} });
        if (bestIdx>=0 && bestDist<120)
          updated[bestIdx] = {...updated[bestIdx], totalGrams: Math.max(0, updated[bestIdx].totalGrams - perColor)};
      });
      return updated;
    });
  }

  // ── Job Operations ──
  function removeJob(jobId) {
    setJobs(prev => prev.filter(j=>j.id!==jobId));
    setPrinters(prev => prev.map(p => ({...p, queue: p.queue.filter(id=>id!==jobId)})));
  }
  function selectPrinterForJob(jobId, printerId) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, assignedPrinterId: printerId?parseInt(printerId):null} : j));
  }
  function addJobToQueue(jobId) {
    const job = jobs.find(j=>j.id===jobId);
    if (!job || !job.assignedPrinterId) return;
    setPrinters(prev => prev.map(p => p.id===job.assignedPrinterId ? {...p, queue:[...p.queue,jobId]} : p));
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"queued"} : j));
    job.colors.forEach(trackRecentColor);
    const printer = printers.find(p=>p.id===job.assignedPrinterId);
    showNotif(`"${job.partName}" added to ${printer?.name||"printer"} queue`);
  }
  function unqueueJob(jobId) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"pending", assignedPrinterId:null} : j));
    showNotif("Job moved back to To Be Assigned", "warn");
  }
  function completeJob(jobId) { setConfirmComplete(jobId); }
  function confirmCompleteJob() {
    const jobId = confirmComplete;
    const job = jobs.find(j=>j.id===jobId);
    setPrinters(prev => prev.map(p => ({...p, queue: p.queue.filter(id=>id!==jobId)})));
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"done"} : j));
    if (job) deductFilamentUsage(job);
    showNotif(`"${job?.partName}" marked complete ✓`);
    setConfirmComplete(null);
  }
  function updateJobField(jobId, field, value) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, [field]:value} : j));
  }
  function updateJobColors(jobId, newColors) {
    setJobs(prev => prev.map(j => j.id!==jobId ? j : {
      ...j, colors: newColors, colorCount: newColors.length,
      highPurge: j.purgeWeightG!==null && j.purgeWeightG>=PURGE_WARN_THRESHOLD,
    }));
  }

  // ── Drag & Drop ──
  function dragStart(jobId, fromPrinterId) { setDragInfo({jobId, fromPrinterId}); }
  function dropOnPrinter(toPrinterId) {
    if (!dragInfo || dragInfo.fromPrinterId===toPrinterId) { setDragInfo(null); return; }
    const { jobId, fromPrinterId } = dragInfo;
    setPrinters(prev => prev.map(p => {
      if (p.id===fromPrinterId) return {...p, queue: p.queue.filter(id=>id!==jobId)};
      if (p.id===toPrinterId)   return {...p, queue: [...p.queue, jobId]};
      return p;
    }));
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, assignedPrinterId: toPrinterId} : j));
    const tp = printers.find(p=>p.id===toPrinterId);
    showNotif(`Moved to ${tp?.name}`);
    setDragInfo(null);
  }

  // ── File Handling ──
  function setFileForPreview(file) {
    setPendingFile(file); setSlicedForMultiTool(null);
    const reader = new FileReader();
    reader.onload  = e => setPendingPreview(e.target.result);
    reader.onerror = () => setPendingPreview(null);
    reader.readAsDataURL(file);
  }
  function handleFiles(files) {
    const imgs = [...files].filter(f=>f.type.startsWith("image/"));
    if (imgs.length) setFileForPreview(imgs[0]);
  }
  useEffect(() => {
    function onPaste(e) {
      if (analyzing || pendingFile) return;
      const item = [...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (file) setFileForPreview(new File([file], `paste-${Date.now()}.png`, {type:file.type}));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [analyzing, pendingFile]);

  // ── Image Analysis ──
  async function analyzeImage(file, multiTool) {
    setAnalyzing(true); setPendingFile(null); setPendingPreview(null); setSlicedForMultiTool(null);
    try {
      const base64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const prompt = `Analyze this 3D slicer screenshot. Sliced for a ${multiTool?"MULTI-TOOL":"SINGLE-TOOL"} printer.
Extract:
1. All filament colors visible (as hex codes)
2. Print time if visible (e.g. "4h 23m"), or null
3. Part name or filename, or a short description
4. Color count — for single-tool always return 1
5. Total filament used in grams (sum the "Total" column for all filaments), or null if not visible
6. Total purge weight in grams (sum the "Purged" column), or null if not visible

Respond ONLY in valid JSON, no markdown:
{"colors":["#hex"],"printTime":"Xh Ym or null","partName":"string","colorCount":number,"totalGrams":number or null,"purgeWeightG":number or null,"notes":"string"}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyRef.current||""}`;
      const res = await fetch(url, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ contents:[{parts:[{inline_data:{mime_type:file.type||"image/png",data:base64}},{text:prompt}]}], generationConfig:{temperature:0.1} })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(`Gemini API error: ${data.error?.message||res.statusText}`);
      const text = data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
      if (!text) throw new Error("Empty response from Gemini");
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g,"").trim()); }
      catch { throw new Error(`Could not parse AI response: ${text.slice(0,200)}`); }

      const colorCount   = multiTool ? (parsed.colorCount||parsed.colors?.length||1) : 1;
      const colors       = multiTool ? (parsed.colors||["#888888"]) : [parsed.colors?.[0]||"#888888"];
      const purgeWeightG = typeof parsed.purgeWeightG === "number" ? Math.round(parsed.purgeWeightG*10)/10 : null;
      const totalGrams   = typeof parsed.totalGrams   === "number" ? Math.round(parsed.totalGrams)         : null;

      const newJob = {
        id: Date.now(), fileName: file.name,
        partName: parsed.partName||file.name, colors, colorCount,
        printTime: parsed.printTime||"Unknown",
        purgeWeightG, highPurge: purgeWeightG!==null && purgeWeightG>=PURGE_WARN_THRESHOLD,
        totalGrams, notes: parsed.notes||"",
        assignedPrinterId: null, slicedForMultiTool: multiTool,
        status: "pending",
        imageUrl: `data:${file.type||"image/png"};base64,${base64}`,
        addedAt: new Date().toLocaleTimeString(),
      };
      setJobs(prev => [...prev, newJob]);
      showNotif(`"${newJob.partName}" analyzed — review & add to queue`);
    } catch(e) {
      console.error(e);
      showNotif(`Analysis failed: ${e?.message||"unknown error"}`, "error");
    } finally { setAnalyzing(false); }
  }

  // ── Derived State ──
  const pendingJobs = jobs.filter(j=>j.status==="pending");
  const queuedJobs  = jobs.filter(j=>j.status==="queued");
  const doneJobs    = jobs.filter(j=>j.status==="done");
  const allJobs     = jobs.filter(j=>j.status==="pending"||j.status==="queued");

  // ── Color Editor inline component ──
  function ColorEditor({ colors, onChange, compact=false }) {
    const sz = compact ? 16 : 20;
    return (
      <div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:compact?4:8}}>
          {colors.map((c,ci)=>(
            <label key={ci} style={{position:"relative",cursor:"pointer",display:"flex",alignItems:"center",gap:3,background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:5,padding:compact?"2px 4px 2px 3px":"3px 6px 3px 4px"}}>
              <div style={{width:sz,height:sz,borderRadius:4,background:c,flexShrink:0}} />
              {!compact && <span style={{fontSize:10,color:"#666",fontFamily:"monospace"}}>{c}</span>}
              <input type="color" value={c} onChange={e=>{const u=[...colors];u[ci]=e.target.value;onChange(u);}}
                style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}} />
              {colors.length>1 && <span onClick={e=>{e.preventDefault();onChange(colors.filter((_,i)=>i!==ci));}}
                style={{color:"#555",cursor:"pointer",fontSize:11,padding:"0 2px",zIndex:1}}>×</span>}
            </label>
          ))}
          <button onClick={()=>onChange([...colors,"#888888"])}
            style={{background:"#1a1a2a",border:"1px dashed #333",borderRadius:5,color:"#555",cursor:"pointer",fontSize:12,width:sz+8,height:sz+8,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        </div>
        {!compact && (<>
          <div style={{fontSize:10,color:"#444",marginBottom:4}}>QUICK ADD</div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:recentColors.length>0?6:0}}>
            {DEFAULT_COLORS.map(dc=>(
              <div key={dc.hex} title={dc.name} onClick={()=>{if(!colors.includes(dc.hex))onChange([...colors,dc.hex]);}}
                style={{width:18,height:18,borderRadius:3,background:dc.hex,border:colors.includes(dc.hex)?"2px solid #2aff6e":"1px solid #ffffff22",cursor:"pointer",opacity:colors.includes(dc.hex)?0.4:1}} />
            ))}
          </div>
          {recentColors.length>0 && (<>
            <div style={{fontSize:10,color:"#444",marginBottom:4}}>RECENTLY USED</div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {recentColors.map(rc=>(
                <div key={rc} title={rc} onClick={()=>{if(!colors.includes(rc))onChange([...colors,rc]);}}
                  style={{width:18,height:18,borderRadius:3,background:rc,border:colors.includes(rc)?"2px solid #2aff6e":"2px solid #ffaa2a44",cursor:"pointer",opacity:colors.includes(rc)?0.4:1}} />
              ))}
            </div>
          </>)}
        </>)}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'IBM Plex Mono',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0"}}>

      {/* ── Header ── */}
      <div style={{background:"#0d0d15",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#2aff6e,#00b8ff)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>⬡</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",letterSpacing:"-0.02em"}}>PrintQueue<span style={{color:"#2aff6e"}}>AI</span></div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {syncing  && <span style={{fontSize:10,color:"#2aff6e",animation:"pulse 1s infinite"}}>syncing…</span>}
          {!syncing && loaded && <span style={{fontSize:10,color:"#2a4a2a"}}>☁ synced</span>}
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:apiKey?"#2aff6e":"#ff6e6e"}} />
            <button className="btn btn-gray" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>setShowApiKey(v=>!v)}>
              {apiKey?"API key ✓":"Set API key"}
            </button>
          </div>
          <button className="btn btn-gray" style={{fontSize:10,padding:"3px 8px"}}
            onClick={async()=>{ if(window.confirm("Sign out?")) await supabase.auth.signOut(); }}>Sign out</button>
        </div>
      </div>

      {/* ── API Key Bar ── */}
      {showApiKey && (
        <div style={{background:"#0d0d15",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#555",flexShrink:0}}>Gemini API Key:</span>
          <input type="password" value={apiKey} onChange={e=>saveApiKey(e.target.value)} placeholder="AIza..."
            style={{flex:1,minWidth:180,maxWidth:380,background:"#111118",border:"1px solid #2a2a3a",borderRadius:6,padding:"6px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}} />
          <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setShowApiKey(false)}>Done</button>
        </div>
      )}

      {/* ── Modals ── */}
      {editingPrinter  && <PrinterModal  printer={editingPrinter}   onSave={savePrinter}  onClose={()=>setEditingPrinter(null)}  />}
      {editingFilament && <FilamentModal filament={editingFilament} onSave={saveFilament} onClose={()=>setEditingFilament(null)} />}

      {confirmDelete && (
        <Modal onClose={()=>setConfirmDelete(null)} maxWidth={360}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",marginBottom:8}}>Remove Printer?</div>
          <div style={{fontSize:13,color:"#888",marginBottom:20}}>"{printers.find(p=>p.id===confirmDelete)?.name}" will be removed.</div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-gray" style={{flex:1}} onClick={()=>setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-red"  style={{flex:1}} onClick={()=>deletePrinter(confirmDelete)}>Remove</button>
          </div>
        </Modal>
      )}

      {confirmDeleteFilament && (
        <Modal onClose={()=>setConfirmDeleteFilament(null)} maxWidth={360}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",marginBottom:8}}>Remove Filament?</div>
          <div style={{fontSize:13,color:"#888",marginBottom:20}}>
            "{inventory.find(f=>f.id===confirmDeleteFilament)?.brand} {inventory.find(f=>f.id===confirmDeleteFilament)?.colorName}" will be removed.
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-gray" style={{flex:1}} onClick={()=>setConfirmDeleteFilament(null)}>Cancel</button>
            <button className="btn btn-red"  style={{flex:1}} onClick={()=>deleteFilament(confirmDeleteFilament)}>Remove</button>
          </div>
        </Modal>
      )}

      {confirmComplete && (()=>{
        const job = jobs.find(j=>j.id===confirmComplete);
        return (
          <Modal onClose={()=>setConfirmComplete(null)} maxWidth={360}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",marginBottom:8}}>Mark as Complete?</div>
            <div style={{fontSize:13,color:"#888",marginBottom:6}}><span style={{color:"#fff"}}>"{job?.partName}"</span> will be removed from the queue.</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:20}}>
              {job?.colors?.map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:3,background:c,border:"1px solid #ffffff22"}} />)}
              {job?.printTime && <span style={{fontSize:12,color:"#555",marginLeft:4}}>🕐 {job.printTime}</span>}
              {job?.totalGrams && <span style={{fontSize:12,color:"#555"}}>· {job.totalGrams}g used</span>}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-gray"  style={{flex:1}} onClick={()=>setConfirmComplete(null)}>Cancel</button>
              <button className="btn btn-green" style={{flex:2}} onClick={confirmCompleteJob}>✓ Mark Complete</button>
            </div>
          </Modal>
        );
      })()}

      {pendingFile && !analyzing && (
        <Modal onClose={()=>{setPendingFile(null);setPendingPreview(null);setSlicedForMultiTool(null);}} maxWidth={420}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,color:"#fff",marginBottom:4}}>How was this sliced?</div>
          <div style={{fontSize:12,color:"#555",marginBottom:14}}>{pendingFile.name}</div>
          {pendingPreview && <img src={pendingPreview} alt="" style={{width:"100%",height:130,objectFit:"cover",borderRadius:6,border:"1px solid #2a2a3a",marginBottom:16}} />}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[{val:false,icon:"🖨️",label:"Single Tool",sub:"One extruder"},{val:true,icon:"🔧",label:"Multi-Tool",sub:"Tool changer / MMU"}].map(o=>(
              <button key={String(o.val)} onClick={()=>setSlicedForMultiTool(o.val)}
                style={{background:slicedForMultiTool===o.val?(o.val?"#3d2a1a":"#1a3d2a"):"#111118",border:`2px solid ${slicedForMultiTool===o.val?(o.val?"#ffaa2a":"#2aff6e"):"#2a2a3a"}`,borderRadius:8,padding:"12px 10px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:5}}>{o.icon}</div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:slicedForMultiTool===o.val?(o.val?"#ffaa2a":"#2aff6e"):"#ccc"}}>{o.label}</div>
                <div style={{fontSize:11,color:"#555",marginTop:2}}>{o.sub}</div>
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-gray"  style={{flex:1}} onClick={()=>{setPendingFile(null);setPendingPreview(null);setSlicedForMultiTool(null);}}>Cancel</button>
            <button className="btn btn-green" style={{flex:2,opacity:slicedForMultiTool===null?0.4:1,cursor:slicedForMultiTool===null?"not-allowed":"pointer"}}
              onClick={()=>slicedForMultiTool!==null&&analyzeImage(pendingFile,slicedForMultiTool)}>Analyze →</button>
          </div>
        </Modal>
      )}

      {notification && (
        <div style={{position:"fixed",top:16,right:16,zIndex:400,padding:"12px 18px",borderRadius:8,animation:"slideIn 0.3s ease",maxWidth:300,fontSize:12,
          background:notification.type==="success"?"#1a3d2a":notification.type==="warn"?"#3d3d1a":"#3d1a1a",
          border:`1px solid ${notification.type==="success"?"#2aff6e44":notification.type==="warn"?"#ffdd6e44":"#ff6e6e44"}`,
          color:notification.type==="success"?"#2aff6e":notification.type==="warn"?"#ffdd6e":"#ff6e6e"}}>
          {notification.msg}
        </div>
      )}

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 12px"}}>

        {/* ── Upload Zone ── */}
        <div onClick={()=>!analyzing&&fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles([...e.dataTransfer.files]);}}
          style={{border:`2px dashed ${dragOver?"#2aff6e":analyzing?"#00b8ff":"#2a2a3a"}`,borderRadius:10,padding:"22px 16px",textAlign:"center",cursor:analyzing?"default":"pointer",background:dragOver?"#0d2a1a":"transparent",transition:"all 0.2s",marginBottom:18}}>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFiles([...e.target.files])} />
          {analyzing ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
              <Spinner />
              <div style={{color:"#00b8ff",fontSize:13}}>Analyzing screenshot…</div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:26,marginBottom:6}}>📸</div>
              <div style={{color:"#ccc",fontSize:13,fontFamily:"'Space Grotesk',sans-serif",fontWeight:600}}>Drop slicer screenshot</div>
              <div style={{color:"#555",fontSize:11,marginTop:3}}>or click to browse · <kbd style={{background:"#1e1e2e",border:"1px solid #333",borderRadius:3,padding:"1px 5px",fontSize:10,color:"#888"}}>Ctrl+V</kbd> to paste</div>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div style={{borderBottom:"1px solid #1e1e2e",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",overflowX:"auto"}}>
          <div style={{display:"flex"}}>
            {[
              {id:"queue",     label:`Queue (${allJobs.length})`},
              {id:"printers",  label:`Printers (${printers.length})`},
              {id:"inventory", label:`Inventory (${inventory.length})`},
              {id:"completed", label:`Done (${doneJobs.length})`},
            ].map(t=>(
              <button key={t.id} className={`tab-btn ${activeTab===t.id?"active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {activeTab==="printers"  && <button className="btn btn-green" style={{fontSize:11,padding:"3px 10px"}} onClick={()=>setEditingPrinter({...BLANK_PRINTER})}>+ Add</button>}
            {activeTab==="inventory" && <button className="btn btn-green" style={{fontSize:11,padding:"3px 10px"}} onClick={()=>setEditingFilament({...BLANK_FILAMENT})}>+ Add</button>}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            QUEUE TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab==="queue" && (
          <div>
            {allJobs.length===0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
                <div style={{fontSize:36,marginBottom:10}}>🖨️</div>
                <div style={{fontSize:13}}>No jobs yet. Upload a slicer screenshot to start.</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

                {/* Pending jobs */}
                {pendingJobs.length>0 && (
                  <div>
                    <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:10}}>PENDING — REVIEW & ADD TO QUEUE</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {pendingJobs.map(job=>{
                        const ranked     = rankPrinters(printers, job.colors, job.slicedForMultiTool, job.purgeWeightG);
                        const recommended = ranked[0]?.printer || null;
                        const selPrinter  = printers.find(p=>p.id===job.assignedPrinterId);
                        return (
                          <div key={job.id} className="card" style={{padding:"14px 16px",border:"1px solid #2a3a2a"}}>
                            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                              {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:72,height:54,objectFit:"cover",borderRadius:5,border:"1px solid #2a2a3a",flexShrink:0}} />}
                              <div style={{flex:1,minWidth:0}}>
                                {/* Title */}
                                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:5}}>
                                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:14,color:"#fff"}}>{job.partName}</span>
                                  <span className="chip" style={{background:job.slicedForMultiTool?"#2a1a3d":"#1a2a1a",color:job.slicedForMultiTool?"#c084fc":"#4ade80",border:`1px solid ${job.slicedForMultiTool?"#c084fc44":"#4ade8044"}`}}>
                                    {job.slicedForMultiTool?"🔧 MULTI":"🖨️ SINGLE"}
                                  </span>
                                  {job.highPurge && selPrinter && !selPrinter.hasToolChanger &&
                                    <span className="chip" style={{background:"#3d2a0a",color:"#fbbf24",border:"1px solid #fbbf2444"}}>⚠ {job.purgeWeightG}g PURGE</span>}
                                </div>
                                {/* Stats */}
                                <div style={{display:"flex",gap:12,fontSize:11,color:"#666",flexWrap:"wrap",marginBottom:10}}>
                                  <span>🕐 {job.printTime}</span>
                                  {job.totalGrams!=null   && <span>🧵 {job.totalGrams}g total</span>}
                                  {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#fbbf24":"#666"}}>🗑 {job.purgeWeightG}g purge{job.highPurge?" ⚠":""}</span>}
                                  <span style={{color:"#444"}}>{job.addedAt}</span>
                                </div>
                                {/* Colors */}
                                <div style={{marginBottom:12}}>
                                  <div style={{fontSize:10,color:"#555",marginBottom:6,letterSpacing:"0.05em"}}>COLORS</div>
                                  <ColorEditor colors={job.colors} onChange={c=>updateJobColors(job.id,c)} />
                                </div>
                                {/* Printer Picker */}
                                <div style={{marginBottom:12}}>
                                  <div style={{fontSize:10,color:"#555",marginBottom:6,letterSpacing:"0.05em"}}>SELECT PRINTER</div>
                                  {recommended && (
                                    <div style={{fontSize:11,color:"#2aff6e",marginBottom:6}}>
                                      ★ Recommended: <strong>{recommended.name}</strong>
                                      {ranked[0]?.perfectMatch && <span className="chip" style={{background:"#0a2a1a",color:"#34d399",border:"1px solid #34d39944",marginLeft:6}}>✓ ALL COLORS LOADED</span>}
                                    </div>
                                  )}
                                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                                    {ranked.map((r,ri)=>{
                                      const isSel = job.assignedPrinterId===r.printer.id;
                                      const isRec = recommended?.id===r.printer.id;
                                      return (
                                        <div key={r.printer.id} onClick={()=>selectPrinterForJob(job.id, r.printer.id)}
                                          style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,border:`1px solid ${isSel?"#2aff6e":"#1e1e2e"}`,background:isSel?"#0d2a1a":"#0d0d15",cursor:"pointer"}}>
                                          <div style={{width:13,height:13,borderRadius:"50%",border:`2px solid ${isSel?"#2aff6e":"#333"}`,background:isSel?"#2aff6e":"transparent",flexShrink:0}} />
                                          <span style={{fontSize:12,color:isSel?"#fff":"#aaa",flex:1}}>
                                            {isRec?"★ ":`${ri+1}. `}{r.printer.name}{r.printer.hasToolChanger?" 🔧":""}
                                          </span>
                                          <div style={{display:"flex",gap:3}}>
                                            {r.printer.loadedColors.map((lc,li)=>{
                                              const match = job.colors.some(jc=>colorDistance(jc,lc)<80);
                                              return <div key={li} style={{width:10,height:10,borderRadius:2,background:lc,border:`1px solid ${match?"#2aff6e88":"#ffffff11"}`,boxShadow:match?"0 0 4px #2aff6e44":"none"}} />;
                                            })}
                                          </div>
                                          <span style={{fontSize:10,color:"#555"}}>{r.matchedColors}/{job.colors.length} match</span>
                                          {r.perfectMatch && <span style={{fontSize:10,color:"#34d399"}}>✓</span>}
                                          <span style={{fontSize:10,color:r.printer.status==="idle"?"#555":"#ffaa2a"}}>{r.printer.status}</span>
                                        </div>
                                      );
                                    })}
                                    {ranked.length===0 && <div style={{fontSize:12,color:"#555",fontStyle:"italic"}}>No compatible printers found</div>}
                                  </div>
                                </div>
                                {/* Actions */}
                                <div style={{display:"flex",gap:8}}>
                                  <button className="btn btn-green" style={{opacity:job.assignedPrinterId?1:0.4,cursor:job.assignedPrinterId?"pointer":"not-allowed"}}
                                    onClick={()=>job.assignedPrinterId&&addJobToQueue(job.id)}>+ Add to Queue</button>
                                  <button className="btn btn-red" style={{marginLeft:"auto"}} onClick={()=>removeJob(job.id)}>Discard</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Queued jobs */}
                {queuedJobs.length>0 && (()=>{
                  const unassigned = queuedJobs.filter(j=>!j.assignedPrinterId);
                  const assigned   = queuedJobs.filter(j=> j.assignedPrinterId);
                  const JobCard = ({job, showUnqueue}) => {
                    const printer   = printers.find(p=>p.id===job.assignedPrinterId);
                    const isEditing = editingJob===job.id;
                    return (
                      <div className="card" style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                        {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:56,height:42,objectFit:"cover",borderRadius:4,border:"1px solid #2a2a3a",flexShrink:0}} />}
                        <div style={{flex:1,minWidth:0}}>
                          {isEditing ? (
                            <input value={job.partName} onChange={e=>updateJobField(job.id,"partName",e.target.value)}
                              style={{width:"100%",background:"#0d0d15",border:"1px solid #2aff6e44",borderRadius:4,padding:"4px 8px",color:"#fff",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,outline:"none",marginBottom:6}} />
                          ) : (
                            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#fff"}}>{job.partName}</span>
                              {printer && <span style={{fontSize:11,color:"#2aff6e"}}>→ {printer.name}</span>}
                              {job.highPurge && printer && !printer.hasToolChanger &&
                                <span className="chip" style={{background:"#3d2a0a",color:"#fbbf24",border:"1px solid #fbbf2444"}}>⚠ {job.purgeWeightG}g PURGE</span>}
                            </div>
                          )}
                          <div style={{display:"flex",gap:10,fontSize:11,color:"#555",flexWrap:"wrap",marginBottom:6}}>
                            {isEditing
                              ? <input value={job.printTime} onChange={e=>updateJobField(job.id,"printTime",e.target.value)}
                                  style={{background:"#0d0d15",border:"1px solid #333",borderRadius:3,padding:"2px 6px",color:"#aaa",fontFamily:"inherit",fontSize:11,outline:"none",width:80}} />
                              : <span>🕐 {job.printTime}</span>}
                            {job.totalGrams!=null   && <span>🧵 {job.totalGrams}g</span>}
                            {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#fbbf2488":"#555"}}>🗑 {job.purgeWeightG}g purge</span>}
                          </div>
                          {isEditing
                            ? <div style={{marginBottom:8}}><ColorEditor colors={job.colors} onChange={c=>updateJobColors(job.id,c)} compact /></div>
                            : <div style={{display:"flex",gap:3,marginBottom:6}}>{job.colors.map((c,ci)=><div key={ci} style={{width:13,height:13,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}</div>}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <button className="btn btn-gray" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>setEditingJob(isEditing?null:job.id)}>
                              {isEditing?"Done":"Edit"}
                            </button>
                            {showUnqueue && <button className="btn btn-gray" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>unqueueJob(job.id)}>↑ Unassign</button>}
                            <button className="btn btn-red" style={{fontSize:10,padding:"2px 8px",marginLeft:"auto"}} onClick={()=>removeJob(job.id)}>Remove</button>
                          </div>
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      {unassigned.length>0 && (
                        <div>
                          <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:8}}>TO BE ASSIGNED</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>{unassigned.map(j=><JobCard key={j.id} job={j} showUnqueue={false}/>)}</div>
                        </div>
                      )}
                      {assigned.length>0 && (
                        <div>
                          <div style={{fontSize:11,color:"#2aff6e88",letterSpacing:"0.08em",marginBottom:8}}>ASSIGNED TO PRINTER</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>{assigned.map(j=><JobCard key={j.id} job={j} showUnqueue={true}/>)}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            PRINTERS TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab==="printers" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
            {printers.map(printer=>{
              const printerJobs = jobs.filter(j=>printer.queue.includes(j.id));
              return (
                <div key={printer.id} className="card printer-card" style={{padding:"14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,color:"#fff"}}>{printer.name}</div>
                      <div style={{fontSize:11,color:"#555",marginTop:2}}>
                        {printer.hasToolChanger
                          ? <span style={{color:"#ffaa2a"}}>🔧 Multi-tool · {printer.maxColors} slots</span>
                          : <span>🖨️ Single tool</span>}
                        <span> · {printer.queue.length} queued</span>
                      </div>
                    </div>
                    <button className={`btn ${printer.status==="idle"?"btn-gray":"btn-green"}`}
                      onClick={()=>togglePrinterStatus(printer.id)} style={{fontSize:10,padding:"3px 8px",flexShrink:0}}>
                      {printer.status==="idle"?"● IDLE":"▶ PRINTING"}
                    </button>
                  </div>
                  {/* Loaded filaments */}
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,color:"#555",marginBottom:5,letterSpacing:"0.08em"}}>LOADED FILAMENTS</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {printer.loadedColors.map((c,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:4,padding:"2px 7px"}}>
                          <div style={{width:9,height:9,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />
                          <span style={{fontSize:10,color:"#aaa"}}>{printer.colorNames[i]||`T${i+1}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Queue with drag-drop */}
                  <div style={{marginBottom:10}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();dropOnPrinter(printer.id);}}>
                    <div style={{fontSize:10,color:"#555",marginBottom:5,letterSpacing:"0.08em"}}>
                      QUEUE {printerJobs.length===0&&dragInfo?<span style={{color:"#2aff6e44"}}>— drop here</span>:""}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3,minHeight:20}}>
                      {printerJobs.map((job,i)=>(
                        <div key={job.id} draggable onDragStart={()=>dragStart(job.id,printer.id)} onDragEnd={()=>setDragInfo(null)}
                          style={{background:dragInfo?.jobId===job.id?"#1a2a1a":"#0d0d15",border:`1px solid ${dragInfo?.jobId===job.id?"#2aff6e44":"#1e1e2e"}`,borderRadius:4,padding:"5px 8px",display:"flex",alignItems:"center",gap:6,cursor:"grab",userSelect:"none"}}>
                          <div title="Mark complete" onClick={e=>{e.stopPropagation();completeJob(job.id);}}
                            style={{width:14,height:14,borderRadius:3,border:"1.5px solid #333",flexShrink:0,cursor:"pointer"}}
                            onMouseEnter={e=>e.currentTarget.style.borderColor="#2aff6e"}
                            onMouseLeave={e=>e.currentTarget.style.borderColor="#333"} />
                          <span style={{fontSize:11,color:i===0?"#2aff6e":"#aaa",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            <span style={{color:"#444",marginRight:3}}>⠿</span>{i===0?"▶ ":`${i+1}. `}{job.partName}
                          </span>
                          <div style={{display:"flex",gap:3,flexShrink:0}}>
                            {job.colors.map((c,ci)=><div key={ci} style={{width:9,height:9,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}
                          </div>
                          <span style={{fontSize:10,color:"#555",flexShrink:0}}>{job.printTime}</span>
                        </div>
                      ))}
                      {printerJobs.length===0&&dragInfo&&(
                        <div style={{border:"1px dashed #2aff6e44",borderRadius:4,padding:"6px",textAlign:"center",fontSize:10,color:"#2aff6e44"}}>Drop here</div>
                      )}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-blue" style={{flex:1,fontSize:11}}
                      onClick={()=>setEditingPrinter({...printer,loadedColors:[...printer.loadedColors],colorNames:[...printer.colorNames]})}>Edit</button>
                    <button className="btn btn-red"  style={{flex:1,fontSize:11}} onClick={()=>setConfirmDelete(printer.id)}>Remove</button>
                  </div>
                </div>
              );
            })}
            {/* Add printer card */}
            <div onClick={()=>setEditingPrinter({...BLANK_PRINTER})}
              style={{border:"2px dashed #2a2a3a",borderRadius:8,padding:"16px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:140,transition:"all 0.2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#2aff6e88";e.currentTarget.style.background="#0d2a1a44";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a3a";e.currentTarget.style.background="transparent";}}>
              <div style={{fontSize:24,marginBottom:6}}>＋</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#555"}}>Add Printer</div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            INVENTORY TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab==="inventory" && (
          <div>
            {/* Summary */}
            {inventory.length>0 && (()=>{
              const lowStock   = inventory.filter(f=>f.totalGrams>0&&f.totalGrams<=LOW_STOCK_THRESHOLD);
              const outOfStock = inventory.filter(f=>f.totalGrams===0);
              const byMaterial = {};
              inventory.forEach(f=>{byMaterial[f.material]=(byMaterial[f.material]||0)+f.totalGrams;});
              return (
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                  {Object.entries(byMaterial).map(([mat,g])=>(
                    <div key={mat} className="card" style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,color:"#aaa",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600}}>{mat}</span>
                      <span style={{fontSize:12,color:"#2aff6e"}}>{(g/1000).toFixed(1)}kg</span>
                    </div>
                  ))}
                  {lowStock.length>0   && <div className="card" style={{padding:"7px 12px",background:"#1a1400",border:"1px solid #fbbf2444"}}><span style={{fontSize:12,color:"#fbbf24"}}>⚠ {lowStock.length} low stock</span></div>}
                  {outOfStock.length>0 && <div className="card" style={{padding:"7px 12px",background:"#1a0000",border:"1px solid #ff6e6e44"}}><span style={{fontSize:12,color:"#ff6e6e"}}>✕ {outOfStock.length} out of stock</span></div>}
                </div>
              );
            })()}

            {/* Filter + Sort */}
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <input value={invFilter} onChange={e=>setInvFilter(e.target.value)} placeholder="Search brand, color, material…"
                style={{flex:1,minWidth:160,background:"#111118",border:"1px solid #2a2a3a",borderRadius:6,padding:"6px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,outline:"none"}} />
              <div style={{display:"flex",gap:4}}>
                {["brand","color","material"].map(s=>(
                  <button key={s} onClick={()=>setInvSort(s)}
                    style={{background:invSort===s?"#1a3d2a":"#111118",border:`1px solid ${invSort===s?"#2aff6e44":"#333"}`,borderRadius:4,color:invSort===s?"#2aff6e":"#555",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"4px 10px"}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {inventory.length===0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
                <div style={{fontSize:36,marginBottom:10}}>🧵</div>
                <div style={{fontSize:13}}>No filament in inventory. Click + Add to get started.</div>
              </div>
            ) : (()=>{
              const filtered = inventory.filter(f=>{
                if (!invFilter) return true;
                const q = invFilter.toLowerCase();
                return f.brand.toLowerCase().includes(q)||f.colorName.toLowerCase().includes(q)||f.material.toLowerCase().includes(q);
              });
              const sorted = [...filtered].sort((a,b)=>{
                if (invSort==="brand")    return a.brand.localeCompare(b.brand)||a.colorName.localeCompare(b.colorName);
                if (invSort==="color")    return a.colorName.localeCompare(b.colorName);
                return a.material.localeCompare(b.material)||a.brand.localeCompare(b.brand);
              });
              const groups = {};
              sorted.forEach(f=>{
                const key = invSort==="brand"?f.brand:invSort==="material"?f.material:f.colorName[0]?.toUpperCase()||"?";
                if (!groups[key]) groups[key]=[];
                groups[key].push(f);
              });
              return (
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {Object.entries(groups).map(([gk,items])=>(
                    <div key={gk}>
                      <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:8}}>{gk.toUpperCase()}</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                        {items.map(f=>{
                          const isLow = f.totalGrams>0&&f.totalGrams<=LOW_STOCK_THRESHOLD;
                          const isOut = f.totalGrams===0;
                          const pct   = Math.min(100, Math.round(f.totalGrams/10));
                          return (
                            <div key={f.id} className="card" style={{padding:"12px 14px",border:`1px solid ${isOut?"#ff6e6e22":isLow?"#fbbf2422":"#1e1e2e"}`}}>
                              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                                <div style={{width:28,height:28,borderRadius:6,background:f.color,border:"1px solid #ffffff22",flexShrink:0}} />
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.colorName}</div>
                                  <div style={{fontSize:11,color:"#555"}}>{f.brand} · {f.material}</div>
                                </div>
                                <div style={{textAlign:"right",flexShrink:0}}>
                                  <div style={{fontSize:14,fontWeight:600,color:isOut?"#ff6e6e":isLow?"#fbbf24":"#2aff6e"}}>{f.totalGrams}g</div>
                                  {isLow&&!isOut&&<div style={{fontSize:9,color:"#fbbf24"}}>LOW STOCK</div>}
                                  {isOut&&<div style={{fontSize:9,color:"#ff6e6e"}}>OUT OF STOCK</div>}
                                </div>
                              </div>
                              <div style={{height:3,background:"#1e1e2e",borderRadius:2,marginBottom:10,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${pct}%`,background:isOut?"#ff6e6e":isLow?"#fbbf24":"#2aff6e",borderRadius:2}} />
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button className="btn btn-blue" style={{flex:1,fontSize:10,padding:"3px 8px"}} onClick={()=>setEditingFilament({...f})}>Edit</button>
                                <button className="btn btn-gray" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>{
                                  const adj=parseInt(prompt(`New total for ${f.brand} ${f.colorName} ${f.material}\nCurrent: ${f.totalGrams}g\n\nEnter new total:`));
                                  if (!isNaN(adj)&&adj>=0) saveFilament({...f,totalGrams:adj});
                                }}>Adjust</button>
                                <button className="btn btn-red" style={{flex:1,fontSize:10,padding:"3px 8px"}} onClick={()=>setConfirmDeleteFilament(f.id)}>Remove</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {/* Shopping List */}
                  {(()=>{
                    const restock = inventory.filter(f=>f.totalGrams<=LOW_STOCK_THRESHOLD);
                    if (!restock.length) return null;
                    return (
                      <div>
                        <div style={{fontSize:11,color:"#fbbf24",letterSpacing:"0.08em",marginBottom:8}}>🛒 SHOPPING LIST</div>
                        <div className="card" style={{padding:"14px 16px",border:"1px solid #fbbf2422"}}>
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {restock.sort((a,b)=>a.totalGrams-b.totalGrams).map(f=>(
                              <div key={f.id} style={{display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:12,height:12,borderRadius:3,background:f.color,border:"1px solid #ffffff22",flexShrink:0}} />
                                <span style={{flex:1,fontSize:12,color:"#aaa"}}>{f.brand} {f.colorName} {f.material}</span>
                                <span style={{fontSize:11,color:f.totalGrams===0?"#ff6e6e":"#fbbf24"}}>
                                  {f.totalGrams===0?"OUT OF STOCK":`${f.totalGrams}g left`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            COMPLETED TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab==="completed" && (
          <div>
            {doneJobs.length===0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
                <div style={{fontSize:36,marginBottom:10}}>✓</div>
                <div style={{fontSize:13}}>No completed jobs yet.</div>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button className="btn btn-red" style={{fontSize:11,opacity:0.6}}
                    onClick={()=>{if(window.confirm("Clear all completed jobs?")) setJobs(prev=>prev.filter(j=>j.status!=="done"));}}>
                    Clear All
                  </button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[...doneJobs].reverse().map(job=>{
                    const printer = printers.find(p=>p.id===job.assignedPrinterId);
                    return (
                      <div key={job.id} className="card" style={{padding:"10px 14px",display:"flex",gap:12,alignItems:"center",opacity:0.85}}>
                        {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:52,height:38,objectFit:"cover",borderRadius:4,border:"1px solid #2a2a3a",flexShrink:0}} />}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
                            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#aaa"}}>{job.partName}</span>
                            <span className="chip" style={{background:"#0a2a1a",color:"#34d399",border:"1px solid #34d39944"}}>✓ DONE</span>
                            {printer && <span style={{fontSize:11,color:"#555"}}>→ {printer.name}</span>}
                          </div>
                          <div style={{display:"flex",gap:8,fontSize:11,color:"#555",flexWrap:"wrap",alignItems:"center"}}>
                            <span>🕐 {job.printTime}</span>
                            {job.totalGrams!=null   && <span>🧵 {job.totalGrams}g</span>}
                            {job.purgeWeightG!=null && <span>🗑 {job.purgeWeightG}g purge</span>}
                            <span style={{color:"#444"}}>{job.addedAt}</span>
                            <div style={{display:"flex",gap:2}}>
                              {job.colors?.map((c,i)=><div key={i} style={{width:11,height:11,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}
                            </div>
                          </div>
                        </div>
                        <button className="btn btn-gray" style={{fontSize:10,padding:"2px 8px",flexShrink:0}} onClick={()=>removeJob(job.id)}>Remove</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
