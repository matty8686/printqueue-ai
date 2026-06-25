import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ── Supabase ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://ubdjtfbjfdguvahehmbr.supabase.co";
const SUPABASE_KEY = "sb_publishable_tmJkU6S_VgLgF03V5J9qiQ_JrVMLdsQ";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Constants ──────────────────────────────────────────────────────────────────
const PURGE_WARN_THRESHOLD = 25;
const LS_APIKEY = "pqai_apikey";

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "ASA", "Other"];
const BRANDS    = ["Bambu Lab", "Elegoo", "Overture", "Hatchbox", "eSUN", "Polymaker", "Prusament", "Sunlu", "Amazon Basics", "Other"];

const INITIAL_PRINTERS = [
  { id: 1, name: "Printer 1", status: "idle", loadedColors: ["#E53E3E"], colorNames: ["Red PLA"], hasToolChanger: false, maxColors: 1, queue: [] },
  { id: 2, name: "Printer 2", status: "idle", loadedColors: ["#2B6CB0","#1A202C","#FFFFFF","#68D391"], colorNames: ["Blue PETG","Black PLA","White PLA","Green PLA"], hasToolChanger: true, maxColors: 4, queue: [] },
  { id: 3, name: "Printer 3", status: "idle", loadedColors: ["#F6E05E","#FFFFFF"], colorNames: ["Yellow PLA","White PLA"], hasToolChanger: false, maxColors: 1, queue: [] },
];

const BLANK_PRINTER = { name: "", hasToolChanger: false, maxColors: 1, loadedColors: ["#FFFFFF"], colorNames: ["White PLA"], status: "idle", queue: [] };

// A filament entry used per color slot on a job (no stock tracking)
const BLANK_FILAMENT_SLOT = { color: "#FFFFFF", colorName: "White", material: "PLA", brand: "Bambu Lab" };

