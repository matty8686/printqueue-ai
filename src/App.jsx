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
        if (pd?.length) setPrinters(pd.map(r=>({...r.data, status:"idle"})));
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
    setActiveTimers(prev => ({...prev, [printerId]: { jobId: job.id, startedAt: Date.now(), durationSecs: secs, editingTime: false }}));
    setPrinters(prev => prev.map(p => p.id===printerId ? {...p, status:"printing"} : p));
    showNotif(`Timer started for "${job.partName}"`);
  }
  function stopTimer(printerId) {
    setActiveTimers(prev => { const n={...prev}; delete n[printerId]; return n; });
    setPrinters(prev => prev.map(p => p.id===printerId ? {...p, status:"idle"} : p));
  }
  function updateTimerDuration(printerId, secs) {
    setActiveTimers(prev => ({...prev, [printerId]: { ...prev[printerId], durationSecs: secs, startedAt: Date.now(), editingTime: false }}));
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
5. Total filament used in grams (sum the Total column), or null
6. Total purge weight in grams (sum the Purged column), or null

Respond ONLY in valid JSON, no markdown:
{"colors":["#hex"],"printTime":"Xh Ym or null","partName":"string","colorCount":number,"totalGrams":number or null,"purgeWeightG":number or null,"notes":"string"}`;

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

  // ── Filament Slot Editor ──
  // Each job has an array of filament slots: { color, colorName, material, brand }
  // No inventory tracking — just labels for reference and color matching
  function FilamentSlotEditor({ job }) {
    const filaments = job.filaments || job.colors.map(c=>({color:c,colorName:"",material:"PLA",brand:"Bambu Lab"}));
    const [expandedSlot, setExpandedSlot] = useState(null);

    function updateSlot(i, field, value) {
      const updated = filaments.map((f,fi)=>fi===i?{...f,[field]:value}:f);
      if (field==="color") {
        // also sync colors array
        updateJobFilaments(job.id, updated);
      } else {
        updateJobFilaments(job.id, updated);
      }
    }
    function addSlot() {
      updateJobFilaments(job.id, [...filaments, {...BLANK_FILAMENT_SLOT}]);
      setExpandedSlot(filaments.length);
    }
    function removeSlot(i) {
      if (filaments.length<=1) return;
      updateJobFilaments(job.id, filaments.filter((_,fi)=>fi!==i));
      setExpandedSlot(null);
    }

    return (
      <div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
          {filaments.map((f,i)=>(
            <div key={i} style={{position:"relative"}}>
              <div onClick={()=>setExpandedSlot(expandedSlot===i?null:i)}
                style={{display:"flex",alignItems:"center",gap:6,background:"#0d0d15",border:`1px solid ${expandedSlot===i?"#2aff6e":"#2a2a3a"}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",minWidth:110}}>
                <label style={{position:"relative",width:16,height:16,flexShrink:0,cursor:"pointer"}} onClick={e=>e.stopPropagation()}>
                  <div style={{width:16,height:16,borderRadius:3,background:f.color,border:"1px solid #ffffff22"}} />
                  <input type="color" value={f.color} onChange={e=>updateSlot(i,"color",e.target.value)}
                    style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}} />
                </label>
                <div style={{flex:1,minWidth:0}}>
                  {f.colorName ? (
                    <div>
                      <div style={{fontSize:11,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.colorName}</div>
                      <div style={{fontSize:9,color:"#555"}}>{f.brand} · {f.material}</div>
                    </div>
                  ) : (
                    <div style={{fontSize:11,color:"#555",fontStyle:"italic"}}>Slot {i+1}</div>
                  )}
                </div>
                <span style={{fontSize:10,color:"#444"}}>▾</span>
                {filaments.length>1 && (
                  <span onClick={e=>{e.stopPropagation();removeSlot(i);}} style={{color:"#555",cursor:"pointer",fontSize:12,padding:"0 2px"}}>×</span>
                )}
              </div>
              {/* Expanded slot editor */}
              {expandedSlot===i && (
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:200,background:"#111118",border:"1px solid #2a2a3a",borderRadius:8,padding:"12px",minWidth:220,boxShadow:"0 8px 32px #000a"}}>
                  <div style={{fontSize:10,color:"#555",marginBottom:8,letterSpacing:"0.06em"}}>FILAMENT SLOT {i+1}</div>
                  <input value={f.colorName} onChange={e=>updateSlot(i,"colorName",e.target.value)} placeholder="Color name (e.g. Jade Green)"
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'IBM Plex Mono',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0"}}>

      {/* Header */}
      <div style={{background:"#0d0d15",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#2aff6e,#00b8ff)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>⬡</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:"#fff",letterSpacing:"-0.02em"}}>PrintQueue<span style={{color:"#2aff6e"}}>AI</span></div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {syncing   && <span style={{fontSize:10,color:"#2aff6e",animation:"pulse 1s infinite"}}>syncing…</span>}
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

      {/* API Key Bar */}
      {showApiKey && (
        <div style={{background:"#0d0d15",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#555",flexShrink:0}}>Gemini API Key:</span>
          <input type="password" value={apiKey} onChange={e=>saveApiKey(e.target.value)} placeholder="AIza..."
            style={{flex:1,minWidth:180,maxWidth:380,background:"#111118",border:"1px solid #2a2a3a",borderRadius:6,padding:"6px 12px",color:"#fff",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,outline:"none"}} />
          <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setShowApiKey(false)}>Done</button>
        </div>
      )}

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
            <button className="btn btn-gray" style={{flex:1}} onClick={()=>{setPendingFile(null);setPendingPreview(null);setSlicedForMultiTool(null);}}>Cancel</button>
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

      <div style={{maxWidth:1200,margin:"0 auto",padding:"16px 12px"}}>

        {/* Upload Zone */}
        <div onClick={()=>!analyzing&&fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles([...e.dataTransfer.files]);}}
          style={{border:`2px dashed ${dragOver?"#2aff6e":analyzing?"#00b8ff":"#2a2a3a"}`,borderRadius:10,padding:"20px 16px",textAlign:"center",cursor:analyzing?"default":"pointer",background:dragOver?"#0d2a1a":"transparent",transition:"all 0.2s",marginBottom:16}}>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFiles([...e.target.files])} />
          {analyzing ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
              <Spinner color="#00b8ff" />
              <div style={{color:"#00b8ff",fontSize:13}}>Analyzing screenshot…</div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:24,marginBottom:6}}>📸</div>
              <div style={{color:"#ccc",fontSize:13,fontFamily:"'Space Grotesk',sans-serif",fontWeight:600}}>Drop slicer screenshot</div>
              <div style={{color:"#555",fontSize:11,marginTop:3}}>or click to browse · <kbd style={{background:"#1e1e2e",border:"1px solid #333",borderRadius:3,padding:"1px 5px",fontSize:10,color:"#888"}}>Ctrl+V</kbd> to paste</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{borderBottom:"1px solid #1e1e2e",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",overflowX:"auto"}}>
          <div style={{display:"flex"}}>
            {[
              {id:"dashboard", label:"Dashboard"},
              {id:"queue",     label:`Queue (${allJobs.length})`},
              {id:"printers",  label:`Printers (${printers.length})`},
              {id:"completed", label:`Done (${doneJobs.length})`},
            ].map(t=>(
              <button key={t.id} className={`tab-btn ${activeTab===t.id?"active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>
          {activeTab==="printers" && (
            <button className="btn btn-green" style={{fontSize:11,padding:"3px 10px",flexShrink:0}} onClick={()=>setEditingPrinter({...BLANK_PRINTER})}>+ Add</button>
          )}
        </div>

        {/* ════════ DASHBOARD ════════ */}
        {activeTab==="dashboard" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
              {[
                { label:"PRINTING",    value: Object.keys(activeTimers).length,                                    color:"#00b8ff" },
                { label:"IDLE",        value: printers.filter(p=>!activeTimers[p.id]&&p.status==="idle").length,   color:"#555"    },
                { label:"IN QUEUE",    value: queuedJobs.length,                                                   color:"#2aff6e" },
                { label:"PENDING",     value: pendingJobs.length,                                                  color:"#ffaa2a" },
                { label:"DONE TODAY",  value: doneJobs.length,                                                     color:"#34d399" },
              ].map(s=>(
                <div key={s.label} className="card" style={{padding:"12px",textAlign:"center"}}>
                  <div style={{fontSize:26,fontWeight:700,color:s.color,fontFamily:"'Space Grotesk',sans-serif"}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#555",letterSpacing:"0.08em",marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Printer grid */}
            <div>
              <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:10}}>FARM STATUS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                {printers.map(printer=>{
                  const timer       = activeTimers[printer.id];
                  const printerJobs = jobs.filter(j=>printer.queue.includes(j.id));
                  const activeJob   = timer ? jobs.find(j=>j.id===timer.jobId) : printerJobs[0];
                  const elapsed     = timer ? (now - timer.startedAt)/1000 : 0;
                  const remaining   = timer ? timer.durationSecs - elapsed : null;
                  const isDone      = timer && remaining <= 0;
                  const pct         = timer && !isDone ? Math.min(100, Math.round(elapsed/timer.durationSecs*100)) : isDone ? 100 : 0;
                  const statusColor = isDone?"#2aff6e":timer?"#00b8ff":printer.status==="printing"?"#ffaa2a":"#444";
                  const statusLabel = isDone?"DONE ✓":timer?"PRINTING":printer.status==="printing"?"PRINTING":"IDLE";

                  return (
                    <div key={printer.id} className="card" onClick={()=>setActiveTab("printers")}
                      style={{padding:"12px",border:`1px solid ${isDone?"#2aff6e44":timer?"#00b8ff22":"#1e1e2e"}`,cursor:"pointer",transition:"border-color 0.2s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=isDone?"#2aff6e88":timer?"#00b8ff44":"#2aff6e44"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=isDone?"#2aff6e44":timer?"#00b8ff22":"#1e1e2e"}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:statusColor,flexShrink:0,animation:(isDone||timer)?"pulse 2s infinite":"none"}} />
                        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#fff",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{printer.name}</div>
                        <span style={{fontSize:9,color:statusColor,letterSpacing:"0.06em",flexShrink:0}}>{statusLabel}</span>
                      </div>
                      {activeJob ? (<>
                        <div style={{fontSize:11,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{activeJob.partName}</div>
                        <div style={{display:"flex",gap:3,marginBottom:6}}>
                          {activeJob.colors?.map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}
                        </div>
                        {timer && !isDone && (<>
                          <div style={{fontSize:12,color:"#00b8ff",fontWeight:600,marginBottom:2}}>{formatCountdown(remaining)}</div>
                          <div style={{fontSize:10,color:"#555",marginBottom:6}}>🏁 {formatFinishTime(timer.startedAt, timer.durationSecs)}</div>
                          <div style={{height:3,background:"#1e1e2e",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:"#00b8ff",borderRadius:2}} />
                          </div>
                        </>)}
                        {isDone && (<>
                          <div style={{fontSize:11,color:"#2aff6e",fontWeight:600,marginBottom:6}}>✓ Print complete — check printer</div>
                          <button className="btn btn-green" style={{width:"100%",fontSize:10,padding:"4px"}}
                            onClick={e=>{e.stopPropagation();completeJob(timer.jobId);stopTimer(printer.id);}}>✓ Mark Complete</button>
                        </>)}
                        {!timer && (
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:"#555"}}>🕐 {activeJob.printTime}</span>
                            <button className="btn btn-green" style={{fontSize:9,padding:"2px 8px"}}
                              onClick={e=>{e.stopPropagation();startTimer(printer.id,activeJob);}}>▶ Start</button>
                          </div>
                        )}
                      </>) : (
                        <div style={{fontSize:11,color:"#444",fontStyle:"italic"}}>No jobs queued</div>
                      )}
                      {printerJobs.length>1 && (
                        <div style={{fontSize:10,color:"#444",marginTop:6,borderTop:"1px solid #1e1e2e",paddingTop:6}}>+{printerJobs.length-1} more queued</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active timers sorted by finish time */}
            {Object.keys(activeTimers).length>0 && (
              <div>
                <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:10}}>ESTIMATED FINISH TIMES</div>
                <div className="card" style={{padding:"14px 16px"}}>
                  {Object.entries(activeTimers)
                    .map(([pid,timer])=>{
                      const printer   = printers.find(p=>p.id===parseInt(pid));
                      const job       = jobs.find(j=>j.id===timer.jobId);
                      const elapsed   = (now-timer.startedAt)/1000;
                      const remaining = timer.durationSecs-elapsed;
                      const isDone    = remaining<=0;
                      return { printer, job, remaining, isDone, finishTs: timer.startedAt+timer.durationSecs*1000, pid, timer };
                    })
                    .sort((a,b)=>a.finishTs-b.finishTs)
                    .map(({printer,job,remaining,isDone,pid,timer},i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:"1px solid #1e1e2e"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:isDone?"#2aff6e":"#00b8ff",flexShrink:0,animation:"pulse 2s infinite"}} />
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:"#fff",fontWeight:600}}>{printer?.name}</div>
                          <div style={{fontSize:11,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job?.partName}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          {isDone ? (
                            <div style={{fontSize:12,color:"#2aff6e",fontWeight:600}}>✓ Done</div>
                          ) : (<>
                            <div style={{fontSize:12,color:"#00b8ff",fontWeight:600}}>{formatCountdown(remaining)}</div>
                            <div style={{fontSize:10,color:"#555"}}>{formatFinishTime(timer.startedAt, timer.durationSecs)}</div>
                          </>)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ QUEUE TAB ════════ */}
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
                        const recommended = ranked[0]?.printer||null;
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
                                  {job.totalGrams!=null   && <span>🧵 {job.totalGrams}g</span>}
                                  {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#fbbf24":"#666"}}>🗑 {job.purgeWeightG}g purge{job.highPurge?" ⚠":""}</span>}
                                  <span style={{color:"#444"}}>{job.addedAt}</span>
                                </div>
                                {/* Filament slots */}
                                <div style={{marginBottom:12}}>
                                  <div style={{fontSize:10,color:"#555",marginBottom:6,letterSpacing:"0.05em"}}>FILAMENTS <span style={{color:"#333",fontWeight:400}}>(click slot to set brand/name)</span></div>
                                  <FilamentSlotEditor job={job} />
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
                    const filaments = job.filaments || job.colors.map(c=>({color:c,colorName:"",material:"PLA",brand:"Bambu Lab"}));
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
                            {job.totalGrams!=null && <span>🧵 {job.totalGrams}g</span>}
                            {job.purgeWeightG!=null && <span style={{color:job.highPurge?"#fbbf24":"#555"}}>🗑 {job.purgeWeightG}g purge</span>}
                          </div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                            {filaments.map((f,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#0d0d15",border:"1px solid #1e1e2e",borderRadius:5,padding:"3px 7px"}}>
                                <div style={{width:10,height:10,borderRadius:2,background:f.color,border:"1px solid #ffffff22"}} />
                                <span style={{fontSize:10,color:"#888"}}>{f.colorName||f.color}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setEditingJob(isEditing?null:job.id)}>
                              {isEditing?"Save":"Edit"}
                            </button>
                            <button className="btn btn-green" style={{fontSize:11}} onClick={()=>completeJob(job.id)}>✓ Complete</button>
                            {showUnqueue && <button className="btn btn-gray" style={{fontSize:11,marginLeft:"auto"}} onClick={()=>unqueueJob(job.id)}>↩ Unqueue</button>}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div>
                      <div style={{fontSize:11,color:"#555",letterSpacing:"0.08em",marginBottom:10}}>QUEUED — IN PRINTER QUEUES</div>
                      {unassigned.length>0 && (
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:10,color:"#444",letterSpacing:"0.06em",marginBottom:6}}>UNASSIGNED</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>{unassigned.map(job=><JobCard key={job.id} job={job} showUnqueue />)}</div>
                        </div>
                      )}
                      {printers.filter(p=>assigned.some(j=>j.assignedPrinterId===p.id)).map(printer=>(
                        <div key={printer.id} style={{marginBottom:14}} onDragOver={e=>e.preventDefault()} onDrop={()=>dropOnPrinter(printer.id)}>
                          <div style={{fontSize:10,color:"#444",letterSpacing:"0.06em",marginBottom:6}}>{printer.name.toUpperCase()}</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {assigned.filter(j=>j.assignedPrinterId===printer.id).map(job=>(
                              <div key={job.id} draggable onDragStart={()=>dragStart(job.id,printer.id)}>
                                <JobCard job={job} showUnqueue />
                              </div>
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

        {/* ════════ PRINTERS TAB ════════ */}
        {activeTab==="printers" && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {printers.length===0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
                <div style={{fontSize:13}}>No printers yet. Click "+ Add" to get started.</div>
              </div>
            ) : printers.map(printer=>{
              const timer       = activeTimers[printer.id];
              const printerJobs = jobs.filter(j=>printer.queue.includes(j.id));
              const activeJob   = timer ? jobs.find(j=>j.id===timer.jobId) : printerJobs[0];
              const elapsed     = timer ? (now-timer.startedAt)/1000 : 0;
              const remaining   = timer ? timer.durationSecs-elapsed : null;
              const isDone      = timer && remaining<=0;
              const pct         = timer&&!isDone ? Math.min(100,Math.round(elapsed/timer.durationSecs*100)) : isDone?100:0;
              return (
                <div key={printer.id} className="card printer-card" style={{padding:"16px"}}
                  onDragOver={e=>e.preventDefault()} onDrop={()=>dropOnPrinter(printer.id)}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,color:"#fff"}}>{printer.name}</div>
                      <div style={{fontSize:11,color:"#555",marginTop:2}}>{printer.hasToolChanger?"🔧 Multi-Tool":"🖨️ Single Tool"} · {printer.maxColors} slot{printer.maxColors!==1?"s":""}</div>
                    </div>
                    <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap",maxWidth:160}}>
                      {printer.loadedColors.map((c,i)=>(
                        <div key={i} title={printer.colorNames[i]||`Slot ${i+1}`} style={{width:16,height:16,borderRadius:3,background:c,border:"1px solid #ffffff22"}} />
                      ))}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button className="btn btn-gray" style={{fontSize:11}} onClick={()=>setEditingPrinter({...printer,loadedColors:[...printer.loadedColors],colorNames:[...printer.colorNames]})}>Edit</button>
                      <button className="btn btn-red"  style={{fontSize:11}} onClick={()=>setConfirmDelete(printer.id)}>Remove</button>
                    </div>
                  </div>

                  {timer && activeJob && (
                    <div style={{background:"#0a0a12",border:"1px solid #1e2e3e",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:isDone?"#2aff6e":"#00b8ff",flexShrink:0,animation:"pulse 2s infinite"}} />
                        <span style={{fontSize:12,color:"#fff",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeJob.partName}</span>
                        {isDone
                          ? <span style={{fontSize:11,color:"#2aff6e"}}>✓ Done!</span>
                          : <span style={{fontSize:12,color:"#00b8ff",fontWeight:600}}>{formatCountdown(remaining)}</span>}
                      </div>
                      {!isDone && (<>
                        <div style={{height:3,background:"#1e1e2e",borderRadius:2,overflow:"hidden",marginBottom:6}}>
                          <div style={{height:"100%",width:`${pct}%`,background:"#00b8ff",borderRadius:2}} />
                        </div>
                        <div style={{fontSize:10,color:"#555",marginBottom:6}}>🏁 {formatFinishTime(timer.startedAt,timer.durationSecs)}</div>
                      </>)}
                      <div style={{display:"flex",gap:6}}>
                        {isDone ? (
                          <button className="btn btn-green" style={{fontSize:11}} onClick={()=>{completeJob(timer.jobId);stopTimer(printer.id);}}>✓ Mark Complete</button>
                        ) : (
                          <button className="btn btn-red" style={{fontSize:11}} onClick={()=>stopTimer(printer.id)}>■ Stop Timer</button>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{fontSize:10,color:"#555",letterSpacing:"0.07em",marginBottom:8}}>QUEUE ({printerJobs.length})</div>
                    {printerJobs.length===0 ? (
                      <div style={{fontSize:11,color:"#333",fontStyle:"italic",padding:"10px 0",textAlign:"center",border:"1px dashed #1e1e2e",borderRadius:6}}>Empty — drag jobs here</div>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {printerJobs.map((job,idx)=>{
                          const isActive = timer?.jobId===job.id;
                          return (
                            <div key={job.id} draggable onDragStart={()=>dragStart(job.id,printer.id)}
                              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#0d0d15",borderRadius:6,border:`1px solid ${isActive?"#00b8ff33":"#1e1e2e"}`,cursor:"grab",userSelect:"none"}}>
                              <span style={{fontSize:10,color:"#333",width:14,flexShrink:0}}>{idx+1}</span>
                              <div style={{display:"flex",gap:3,flexShrink:0}}>
                                {job.colors.map((c,ci)=><div key={ci} style={{width:10,height:10,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.partName}</div>
                                <div style={{fontSize:10,color:"#444"}}>🕐 {job.printTime}</div>
                              </div>
                              {!timer && idx===0 && (
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

        {/* ════════ COMPLETED TAB ════════ */}
        {activeTab==="completed" && (
          <div>
            {doneJobs.length===0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
                <div style={{fontSize:36,marginBottom:10}}>✓</div>
                <div style={{fontSize:13}}>No completed jobs yet.</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[...doneJobs].reverse().map(job=>(
                  <div key={job.id} className="card" style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
                    {job.imageUrl && <img src={job.imageUrl} alt="" style={{width:48,height:36,objectFit:"cover",borderRadius:4,border:"1px solid #2a2a3a",flexShrink:0}} />}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:13,color:"#888",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.partName}</div>
                      <div style={{display:"flex",gap:8,fontSize:11,color:"#444",marginTop:2,flexWrap:"wrap"}}>
                        <span>🕐 {job.printTime}</span>
                        {job.totalGrams!=null && <span>🧵 {job.totalGrams}g</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:3,flexShrink:0}}>
                      {job.colors?.map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:2,background:c,border:"1px solid #ffffff22"}} />)}
                    </div>
                    <span style={{fontSize:10,color:"#2aff6e44",flexShrink:0}}>✓</span>
                    <button className="btn btn-gray" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>removeJob(job.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}