// ── Global Styles ──────────────────────────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById("pqai-styles")) return;
  const el = document.createElement("style");
  el.id = "pqai-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@400;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0f1e; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0f1e; } ::-webkit-scrollbar-thumb { background: #1a2540; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
    .chip { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; }
    .btn { border: none; border-radius: 6px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600; padding: 6px 14px; transition: all 0.15s; }
    .btn-green { background: #14532d; color: #22c55e; border: 1px solid #22c55e44; }
    .btn-green:hover { background: #166534; }
    .btn-red { background: #450a0a; color: #f87171; border: 1px solid #f8717144; }
    .btn-red:hover { background: #7f1d1d; }
    .btn-gray { background: #0f1e36; color: #64748b; border: 1px solid #1a2540; }
    .btn-gray:hover { background: #1a2540; color: #94a3b8; }
    .btn-blue { background: #0f1e36; color: #60a5fa; border: 1px solid #60a5fa44; }
    .btn-blue:hover { background: #172554; }
    .card { background: #0d1424; border: 1px solid #1a2540; border-radius: 10px; }
    .printer-card { transition: border-color 0.2s; }
    select { background: #0a0f1e; color: #e2e8f0; border: 1px solid #1a2540; border-radius: 6px; padding: 4px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
    input[type=number] { color-scheme: dark; }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    @media(max-width:600px) {
      .tab-btn { padding: 8px 6px; font-size: 11px; }
      .btn { padding: 8px 10px; }
      .hide-mobile { display: none !important; }
    }
  `;
  document.head.appendChild(el);
})();

// ── Utilities ──────────────────────────────────────────────────────────────────
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
  const perfectBonus = (jobColors.length > 0 && matched === jobColors.length) ? 60 : 0;
  const idleBonus    = printer.status === "idle" ? 20 : 0;
  const queuePenalty = printer.queue.length * 10;
  const purgeIsHigh  = purgeWeightG !== null && purgeWeightG >= PURGE_WARN_THRESHOLD;
  const wastePenalty = purgeIsHigh && !printer.hasToolChanger ? -20 : 0;
  const purgeBonus   = purgeIsHigh && printer.hasToolChanger  ?  30 : 0;
  const overkill     = !multiTool && jobColors.length === 1 && printer.hasToolChanger ? -5 : 0;
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
function parsePrintTime(str) {
  if (!str || str === "Unknown") return null;
  let secs = 0;
  const h = str.match(/(\d+)\s*h/i);
  const m = str.match(/(\d+)\s*m/i);
  const s = str.match(/(\d+)\s*s/i);
  if (h) secs += parseInt(h[1]) * 3600;
  if (m) secs += parseInt(m[1]) * 60;
  if (s) secs += parseInt(s[1]);
  return secs > 0 ? secs : null;
}
function formatCountdown(secs) {
  if (secs <= 0) return "Done";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}
function formatFinishTime(startedAt, durationSecs) {
  const finish   = new Date(startedAt + durationSecs * 1000);
  const now      = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  const timeStr  = finish.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  if (finish.toDateString() === now.toDateString())      return `Today at ${timeStr}`;
  if (finish.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${timeStr}`;
  return `${finish.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})} at ${timeStr}`;
}

// ── Shared Components ──────────────────────────────────────────────────────────
// ── FilamentSlotEditor ─────────────────────────────────────────────────────────
// Top-level so React doesn't recreate it on every parent render (fixes lost focus)
const PRESET_COLORS = [
  "#FFFFFF","#000000","#FF0000","#00AA00","#0000FF","#FFFF00","#FF6600","#FF69B4",
  "#888888","#8B4513","#00BFFF","#9400D3","#40E0D0","#98FF98","#FFD700","#C0C0C0",
];
function FilamentSlotEditor({ job, onUpdate }) {
  const filaments = job.filaments || job.colors.map(c=>({color:c,colorName:"",material:"PLA",brand:"Bambu Lab"}));
  const [expandedSlot, setExpandedSlot] = useState(null);

  function updateSlot(i, field, value) {
    onUpdate(filaments.map((f,fi)=>fi===i?{...f,[field]:value}:f));
  }
  function addSlot() {
    onUpdate([...filaments, {...BLANK_FILAMENT_SLOT}]);
    setExpandedSlot(filaments.length);
  }
  function removeSlot(i) {
    if (filaments.length<=1) return;
    onUpdate(filaments.filter((_,fi)=>fi!==i));
    setExpandedSlot(null);
  }

  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
        {filaments.map((f,i)=>(
          <div key={i} style={{position:"relative"}}>
            <div onClick={()=>setExpandedSlot(expandedSlot===i?null:i)}
              style={{display:"flex",alignItems:"center",gap:6,background:"#0d0d15",border:`1px solid ${expandedSlot===i?"#2aff6e":"#2a2a3a"}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",minWidth:110}}>
              <div style={{width:16,height:16,borderRadius:3,background:f.color,border:"1px solid #ffffff22",flexShrink:0}} />
              <div style={{flex:1,minWidth:0}}>
                {f.colorName
                  ? <div><div style={{fontSize:11,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.colorName}</div><div style={{fontSize:9,color:"#555"}}>{f.brand} · {f.material}</div></div>
                  : <div style={{fontSize:11,color:"#555",fontStyle:"italic"}}>Slot {i+1}</div>}
              </div>
              <span style={{fontSize:10,color:"#444"}}>▾</span>
              {filaments.length>1 && <span onClick={e=>{e.stopPropagation();removeSlot(i);}} style={{color:"#555",cursor:"pointer",fontSize:12,padding:"0 2px"}}>×</span>}
            </div>
            {expandedSlot===i && (
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:200,background:"#111118",border:"1px solid #2a2a3a",borderRadius:8,padding:"12px",minWidth:240,boxShadow:"0 8px 32px #000a"}}>
                <div style={{fontSize:10,color:"#555",marginBottom:8,letterSpacing:"0.06em"}}>FILAMENT SLOT {i+1}</div>
                {/* Color picker row */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <label style={{position:"relative",width:36,height:36,flexShrink:0,cursor:"pointer",borderRadius:6,border:"2px solid #2a2a3a",overflow:"hidden"}}>
                    <div style={{width:"100%",height:"100%",background:f.color}} />
                    <input type="color" value={f.color} onChange={e=>updateSlot(i,"color",e.target.value)}
                      style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}} />
                  </label>
                  <input value={f.color} onChange={e=>updateSlot(i,"color",e.target.value)} placeholder="#RRGGBB"
                    style={{flex:1,background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:5,padding:"6px 8px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,outline:"none"}} />
                </div>
                {/* Preset swatches */}
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                  {PRESET_COLORS.map(c=>(
                    <div key={c} onClick={()=>updateSlot(i,"color",c)}
                      style={{width:20,height:20,borderRadius:4,background:c,cursor:"pointer",border:f.color===c?"2px solid #22c55e":"2px solid transparent",boxSizing:"border-box"}} />
                  ))}
                </div>
                <input value={f.colorName} onChange={e=>updateSlot(i,"colorName",e.target.value)} placeholder="Color name (e.g. Jade Green)"
                  autoFocus
                  style={{width:"100%",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:5,padding:"6px 10px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,outline:"none",marginBottom:8}} />
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  <select value={f.brand} onChange={e=>updateSlot(i,"brand",e.target.value)}
                    style={{width:"100%",padding:"6px 8px",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:5,color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,outline:"none"}}>
                    {BRANDS.map(b=><option key={b}>{b}</option>)}
                  </select>
                  <select value={f.material} onChange={e=>updateSlot(i,"material",e.target.value)}
                    style={{width:"100%",padding:"6px 8px",background:"#0d0d15",border:"1px solid #2a2a3a",borderRadius:5,color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,outline:"none"}}>
                    {MATERIALS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <button className="btn btn-gray" style={{width:"100%",fontSize:11}} onClick={()=>setExpandedSlot(null)}>Done</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={addSlot}
          style={{background:"#1a1a2a",border:"1px dashed #333",borderRadius:6,color:"#555",cursor:"pointer",fontSize:12,padding:"5px 10px",height:36}}>
          + Add
        </button>
      </div>
    </div>
  );
}

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
function Spinner({ color="#2aff6e" }) {
  return <div style={{width:28,height:28,border:`3px solid ${color}22`,borderTopColor:color,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />;
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

// ── Login Screen ───────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } });
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

// ── Root ───────────────────────────────────────────────────────────────────────
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
  const [printers,           setPrinters]           = useState(INITIAL_PRINTERS);
  const [jobs,               setJobs]               = useState([]);
  const [loaded,             setLoaded]             = useState(false);
  const [analyzing,          setAnalyzing]          = useState(false);
  const [dragOver,           setDragOver]           = useState(false);
  const [activeTab,          setActiveTab]          = useState("dashboard");
  const [notification,       setNotification]       = useState(null);
  const [pendingFile,        setPendingFile]        = useState(null);
  const [pendingPreview,     setPendingPreview]     = useState(null);
  const [slicedForMultiTool, setSlicedForMultiTool] = useState(null);
  const [editingPrinter,     setEditingPrinter]     = useState(null);
  const [confirmDelete,      setConfirmDelete]      = useState(null);
  const [confirmComplete,    setConfirmComplete]    = useState(null);
  const [editingJob,         setEditingJob]         = useState(null);
  const [dragInfo,           setDragInfo]           = useState(null);
  const [showApiKey,         setShowApiKey]         = useState(false);
  const [sidebarOpen,        setSidebarOpen]        = useState(() => window.innerWidth > 640);
  const [scrollToPrinter,    setScrollToPrinter]    = useState(null);
  const [activeTimers,       setActiveTimers]       = useState({});
  const [now,                setNow]                = useState(Date.now());
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(LS_APIKEY)||""; } catch(_) { return ""; } });
  const apiKeyRef = useRef("");
  const fileRef   = useRef();
  const syncTimer = useRef(null);

  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);

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
        const [{ data: pd }, { data: jd }] = await Promise.all([
          supabase.from("printers").select("id,data").eq("user_id", uid),
          supabase.from("jobs").select("id,data").eq("user_id", uid),
        ]);
        if (pd?.length) {
          const restoredTimers = {};
          pd.forEach(r => {
            if (r.data.timerStartedAt) {
              restoredTimers[r.data.id] = { jobId: r.data.timerJobId, startedAt: r.data.timerStartedAt, durationSecs: r.data.timerDurationSecs, editingTime: false };
            }
          });
          if (Object.keys(restoredTimers).length) setActiveTimers(restoredTimers);
          setPrinters(pd.map(r=>({...r.data, status:"idle"})));
        }
        if (jd?.length) setJobs(jd.map(r=>r.data));
      } catch(e) { console.error("Load error:", e); }
      setSyncing(false);
      setLoaded(true);
    }
    load();
  }, [session]);

  // ── Cloud Sync ──
  const syncToCloud = useCallback(async (p, j) => {
    if (!loaded) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const uid = session.user.id;
        const ops = [];
        if (p.length) ops.push(supabase.from("printers").upsert(p.map(x=>({id:x.id,user_id:uid,data:x})),{onConflict:"id"}));
        if (j.length) ops.push(supabase.from("jobs").upsert(j.map(x=>({id:x.id,user_id:uid,data:x})),{onConflict:"id"}));
        if (p.length) ops.push(supabase.from("printers").delete().eq("user_id",uid).not("id","in",`(${p.map(x=>x.id).join(",")})`));
        if (j.length) ops.push(supabase.from("jobs").delete().eq("user_id",uid).not("id","in",`(${j.map(x=>x.id).join(",")})`));
        else          ops.push(supabase.from("jobs").delete().eq("user_id",uid));
        await Promise.all(ops);
      } catch(e) { console.error("Sync error:", e); }
      setSyncing(false);
    }, 1500);
  }, [loaded, session]);

  useEffect(() => { if (loaded) syncToCloud(printers, jobs); }, [printers, jobs, loaded]);
  useEffect(() => {
    if (activeTab === "printers" && scrollToPrinter !== null) {
      const el = document.getElementById(`printer-card-${scrollToPrinter}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToPrinter(null);
    }
  }, [activeTab, scrollToPrinter]);

  // ── Helpers ──
  function showNotif(msg, type="success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
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

  // ── Timer ──
  function startTimer(printerId, job, customSecs=null) {
    const secs = customSecs || parsePrintTime(job.printTime);
    if (!secs) { showNotif("Couldn't parse print time — edit it first", "warn"); return; }
    const startedAt = Date.now();
    setActiveTimers(prev => ({...prev, [printerId]: { jobId: job.id, startedAt, durationSecs: secs, editingTime: false }}));
    setPrinters(prev => prev.map(p => p.id===printerId ? {...p, status:"printing", timerJobId: job.id, timerStartedAt: startedAt, timerDurationSecs: secs} : p));
    showNotif(`Timer started for "${job.partName}"`);
  }
  function stopTimer(printerId) {
    setActiveTimers(prev => { const n={...prev}; delete n[printerId]; return n; });
    setPrinters(prev => prev.map(p => p.id===printerId ? {...p, status:"idle", timerJobId: null, timerStartedAt: null, timerDurationSecs: null} : p));
  }
  function updateTimerDuration(printerId, secs) {
    const startedAt = Date.now();
    setActiveTimers(prev => ({...prev, [printerId]: { ...prev[printerId], durationSecs: secs, startedAt, editingTime: false, editValue: "" }}));
    setPrinters(prev => prev.map(p => p.id===printerId ? {...p, timerStartedAt: startedAt, timerDurationSecs: secs} : p));
  }
  function startEditTimer(printerId, remainingSecs) {
    const totalMins = Math.ceil(remainingSecs / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const val = h > 0 ? `${h}h ${m}m` : `${totalMins}m`;
    setActiveTimers(prev => ({...prev, [printerId]: {...prev[printerId], editingTime: true, editValue: val}}));
  }
  function saveEditTimer(printerId) {
    const secs = parsePrintTime(activeTimers[printerId]?.editValue||"");
    if (!secs) { showNotif("Try a format like '1h 20m' or '45m'", "warn"); return; }
    updateTimerDuration(printerId, secs);
    showNotif("Time updated");
  }
  function cancelEditTimer(printerId) {
    setActiveTimers(prev => ({...prev, [printerId]: {...prev[printerId], editingTime: false, editValue: ""}}));
  }
  function setEditTimerValue(printerId, val) {
    setActiveTimers(prev => ({...prev, [printerId]: {...prev[printerId], editValue: val}}));
  }

  // ── Job Operations ──
  async function removeJob(jobId) {
    setJobs(prev => prev.filter(j=>j.id!==jobId));
    setPrinters(prev => prev.map(p => ({...p, queue: p.queue.filter(id=>id!==jobId)})));
    setActiveTimers(prev => {
      const n = {...prev};
      Object.entries(n).forEach(([pid, t]) => { if (t.jobId===jobId) delete n[pid]; });
      return n;
    });
    try { await supabase.from("jobs").delete().eq("user_id", session.user.id).eq("id", jobId); } catch(_) {}
  }
  function selectPrinterForJob(jobId, printerId) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, assignedPrinterId: printerId?parseInt(printerId):null} : j));
  }
  function addJobToQueue(jobId) {
    const job = jobs.find(j=>j.id===jobId);
    if (!job || !job.assignedPrinterId) return;
    setPrinters(prev => prev.map(p => p.id===job.assignedPrinterId ? {...p, queue:[...p.queue,jobId]} : p));
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"queued"} : j));
    const printer = printers.find(p=>p.id===job.assignedPrinterId);
    showNotif(`"${job.partName}" added to ${printer?.name||"printer"} queue`);
  }
  function unqueueJob(jobId) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"pending", assignedPrinterId:null} : j));
    setPrinters(prev => prev.map(p => ({...p, queue: p.queue.filter(id=>id!==jobId)})));
    setActiveTimers(prev => {
      const n = {...prev};
      Object.entries(n).forEach(([pid, t]) => { if (t.jobId===jobId) delete n[pid]; });
      return n;
    });
    showNotif("Job moved back to pending", "warn");
  }
  function duplicateJob(jobId) {
    const job = jobs.find(j=>j.id===jobId);
    if (!job) return;
    const copy = {...job, id: Date.now(), status:"pending", assignedPrinterId:null, addedAt: new Date().toLocaleTimeString()};
    setJobs(prev => [...prev, copy]);
    showNotif(`"${job.partName}" duplicated — assign to a printer`);
  }
  function completeJob(jobId) { setConfirmComplete(jobId); }
  function confirmCompleteJob() {
    const jobId = confirmComplete;
    const job   = jobs.find(j=>j.id===jobId);
    setPrinters(prev => prev.map(p => ({...p, queue: p.queue.filter(id=>id!==jobId)})));
    setJobs(prev => prev.map(j => j.id===jobId ? {...j, status:"done"} : j));
    showNotif(`"${job?.partName}" marked complete ✓`);
    setConfirmComplete(null);
  }
  function updateJobField(jobId, field, value) {
    setJobs(prev => prev.map(j => j.id===jobId ? {...j,[field]:value} : j));
  }
  function updateJobFilaments(jobId, newFilaments) {
    // newFilaments: array of { color, colorName, material, brand }
    setJobs(prev => prev.map(j => j.id!==jobId ? j : {
      ...j,
      filaments: newFilaments,
      colors: newFilaments.map(f=>f.color),
      colorCount: newFilaments.length,
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
    showNotif(`Moved to ${printers.find(p=>p.id===toPrinterId)?.name}`);
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
    if (imgs.length) analyzeImage(imgs[0]);
  }
  useEffect(() => {
    function onPaste(e) {
      if (analyzing) return;
      const item = [...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (file) analyzeImage(new File([file], `paste-${Date.now()}.png`, {type:file.type}));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [analyzing]);

  // ── Image Analysis ──
  async function analyzeImage(file) {
    setAnalyzing(true);
    try {
      const base64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const prompt = `Analyze this 3D slicer screenshot.
Extract:
1. The printer brand/model name shown in the Printer section (e.g. "Bambu Lab A1 Mini", "Snapmaker U1", "Flashforge Creator 5")
2. All filament colors visible (as hex codes)
3. Print time if visible (e.g. "4h 23m"), or null
4. Part name or filename, or a short description
5. Color count
6. Total filament used in grams (sum the Total column), or null
7. Total purge weight in grams (sum the Purged column), or null

Respond ONLY in valid JSON, no markdown:
{"printerName":"string","colors":["#hex"],"printTime":"Xh Ym or null","partName":"string","colorCount":number,"totalGrams":number or null,"purgeWeightG":number or null,"notes":"string"}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyRef.current||""}`;
      const res = await fetch(url, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ contents:[{parts:[{inline_data:{mime_type:file.type||"image/png",data:base64}},{text:prompt}]}], generationConfig:{temperature:0.1} })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(`Gemini API error: ${data.error?.message||res.statusText}`);
      const text = data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
      if (!text) throw new Error("Empty response from Gemini");
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g,"").trim()); }
      catch { throw new Error(`Could not parse AI response: ${text.slice(0,200)}`); }

      const printerName  = (parsed.printerName||"").toLowerCase();
      const multiTool    = !printerName.includes("bambu");
      const colorCount   = multiTool ? (parsed.colorCount||parsed.colors?.length||1) : 1;
      const colors       = multiTool ? (parsed.colors||["#888888"]) : [parsed.colors?.[0]||"#888888"];
      const purgeWeightG = typeof parsed.purgeWeightG==="number" ? Math.round(parsed.purgeWeightG*10)/10 : null;
      const totalGrams   = typeof parsed.totalGrams==="number"   ? Math.round(parsed.totalGrams)         : null;

      // Build filament slots from detected colors (brand/name to be filled by user)
      const filaments = colors.map(c => ({ color: c, colorName: "", material: "PLA", brand: "Bambu Lab" }));

      const newJob = {
        id: Date.now(), fileName: file.name,
        partName: parsed.partName||file.name,
        colors, filaments, colorCount,
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
  // Sort: printing first, then idle, then done — alphabetically within each group
  const sortedPrinters = [...printers].sort((a,b) => {
    const ta=activeTimers[a.id], tb=activeTimers[b.id];
    const aDone=ta&&(ta.durationSecs-(now-ta.startedAt)/1000)<=0;
    const bDone=tb&&(tb.durationSecs-(now-tb.startedAt)/1000)<=0;
    const rank=p=>{ const t=activeTimers[p.id]; if(!t) return 1; if((t.durationSecs-(now-t.startedAt)/1000)<=0) return 2; return 0; };
    const diff=rank(a)-rank(b); if(diff!==0) return diff;
    return a.name.localeCompare(b.name);
  });

  // ── Filament Slot Editor ──

  // ── Render ─────────────────────────────────────────────────────────────────
  const NAV = [
    {id:"dashboard", icon:"▦",  label:"Dashboard"},
    {id:"queue",     icon:"≡",  label:"Queue",     count:allJobs.length},
    {id:"printers",  icon:"⬡",  label:"Printers",  count:printers.length},
    {id:"completed", icon:"✓",  label:"Completed", count:doneJobs.length},
  ];

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#0a0f1e",color:"#e2e8f0",fontFamily:"'IBM Plex Mono',monospace"}}>

      {/* ── Sidebar ── */}
      <aside style={{width:sidebarOpen?220:0,minWidth:sidebarOpen?220:0,background:"#060b14",borderRight:sidebarOpen?"1px solid #1a2540":"none",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto",overflowX:"hidden",transition:"width 0.2s,min-width 0.2s",zIndex:10}}>
        {/* Logo */}
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid #1a2540",minWidth:220}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,background:"linear-gradient(135deg,#22c55e,#3b82f6)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⬡</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",letterSpacing:"-0.02em"}}>PrintQueue<span style={{color:"#22c55e"}}>AI</span></div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"12px 8px"}}>
          {NAV.map(item=>(
            <button key={item.id} onClick={()=>setActiveTab(item.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",background:activeTab===item.id?"#0f1e36":"transparent",color:activeTab===item.id?"#22c55e":"#4a5a7a",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,marginBottom:2,textAlign:"left",transition:"all 0.15s"}}>
              <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{item.icon}</span>
              <span style={{flex:1}}>{item.label}</span>
              {item.count!==undefined && item.count>0 && (
                <span style={{background:activeTab===item.id?"#14532d":"#0f1e36",color:activeTab===item.id?"#22c55e":"#4a5a7a",borderRadius:12,fontSize:10,padding:"1px 7px"}}>{item.count}</span>
              )}
            </button>
          ))}
          {activeTab==="printers" && (
            <button className="btn btn-green" style={{width:"100%",marginTop:8,fontSize:11}} onClick={()=>setEditingPrinter({...BLANK_PRINTER})}>+ Add Printer</button>
          )}
        </nav>
        {/* Bottom */}
        <div style={{padding:"10px 8px",borderTop:"1px solid #1a2540"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",marginBottom:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:syncing?"#f59e0b":loaded?"#22c55e":"#4a5a7a",flexShrink:0,animation:syncing?"pulse 1s infinite":"none"}} />
            <span style={{fontSize:10,color:"#4a5a7a"}}>{syncing?"syncing…":loaded?"synced":"—"}</span>
          </div>
          <button className="btn btn-gray" style={{width:"100%",textAlign:"left",marginBottom:4,fontSize:11,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}} onClick={()=>setShowApiKey(v=>!v)}>
            <div style={{width:6,height:6,borderRadius:"50%",background:apiKey?"#22c55e":"#ef4444",flexShrink:0}} />
            {apiKey?"Gemini key ✓":"Set Gemini key"}
          </button>
          <div style={{padding:"4px 12px",fontSize:10,color:"#1e3050",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{session.user.email}</div>
          <button onClick={async()=>{if(window.confirm("Sign out?")) await supabase.auth.signOut();}}
            style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,border:"none",cursor:"pointer",background:"transparent",color:"#4a5a7a",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:12,textAlign:"left"}}>
            ⎋ Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

        {/* Top bar with sidebar toggle */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderBottom:"1px solid #1a2540",background:"#060b14"}}>
          <button onClick={()=>setSidebarOpen(v=>!v)}
            style={{background:"none",border:"1px solid #1a2540",borderRadius:6,color:"#4a5a7a",cursor:"pointer",fontSize:16,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {sidebarOpen?"◀":"☰"}
          </button>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:14,color:"#fff"}}>
            {NAV.find(n=>n.id===activeTab)?.label}
          </span>
        </div>

        {/* API Key bar */}
        {showApiKey && (
          <div style={{background:"#060b14",borderBottom:"1px solid #1a2540",padding:"10px 20px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#4a5a7a",flexShrink:0}}>Gemini API Key:</span>
            <input type="password" value={apiKey} onChange={e=>saveApiKey(e.target.value)} placeholder="AIza..."
              style={{flex:1,minWidth:180,maxWidth:380,background:"#0a0f1e",border:"1px solid #1a2540",borderRadius:6,padding:"6px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}} />
            <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setShowApiKey(false)}>Done</button>
          </div>
        )}

        {/* Upload zone */}
        <div style={{padding:"16px 20px 0"}}>
          <div onClick={()=>!analyzing&&fileRef.current.click()}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles([...e.dataTransfer.files]);}}
            style={{border:`2px dashed ${dragOver?"#22c55e":analyzing?"#3b82f6":"#1a2540"}`,borderRadius:10,padding:"13px 16px",textAlign:"center",cursor:analyzing?"default":"pointer",background:dragOver?"#0a2a1a":analyzing?"#0a1428":"transparent",transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFiles([...e.target.files])} />
            {analyzing ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <Spinner color="#3b82f6" />
                <span style={{color:"#3b82f6",fontSize:13}}>Analyzing screenshot…</span>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                <span style={{fontSize:18}}>📸</span>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#94a3b8"}}>Drop slicer screenshot</span>
                <span style={{fontSize:11,color:"#2a3a5a"}}>or click · <kbd style={{background:"#0f1e36",border:"1px solid #1a2540",borderRadius:3,padding:"1px 5px",fontSize:10,color:"#4a5a7a"}}>Ctrl+V</kbd></span>
              </div>
            )}
          </div>
        </div>

      {/* Modals */}
      {editingPrinter && <PrinterModal printer={editingPrinter} onSave={savePrinter} onClose={()=>setEditingPrinter(null)} />}

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

      {confirmComplete && (()=>{
        const job = jobs.find(j=>j.id===confirmComplete);
        return (
          <Modal onClose={()=>setConfirmComplete(null)} maxWidth={360}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",marginBottom:8}}>Mark as Complete?</div>
            <div style={{fontSize:13,color:"#888",marginBottom:6}}><span style={{color:"#fff"}}>"{job?.partName}"</span> will be removed from the queue.</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:20}}>
              {job?.colors?.map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:3,background:c,border:"1px solid #ffffff22"}} />)}
              {job?.printTime && <span style={{fontSize:12,color:"#555",marginLeft:4}}>🕐 {job.printTime}</span>}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-gray"  style={{flex:1}} onClick={()=>setConfirmComplete(null)}>Cancel</button>
              <button className="btn btn-green" style={{flex:2}} onClick={confirmCompleteJob}>✓ Mark Complete</button>
            </div>
          </Modal>
        );
      })()}


      {notification && (
        <div style={{position:"fixed",top:16,right:16,zIndex:400,padding:"12px 18px",borderRadius:8,animation:"slideIn 0.3s ease",maxWidth:300,fontSize:12,
          background:notification.type==="success"?"#1a3d2a":notification.type==="warn"?"#3d3d1a":"#3d1a1a",
          border:`1px solid ${notification.type==="success"?"#2aff6e44":notification.type==="warn"?"#ffdd6e44":"#ff6e6e44"}`,
          color:notification.type==="success"?"#2aff6e":notification.type==="warn"?"#ffdd6e":"#ff6e6e"}}>
          {notification.msg}
        </div>
      )}

        {/* ════════ Content ════════ */}
        <div style={{padding:"20px"}}>

          {/* DASHBOARD */}
          {activeTab==="dashboard" && (
            <div style={{display:"flex",flexDirection:"column",gap:20}}>

              {/* Stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                {[
                  {label:"PRINTING",   value:Object.keys(activeTimers).length,                      color:"#22c55e", bg:"#052e16", tab:"printers"},
                  {label:"IDLE",       value:printers.filter(p=>!activeTimers[p.id]).length,         color:"#64748b", bg:"#0f172a", tab:"printers"},
                  {label:"IN QUEUE",   value:queuedJobs.length,                                      color:"#3b82f6", bg:"#0f1e36", tab:"queue"},
                  {label:"PENDING",    value:pendingJobs.length,                                     color:"#f59e0b", bg:"#1c1003", tab:"queue"},
                  {label:"COMPLETED",  value:doneJobs.length,                                        color:"#10b981", bg:"#022c22", tab:"completed"},
                ].map(s=>(
                  <div key={s.label} onClick={()=>setActiveTab(s.tab)} style={{background:s.bg,border:`1px solid ${s.color}22`,borderRadius:10,padding:"16px 14px",textAlign:"center",cursor:"pointer",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=s.color+"66"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=s.color+"22"}>
                    <div style={{fontSize:32,fontWeight:700,color:s.color,fontFamily:"'Space Grotesk',sans-serif",lineHeight:1}}>{s.value}</div>
                    <div style={{fontSize:10,color:s.color+"88",letterSpacing:"0.1em",marginTop:6}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Printer grid */}
              <div>
                <div style={{fontSize:11,color:"#2a3a5a",letterSpacing:"0.1em",marginBottom:12,fontWeight:600}}>FARM STATUS</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                  {sortedPrinters.map(printer=>{
                    const timer       = activeTimers[printer.id];
                    const printerJobs = jobs.filter(j=>printer.queue.includes(j.id));
                    const activeJob   = timer ? jobs.find(j=>j.id===timer.jobId) : printerJobs[0];
                    const elapsed     = timer ? (now-timer.startedAt)/1000 : 0;
                    const remaining   = timer ? timer.durationSecs-elapsed : null;
                    const isDone      = timer && remaining<=0;
                    const pct         = timer&&!isDone ? Math.min(100,Math.round(elapsed/timer.durationSecs*100)) : isDone?100:0;
                    const headerBg    = isDone?"#065f46":timer?"#14532d":"#1e3a8a";
                    const accentColor = isDone?"#10b981":timer?"#22c55e":"#3b82f6";
                    const badgeColor  = isDone?"#10b981":timer?"#22c55e":"#bfdbfe";
                    const statusLabel = isDone?"DONE ✓":timer?"PRINTING":"IDLE";
                    return (
                      <div key={printer.id} style={{borderRadius:10,overflow:"hidden",border:`1px solid ${accentColor}33`,cursor:"pointer",transition:"border-color 0.2s"}}
                        onClick={()=>{ setActiveTab("printers"); setScrollToPrinter(printer.id); }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=accentColor+"88"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=accentColor+"33"}>
                        {/* Colored header */}
                        <div style={{background:headerBg,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:14,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8}}>{printer.name}</span>
                          <span style={{background:"#00000033",color:badgeColor,border:`1px solid ${badgeColor}55`,borderRadius:20,fontSize:10,fontWeight:700,padding:"3px 10px",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.05em",flexShrink:0,animation:timer&&!isDone?"pulse 2s infinite":"none"}}>
                            ● {statusLabel}
                          </span>
                        </div>
                        {/* Body */}
                        <div style={{background:"#111827",padding:"12px 14px"}}>
                          {timer && !activeJob && (
                            <div style={{marginBottom:8}} onClick={e=>e.stopPropagation()}>
                              <div style={{fontSize:11,color:"#f87171",marginBottom:6}}>⚠ Job was removed while printing</div>
                              <button className="btn btn-red" style={{fontSize:11}} onClick={()=>stopTimer(printer.id)}>■ Stop Timer</button>
                            </div>
                          )}
                          {activeJob ? (<>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              {editingJob===activeJob.id
                                ? <input value={activeJob.partName} onChange={e=>updateJobField(activeJob.id,"partName",e.target.value)}
                                    onBlur={()=>setEditingJob(null)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditingJob(null);}}
                                    autoFocus style={{flex:1,marginRight:8,background:"#0a0f1e",border:"1px solid #3b82f6",borderRadius:4,padding:"2px 6px",color:"#fff",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:12,outline:"none"}} />
                                : <div onClick={()=>setEditingJob(activeJob.id)} style={{fontSize:12,color:"#e2e8f0",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8,cursor:"pointer",borderBottom:"1px dashed #334155"}} title="Click to rename">{activeJob.partName}</div>
                              }
                              {printerJobs.length>0 && <span style={{fontSize:10,color:"#64748b",flexShrink:0}}>{printerJobs.indexOf(activeJob)+1} of {printerJobs.length}</span>}
                            </div>
                            {timer && !isDone && (<>
                              <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",marginBottom:5}}>
                                <div style={{height:"100%",width:`${pct}%`,background:"#22c55e",borderRadius:2}} />
                              </div>
                              <div style={{fontSize:11,color:"#22c55e",fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                                {pct}% ·{" "}
                                {timer.editingTime ? (
                                  <>
                                    <input value={timer.editValue||""} onChange={e=>setEditTimerValue(printer.id,e.target.value)}
                                      onKeyDown={e=>{if(e.key==="Enter")saveEditTimer(printer.id);if(e.key==="Escape")cancelEditTimer(printer.id);}}
                                      autoFocus style={{width:72,background:"#0a0f1e",border:"1px solid #22c55e",borderRadius:4,padding:"1px 6px",color:"#22c55e",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,outline:"none"}} />
                                    <button onClick={()=>saveEditTimer(printer.id)} style={{background:"none",border:"none",color:"#22c55e",cursor:"pointer",fontSize:12,padding:0}}>✓</button>
                                    <button onClick={()=>cancelEditTimer(printer.id)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                                  </>
                                ) : (
                                  <span onClick={()=>startEditTimer(printer.id,remaining)} style={{cursor:"pointer",borderBottom:"1px dashed #22c55e55"}} title="Click to edit">{formatCountdown(remaining)}</span>
                                )}
                              </div>
                            </>)}
                            {isDone && <div style={{fontSize:11,color:"#10b981",fontWeight:600,marginBottom:8}}>✓ Print complete</div>}
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                              {(activeJob.filaments||activeJob.colors.map(c=>({color:c,colorName:""}))).slice(0,5).map((f,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#1e293b",border:"1px solid #334155",borderRadius:5,padding:"3px 7px"}}>
                                  <div style={{width:8,height:8,borderRadius:2,background:f.color,flexShrink:0}} />
                                  {f.colorName && <span style={{fontSize:10,color:"#64748b"}}>{f.colorName}</span>}
                                </div>
                              ))}
                              {activeJob.printTime&&activeJob.printTime!=="Unknown" && (
                                <div style={{display:"flex",alignItems:"center",background:"#1e293b",border:"1px solid #334155",borderRadius:5,padding:"3px 7px"}}>
                                  <span style={{fontSize:10,color:"#334155"}}>🕐 {activeJob.printTime}</span>
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
                              {isDone ? (
                                <button className="btn btn-green" style={{flex:1,fontSize:11}} onClick={()=>{completeJob(timer.jobId);stopTimer(printer.id);}}>✓ Mark Complete</button>
                              ) : timer ? (
                                <button className="btn btn-red" style={{fontSize:11}} onClick={()=>stopTimer(printer.id)}>■ Stop</button>
                              ) : (
                                <button className="btn btn-green" style={{fontSize:11}} onClick={()=>startTimer(printer.id,activeJob)}>▶ Start Timer</button>
                              )}
                            </div>
                          </>) : (
                            <div style={{fontSize:12,color:"#475569",fontStyle:"italic",padding:"8px 0"}}>No jobs queued</div>
                          )}
                          {printerJobs.length>1 && (
                            <div style={{fontSize:10,color:"#64748b",marginTop:8,paddingTop:8,borderTop:"1px solid #1a2540"}}>+{printerJobs.length-1} more in queue</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Finish times */}
              {Object.keys(activeTimers).length>0 && (
                <div>
                  <div style={{fontSize:11,color:"#2a3a5a",letterSpacing:"0.1em",marginBottom:12,fontWeight:600}}>ESTIMATED FINISH TIMES</div>
                  <div style={{background:"#0d1424",border:"1px solid #1a2540",borderRadius:10,overflow:"hidden"}}>
                    {Object.entries(activeTimers)
                      .map(([pid,timer])=>{
                        const printer=printers.find(p=>p.id===parseInt(pid));
                        const job=jobs.find(j=>j.id===timer.jobId);
                        const elapsed=(now-timer.startedAt)/1000;
                        const remaining=timer.durationSecs-elapsed;
                        const isDone=remaining<=0;
                        return {printer,job,remaining,isDone,finishTs:timer.startedAt+timer.durationSecs*1000,pid,timer};
                      })
                      .sort((a,b)=>a.finishTs-b.finishTs)
                      .map(({printer,job,remaining,isDone,timer},i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",borderBottom:"1px solid #1a2540"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:isDone?"#10b981":"#22c55e",flexShrink:0,animation:"pulse 2s infinite"}} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,color:"#e2e8f0",fontWeight:600}}>{printer?.name}</div>
                            <div style={{fontSize:11,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job?.partName}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {isDone ? (
                              <div style={{fontSize:12,color:"#10b981",fontWeight:600}}>✓ Done</div>
                            ) : (<>
                              <div style={{fontSize:13,color:"#22c55e",fontWeight:600}}>{formatCountdown(remaining)}</div>
                              <div style={{fontSize:10,color:"#334155"}}>{formatFinishTime(timer.startedAt,timer.durationSecs)}</div>
                            </>)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUEUE */}
          {activeTab==="queue" && (
            <div>
              {allJobs.length===0 ? (
                <div style={{textAlign:"center",padding:"64px 0",color:"#1e293b"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🖨️</div>
                  <div style={{fontSize:14,color:"#334155"}}>No jobs yet — drop a slicer screenshot above to start.</div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:20}}>
                  {pendingJobs.length>0 && (
                    <div>
                      <div style={{fontSize:11,color:"#2a3a5a",letterSpacing:"0.1em",marginBottom:12,fontWeight:600}}>PENDING — REVIEW & ASSIGN</div>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {pendingJobs.map(job=>{
                          const ranked=rankPrinters(printers,job.colors,job.slicedForMultiTool,job.purgeWeightG);
                          const recommended=ranked[0]?.printer||null;
                          const selPrinter=printers.find(p=>p.id===job.assignedPrinterId);
                          return (
                            <div key={job.id} style={{background:"#0d1424",border:"1px solid #1a2540",borderRadius:10,padding:"16px"}}>
                              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                                {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:80,height:60,objectFit:"cover",borderRadius:6,border:"1px solid #1a2540",flexShrink:0}} />}
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                                    {editingJob===job.id
                                      ? <input value={job.partName} onChange={e=>updateJobField(job.id,"partName",e.target.value)}
                                          onBlur={()=>setEditingJob(null)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditingJob(null);}}
                                          autoFocus style={{background:"#0a0f1e",border:"1px solid #3b82f6",borderRadius:4,padding:"2px 8px",color:"#fff",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,outline:"none",minWidth:120}} />
                                      : <span onClick={()=>setEditingJob(job.id)} style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,color:"#fff",cursor:"pointer",borderBottom:"1px dashed #334155"}} title="Click to rename">{job.partName}</span>
                                    }
                                    <span style={{background:job.slicedForMultiTool?"#1e1040":"#0a2010",color:job.slicedForMultiTool?"#a78bfa":"#4ade80",border:`1px solid ${job.slicedForMultiTool?"#a78bfa33":"#4ade8033"}`,borderRadius:20,fontSize:10,fontWeight:700,padding:"2px 9px"}}>
                                      {job.slicedForMultiTool?"🔧 MULTI":"🖨️ SINGLE"}
                                    </span>
                                    {job.highPurge&&selPrinter&&!selPrinter.hasToolChanger && (
                                      <span style={{background:"#1c0f00",color:"#f59e0b",border:"1px solid #f59e0b33",borderRadius:20,fontSize:10,fontWeight:700,padding:"2px 9px"}}>⚠ {job.purgeWeightG}g PURGE</span>
                                    )}
                                  </div>
                                  <div style={{display:"flex",gap:12,fontSize:11,color:"#334155",flexWrap:"wrap",marginBottom:12}}>
                                    <span>🕐 {job.printTime}</span>
                                    {job.totalGrams!=null && <span>🧵 {job.totalGrams}g</span>}
                                    {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#f59e0b":"#334155"}}>🗑 {job.purgeWeightG}g purge</span>}
                                  </div>
                                  <div style={{marginBottom:12}}>
                                    <div style={{fontSize:10,color:"#2a3a5a",marginBottom:6,letterSpacing:"0.07em"}}>FILAMENTS <span style={{color:"#1a2540",fontWeight:400}}>(click to label)</span></div>
                                    <FilamentSlotEditor job={job} onUpdate={f=>updateJobFilaments(job.id,f)} />
                                  </div>
                                  <div style={{marginBottom:14}}>
                                    <div style={{fontSize:10,color:"#2a3a5a",marginBottom:8,letterSpacing:"0.07em"}}>
                                      SELECT PRINTER
                                      {recommended && <span style={{color:"#22c55e",marginLeft:8}}>★ {recommended.name} recommended</span>}
                                    </div>
                                    <div style={{display:"flex",flexDirection:"column",gap:4}}>
                                      {ranked.map((r,ri)=>{
                                        const isSel=job.assignedPrinterId===r.printer.id;
                                        const isRec=recommended?.id===r.printer.id;
                                        return (
                                          <div key={r.printer.id} onClick={()=>selectPrinterForJob(job.id,r.printer.id)}
                                            style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,border:`1px solid ${isSel?"#22c55e":"#1a2540"}`,background:isSel?"#052e16":"#0a0f1e",cursor:"pointer",transition:"all 0.15s"}}>
                                            <div style={{width:12,height:12,borderRadius:"50%",border:`2px solid ${isSel?"#22c55e":"#334155"}`,background:isSel?"#22c55e":"transparent",flexShrink:0}} />
                                            <span style={{fontSize:12,color:isSel?"#fff":"#64748b",flex:1}}>
                                              {isRec?"★ ":`${ri+1}. `}{r.printer.name}{r.printer.hasToolChanger?" 🔧":""}
                                            </span>
                                            <div style={{display:"flex",gap:3}}>
                                              {r.printer.loadedColors.map((lc,li)=>{
                                                const match=job.colors.some(jc=>colorDistance(jc,lc)<80);
                                                return <div key={li} style={{width:10,height:10,borderRadius:2,background:lc,border:`1px solid ${match?"#22c55e88":"#ffffff11"}`,boxShadow:match?"0 0 4px #22c55e44":"none"}} />;
                                              })}
                                            </div>
                                            <span style={{fontSize:10,color:"#334155"}}>{r.matchedColors}/{job.colors.length}</span>
                                            {r.perfectMatch && <span style={{fontSize:10,color:"#22c55e"}}>✓</span>}
                                          </div>
                                        );
                                      })}
                                      {ranked.length===0 && <div style={{fontSize:12,color:"#334155",fontStyle:"italic"}}>No compatible printers</div>}
                                    </div>
                                  </div>
                                  <div style={{display:"flex",gap:8}}>
                                    <button className="btn btn-green" style={{opacity:job.assignedPrinterId?1:0.4,cursor:job.assignedPrinterId?"pointer":"not-allowed"}}
                                      onClick={()=>job.assignedPrinterId&&addJobToQueue(job.id)}>+ Add to Queue</button>
                                    <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>duplicateJob(job.id)}>⧉ Duplicate</button>
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

                  {queuedJobs.length>0 && (()=>{
                    const unassigned=queuedJobs.filter(j=>!j.assignedPrinterId);
                    const assigned=queuedJobs.filter(j=>j.assignedPrinterId);
                    const JobCard=({job,showUnqueue})=>{
                      const printer=printers.find(p=>p.id===job.assignedPrinterId);
                      const isEditing=editingJob===job.id;
                      const filaments=job.filaments||job.colors.map(c=>({color:c,colorName:"",material:"PLA",brand:"Bambu Lab"}));
                      return (
                        <div style={{background:"#0d1424",border:"1px solid #1a2540",borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                          {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:56,height:42,objectFit:"cover",borderRadius:5,border:"1px solid #1a2540",flexShrink:0}} />}
                          <div style={{flex:1,minWidth:0}}>
                            {isEditing ? (
                              <input value={job.partName} onChange={e=>updateJobField(job.id,"partName",e.target.value)}
                                style={{width:"100%",background:"#0a0f1e",border:"1px solid #22c55e44",borderRadius:6,padding:"4px 8px",color:"#fff",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,outline:"none",marginBottom:6}} />
                            ) : (
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#fff"}}>{job.partName}</span>
                                {printer && <span style={{fontSize:11,color:"#22c55e"}}>→ {printer.name}</span>}
                              </div>
                            )}
                            <div style={{display:"flex",gap:10,fontSize:11,color:"#334155",flexWrap:"wrap",marginBottom:8}}>
                              {isEditing
                                ? <input value={job.printTime} onChange={e=>updateJobField(job.id,"printTime",e.target.value)}
                                    style={{background:"#0a0f1e",border:"1px solid #1a2540",borderRadius:4,padding:"2px 6px",color:"#64748b",fontFamily:"inherit",fontSize:11,outline:"none",width:80}} />
                                : <span>🕐 {job.printTime}</span>}
                              {job.totalGrams!=null && <span>🧵 {job.totalGrams}g</span>}
                              {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#f59e0b":"#334155"}}>🗑 {job.purgeWeightG}g</span>}
                            </div>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                              {filaments.map((f,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#0a0f1e",border:"1px solid #1a2540",borderRadius:5,padding:"3px 7px"}}>
                                  <div style={{width:8,height:8,borderRadius:2,background:f.color}} />
                                  <span style={{fontSize:10,color:"#334155"}}>{f.colorName||f.color}</span>
                                </div>
                              ))}
                            </div>
                            <div style={{display:"flex",gap:6}}>
                              <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setEditingJob(isEditing?null:job.id)}>{isEditing?"Save":"Edit"}</button>
                              <button className="btn btn-green" style={{fontSize:11}} onClick={()=>completeJob(job.id)}>✓ Complete</button>
                              <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>duplicateJob(job.id)}>⧉ Duplicate</button>
                              {showUnqueue && <button className="btn btn-gray" style={{fontSize:11,marginLeft:"auto"}} onClick={()=>unqueueJob(job.id)}>↩ Unqueue</button>}
                            </div>
                          </div>
                        </div>
                      );
                    };
                    return (
                      <div>
                        <div style={{fontSize:11,color:"#2a3a5a",letterSpacing:"0.1em",marginBottom:12,fontWeight:600}}>QUEUED — IN PRINTER QUEUES</div>
                        {unassigned.length>0 && (
                          <div style={{marginBottom:16}}>
                            <div style={{fontSize:10,color:"#1e293b",letterSpacing:"0.07em",marginBottom:6}}>UNASSIGNED</div>
                            <div style={{display:"flex",flexDirection:"column",gap:8}}>{unassigned.map(job=><JobCard key={job.id} job={job} showUnqueue />)}</div>
                          </div>
                        )}
                        {printers.filter(p=>assigned.some(j=>j.assignedPrinterId===p.id)).map(printer=>(
                          <div key={printer.id} style={{marginBottom:16}} onDragOver={e=>e.preventDefault()} onDrop={()=>dropOnPrinter(printer.id)}>
                            <div style={{fontSize:10,color:"#1e293b",letterSpacing:"0.07em",marginBottom:6}}>{printer.name.toUpperCase()}</div>
                            <div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {assigned.filter(j=>j.assignedPrinterId===printer.id).map(job=>(
                                <div key={job.id} draggable onDragStart={()=>dragStart(job.id,printer.id)}><JobCard job={job} showUnqueue /></div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* PRINTERS */}
          {activeTab==="printers" && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {printers.length===0 ? (
                <div style={{textAlign:"center",padding:"64px 0",color:"#1e293b"}}>
                  <div style={{fontSize:14,color:"#334155"}}>No printers yet — click "+ Add Printer" in the sidebar.</div>
                </div>
              ) : sortedPrinters.map(printer=>{
                const timer=activeTimers[printer.id];
                const printerJobs=jobs.filter(j=>printer.queue.includes(j.id));
                const activeJob=timer?jobs.find(j=>j.id===timer.jobId):printerJobs[0];
                const elapsed=timer?(now-timer.startedAt)/1000:0;
                const remaining=timer?timer.durationSecs-elapsed:null;
                const isDone=timer&&remaining<=0;
                const pct=timer&&!isDone?Math.min(100,Math.round(elapsed/timer.durationSecs*100)):isDone?100:0;
                const headerBg=isDone?"#065f46":timer?"#14532d":"#0f1e36";
                const accentColor=isDone?"#10b981":timer?"#22c55e":"#1e293b";
                return (
                  <div key={printer.id} id={`printer-card-${printer.id}`} style={{borderRadius:10,overflow:"hidden",border:`1px solid ${accentColor}44`}}
                    onDragOver={e=>e.preventDefault()} onDrop={()=>dropOnPrinter(printer.id)}>
                    {/* Header */}
                    <div style={{background:headerBg,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,color:"#fff"}}>{printer.name}</div>
                        <div style={{fontSize:11,color:"#00000066",marginTop:2}}>{printer.hasToolChanger?"🔧 Multi-Tool":"🖨️ Single Tool"} · {printer.maxColors} slot{printer.maxColors!==1?"s":""}</div>
                      </div>
                      <div style={{display:"flex",gap:3,flexWrap:"wrap",maxWidth:120}}>
                        {printer.loadedColors.map((c,i)=>(
                          <div key={i} title={printer.colorNames[i]||`Slot ${i+1}`} style={{width:16,height:16,borderRadius:3,background:c,border:"1px solid #ffffff33"}} />
                        ))}
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setEditingPrinter({...printer,loadedColors:[...printer.loadedColors],colorNames:[...printer.colorNames]})}>Edit</button>
                        <button className="btn btn-red" style={{fontSize:11}} onClick={()=>setConfirmDelete(printer.id)}>Remove</button>
                      </div>
                    </div>
                    {/* Body */}
                    <div style={{background:"#0d1424",padding:"14px 16px"}}>
                      {timer&&!activeJob && (
                        <div style={{background:"#1c0a0a",border:"1px solid #f8717133",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
                          <div style={{fontSize:12,color:"#f87171",marginBottom:8}}>⚠ Job was removed while printing</div>
                          <button className="btn btn-red" style={{fontSize:11}} onClick={()=>stopTimer(printer.id)}>■ Stop Timer</button>
                        </div>
                      )}
                      {timer&&activeJob && (
                        <div style={{background:"#0a0f1e",border:`1px solid ${isDone?"#10b98133":"#22c55e33"}`,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:isDone?0:6}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:isDone?"#10b981":"#22c55e",flexShrink:0,animation:"pulse 2s infinite"}} />
                            {editingJob===activeJob.id
                              ? <input value={activeJob.partName} onChange={e=>updateJobField(activeJob.id,"partName",e.target.value)}
                                  onBlur={()=>setEditingJob(null)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditingJob(null);}}
                                  autoFocus style={{flex:1,background:"#0a0f1e",border:"1px solid #3b82f6",borderRadius:4,padding:"2px 6px",color:"#fff",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,outline:"none"}} />
                              : <span onClick={()=>setEditingJob(activeJob.id)} style={{fontSize:13,color:"#fff",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",borderBottom:"1px dashed #334155"}} title="Click to rename">{activeJob.partName}</span>
                            }
                            {isDone ? <span style={{fontSize:11,color:"#10b981"}}>✓ Done!</span>
                              : timer.editingTime ? (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <input value={timer.editValue||""} onChange={e=>setEditTimerValue(printer.id,e.target.value)}
                                    onKeyDown={e=>{if(e.key==="Enter")saveEditTimer(printer.id);if(e.key==="Escape")cancelEditTimer(printer.id);}}
                                    autoFocus style={{width:72,background:"#0a0f1e",border:"1px solid #22c55e",borderRadius:4,padding:"2px 6px",color:"#22c55e",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,outline:"none"}} />
                                  <button onClick={()=>saveEditTimer(printer.id)} style={{background:"none",border:"none",color:"#22c55e",cursor:"pointer",fontSize:13,padding:0}}>✓</button>
                                  <button onClick={()=>cancelEditTimer(printer.id)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                                </div>
                              ) : (
                                <span onClick={()=>startEditTimer(printer.id,remaining)} style={{fontSize:13,color:"#22c55e",fontWeight:600,cursor:"pointer",borderBottom:"1px dashed #22c55e55"}} title="Click to edit">{formatCountdown(remaining)}</span>
                              )}
                          </div>
                          {!isDone && (<>
                            <div style={{height:4,background:"#1a2540",borderRadius:2,overflow:"hidden",marginBottom:6}}>
                              <div style={{height:"100%",width:`${pct}%`,background:"#22c55e",borderRadius:2}} />
                            </div>
                            <div style={{fontSize:10,color:"#334155",marginBottom:8}}>🏁 {formatFinishTime(timer.startedAt,timer.durationSecs)}</div>
                          </>)}
                          <div style={{display:"flex",gap:6,marginTop:isDone?8:0}}>
                            {isDone ? (
                              <button className="btn btn-green" style={{fontSize:11}} onClick={()=>{completeJob(timer.jobId);stopTimer(printer.id);}}>✓ Mark Complete</button>
                            ) : (
                              <button className="btn btn-red" style={{fontSize:11}} onClick={()=>stopTimer(printer.id)}>■ Stop Timer</button>
                            )}
                          </div>
                        </div>
                      )}
                      <div style={{fontSize:10,color:"#2a3a5a",letterSpacing:"0.07em",marginBottom:8}}>QUEUE ({printerJobs.length})</div>
                      {printerJobs.length===0 ? (
                        <div style={{fontSize:12,color:"#1e293b",fontStyle:"italic",padding:"12px",textAlign:"center",border:"1px dashed #1a2540",borderRadius:8}}>Empty — drag jobs here</div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {printerJobs.map((job,idx)=>{
                            const isActive=timer?.jobId===job.id;
                            return (
                              <div key={job.id} draggable onDragStart={()=>dragStart(job.id,printer.id)}
                                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#0a0f1e",borderRadius:8,border:`1px solid ${isActive?"#22c55e33":"#1a2540"}`,cursor:"grab",userSelect:"none"}}>
                                <span style={{fontSize:10,color:"#1e293b",width:14,flexShrink:0}}>{idx+1}</span>
                                <div style={{display:"flex",gap:3,flexShrink:0}}>
                                  {job.colors.map((c,ci)=><div key={ci} style={{width:10,height:10,borderRadius:2,background:c}} />)}
                                </div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:12,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.partName}</div>
                                  <div style={{fontSize:10,color:"#1e293b"}}>🕐 {job.printTime}</div>
                                </div>
                                {!timer&&idx===0 && (
                                  <button className="btn btn-green" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>startTimer(printer.id,job)}>▶ Start</button>
                                )}
                                <button className="btn btn-gray" style={{fontSize:10,padding:"3px 6px"}} onClick={()=>unqueueJob(job.id)} title="Remove from queue">↩</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* COMPLETED */}
          {activeTab==="completed" && (
            <div>
              {doneJobs.length===0 ? (
                <div style={{textAlign:"center",padding:"64px 0"}}>
                  <div style={{fontSize:40,marginBottom:12}}>✓</div>
                  <div style={{fontSize:14,color:"#334155"}}>No completed jobs yet.</div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[...doneJobs].reverse().map(job=>(
                    <div key={job.id} style={{background:"#0d1424",border:"1px solid #1a2540",borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
                      {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:48,height:36,objectFit:"cover",borderRadius:5,border:"1px solid #1a2540",flexShrink:0}} />}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.partName}</div>
                        <div style={{display:"flex",gap:8,fontSize:11,color:"#334155",marginTop:2,flexWrap:"wrap"}}>
                          <span>🕐 {job.printTime}</span>
                          {job.totalGrams!=null && <span>🧵 {job.totalGrams}g</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:3,flexShrink:0}}>
                        {job.colors?.map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:2,background:c}} />)}
                      </div>
                      <span style={{fontSize:12,color:"#10b98166",flexShrink:0}}>✓</span>
                      <button className="btn btn-gray" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>removeJob(job.id)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}