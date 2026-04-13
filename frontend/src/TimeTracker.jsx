import { useState, useEffect, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL;

// ─── Palette ──────────────────────────────────────────────────────────────────
const STUDY_COLOR = "#6EE7B7";
const VIDEO_COLOR = "#F9A8D4";

// ─── Cairo helpers ────────────────────────────────────────────────────────────
const cairoToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

const cairoNowLabel = () =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date());

// ─── Format ───────────────────────────────────────────────────────────────────
const toHHMM = (mins) => {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m`;
};

// ─── Calendar math ────────────────────────────────────────────────────────────
const monthKey  = (y, mo) => `${y}-${String(mo+1).padStart(2,"0")}`;
const getDays   = (y, mo) => new Date(y, mo+1, 0).getDate();
const getOffset = (y, mo) => new Date(y, mo, 1).getDay();

// ─── Log row ──────────────────────────────────────────────────────────────────
function LogRow({ entry, color }) {
  return (
    <div style={ls.row}>
      <span style={{ color, fontWeight:700, fontSize:"0.74rem" }}>+{entry.added}m</span>
      <span style={ls.at}>{entry.at}</span>
    </div>
  );
}
const ls = {
  row: { display:"flex", justifyContent:"space-between", alignItems:"center",
         padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" },
  at:  { fontSize:"0.68rem", color:"#475569" },
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TimeTracker() {
  const [records,  setRecords]  = useState({});
  const [loading,  setLoading]  = useState(true);
  const [viewDate, setViewDate] = useState(() => {
    const t = cairoToday();
    return { year:+t.slice(0,4), month:+t.slice(5,7)-1 };
  });
  const [selected, setSelected] = useState(cairoToday);
  const [studyMin, setStudyMin] = useState("");
  const [videoMin, setVideoMin] = useState("");
  const [clock,    setClock]    = useState(cairoNowLabel);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    const id = setInterval(() => setClock(cairoNowLabel()), 30_000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg, ok=true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  // ── GET all ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API);
      setRecords(await res.json());
    } catch {
      showToast("Cannot reach server — is it running?", false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── PATCH: add minutes ────────────────────────────────────────────────────
  const addMinutes = async (type) => {
    const raw  = type === "study" ? studyMin : videoMin;
    const mins = parseInt(raw, 10);
    if (isNaN(mins) || mins <= 0) { showToast("Enter a positive number of minutes", false); return; }
    try {
      const res = await fetch(`${API}/${selected}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ type, mins }),
      });
      if (!res.ok) throw new Error();
      const { record } = await res.json();
      setRecords(prev => ({ ...prev, [selected]: record }));
      type==="study" ? setStudyMin("") : setVideoMin("");
      showToast(`+${mins}m added to ${type==="study"?"📚 Study":"🎬 Video"}`);
    } catch { showToast("Failed to save — check server", false); }
  };

  // ── DELETE: entire day ────────────────────────────────────────────────────
  const deleteDay = async () => {
    if (!records[selected]) return;
    if (!window.confirm(`Delete all data for ${selected}?`)) return;
    try {
      const res = await fetch(`${API}/${selected}`, { method:"DELETE" });
      if (!res.ok) throw new Error();
      setRecords(prev => { const n={...prev}; delete n[selected]; return n; });
      showToast(`Deleted ${selected}`);
    } catch { showToast("Delete failed", false); }
  };

  // ── DELETE: reset one type ────────────────────────────────────────────────
  const resetType = async (type) => {
    try {
      const res = await fetch(`${API}/${selected}/${type}`, { method:"DELETE" });
      if (!res.ok) throw new Error();
      const { record } = await res.json();
      setRecords(prev => ({ ...prev, [selected]: record }));
      showToast(`${type==="study"?"Study":"Video"} reset for ${selected}`);
    } catch { showToast("Reset failed", false); }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:"application/json"}));
    a.download = "time_tracker_export.json";
    a.click();
    showToast("JSON downloaded ↓");
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        await Promise.all(
          Object.entries(parsed).map(([date,record]) =>
            fetch(`${API}/${date}`,{ method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(record) })
          )
        );
        await fetchAll();
        showToast("Imported & saved to data.json ✓");
      } catch { showToast("Import failed — invalid JSON?", false); }
    };
    r.readAsText(file);
    e.target.value = "";
  };

  // ── Month nav ─────────────────────────────────────────────────────────────
  const prevMonth = () => setViewDate(({year,month}) => month===0?{year:year-1,month:11}:{year,month:month-1});
  const nextMonth = () => setViewDate(({year,month}) => month===11?{year:year+1,month:0}:{year,month:month+1});

  // ── Derived ───────────────────────────────────────────────────────────────
  const { year, month } = viewDate;
  const days     = getDays(year,month);
  const offset   = getOffset(year,month);
  const mk       = monthKey(year,month);
  const todayKey = cairoToday();
  const monthName= new Date(year,month,1).toLocaleString("en-US",{month:"long"});

  let totalStudy=0, totalVideo=0;
  for (let d=1;d<=days;d++){
    const k=`${mk}-${String(d).padStart(2,"0")}`;
    if(records[k]){totalStudy+=records[k].study||0;totalVideo+=records[k].video||0;}
  }

  const selRec   = records[selected]||null;
  const selStudy = selRec?.study||0;
  const selVideo = selRec?.video||0;
  const selTotal = selStudy+selVideo;
  const selLabel = new Date(selected+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  return (
    <div style={S.root}>
      <div style={{...S.blob,top:-80,left:-60,background:"rgba(110,231,183,0.11)",width:380,height:380}}/>
      <div style={{...S.blob,bottom:-60,right:-40,background:"rgba(249,168,212,0.09)",width:310,height:310}}/>

      {toast && (
        <div style={{...S.toast,background:toast.ok?"#0f172a":"#450a0a",borderColor:toast.ok?STUDY_COLOR:"#ef4444"}}>
          {toast.ok?"✓":"✗"} {toast.msg}
        </div>
      )}

      <div style={S.card}>
        <header style={S.header}>
          <div>
            <h1 style={S.title}>Time Tracker</h1>
            <p style={S.sub}>
              🕐 Cairo — <strong style={{color:"#94a3b8"}}>{clock}</strong>
              &ensp;·&ensp;Today: <strong style={{color:STUDY_COLOR}}>{todayKey}</strong>
              &ensp;·&ensp;
              <span style={{color:loading?"#f59e0b":"#22c55e",fontWeight:600}}>
                {loading?"⏳ syncing…":"● live · data.json"}
              </span>
            </p>
          </div>
          <div style={S.headerBtns}>
            <button style={{...S.iconBtn,color:"#94a3b8"}} onClick={fetchAll}>↻ Reload</button>
            <button style={{...S.iconBtn,color:STUDY_COLOR}} onClick={handleExport}>↓ Export</button>
            <label  style={{...S.iconBtn,color:VIDEO_COLOR,cursor:"pointer"}}>
              ↑ Import<input type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
            </label>
          </div>
        </header>

        <div style={S.body}>
          {/* Calendar */}
          <section style={S.calSection}>
            <div style={S.monthRow}>
              <button style={S.navBtn} onClick={prevMonth}>‹</button>
              <span style={S.monthLabel}>{monthName} {year}</span>
              <button style={S.navBtn} onClick={nextMonth}>›</button>
            </div>
            <div style={S.weekRow}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={S.weekDay}>{d}</div>)}
            </div>
            <div style={S.grid}>
              {Array.from({length:offset}).map((_,i)=><div key={`x${i}`}/>)}
              {Array.from({length:days}).map((_,i)=>{
                const d=i+1, key=`${mk}-${String(d).padStart(2,"0")}`;
                const rec=records[key], isSel=key===selected, isTod=key===todayKey;
                return (
                  <button key={key} onClick={()=>setSelected(key)}
                    style={{...S.dayCell,...(isSel?S.daySel:{}),...(isTod&&!isSel?S.dayToday:{})}}>
                    <span style={S.dayNum}>{d}</span>
                    {rec&&<>
                      <div style={S.dots}>
                        {(rec.study||0)>0&&<span style={{...S.dot,background:STUDY_COLOR}}/>}
                        {(rec.video||0)>0&&<span style={{...S.dot,background:VIDEO_COLOR}}/>}
                      </div>
                      <div style={S.miniTime}>
                        {(rec.study||0)>0&&<span style={{color:STUDY_COLOR}}>{toHHMM(rec.study)}</span>}
                        {(rec.video||0)>0&&<span style={{color:VIDEO_COLOR}}>{toHHMM(rec.video)}</span>}
                      </div>
                    </>}
                  </button>
                );
              })}
            </div>
            <div style={S.totals}>
              <div style={S.chip}><span style={{color:STUDY_COLOR}}>📚 Study</span><strong>{toHHMM(totalStudy)}</strong></div>
              <div style={S.chip}><span style={{color:VIDEO_COLOR}}>🎬 Video</span><strong>{toHHMM(totalVideo)}</strong></div>
              <div style={S.chip}><span style={{color:"#94a3b8"}}>⏱ Total</span><strong>{toHHMM(totalStudy+totalVideo)}</strong></div>
            </div>
          </section>

          {/* Panel */}
          <section style={S.panel}>
            <div style={S.panelHead}>
              <h2 style={S.panelTitle}>{selLabel}</h2>
              {selRec&&<button style={S.delDayBtn} onClick={deleteDay}>🗑 Delete day</button>}
            </div>

            <div style={S.accumRow}>
              <div style={{...S.accumBox,borderColor:STUDY_COLOR+"44"}}>
                <span style={{color:STUDY_COLOR,fontSize:"1.4rem",fontWeight:800,lineHeight:1}}>{toHHMM(selStudy)}</span>
                <span style={S.accumLabel}>📚 Study total</span>
              </div>
              <div style={{...S.accumBox,borderColor:VIDEO_COLOR+"44"}}>
                <span style={{color:VIDEO_COLOR,fontSize:"1.4rem",fontWeight:800,lineHeight:1}}>{toHHMM(selVideo)}</span>
                <span style={S.accumLabel}>🎬 Video total</span>
              </div>
            </div>

            {selTotal>0&&(
              <div style={S.barWrap}>
                <div style={{...S.barSeg,width:`${(selStudy/selTotal)*100}%`,background:STUDY_COLOR}}/>
                <div style={{...S.barSeg,width:`${(selVideo/selTotal)*100}%`,background:VIDEO_COLOR}}/>
              </div>
            )}

            {/* Study */}
            <div style={S.addBlock}>
              <label style={{...S.label,color:STUDY_COLOR}}>📚 Add Study minutes</label>
              <div style={S.addRow}>
                <input type="number" min="1" placeholder="e.g. 45" value={studyMin}
                  onChange={e=>setStudyMin(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addMinutes("study")}
                  style={{...S.input,borderColor:STUDY_COLOR+"55"}}/>
                <button style={{...S.addBtn,background:STUDY_COLOR}} onClick={()=>addMinutes("study")}>+ Add</button>
              </div>
              {(selRec?.studyLog||[]).length>0&&(
                <div style={S.logBox}>
                  <div style={S.logHdr}><span>Session log</span>
                    <button style={S.miniClear} onClick={()=>resetType("study")}>Reset</button></div>
                  {[...(selRec.studyLog||[])].reverse().map((e,i)=><LogRow key={i} entry={e} color={STUDY_COLOR}/>)}
                </div>
              )}
            </div>

            {/* Video */}
            <div style={S.addBlock}>
              <label style={{...S.label,color:VIDEO_COLOR}}>🎬 Add Video minutes</label>
              <div style={S.addRow}>
                <input type="number" min="1" placeholder="e.g. 30" value={videoMin}
                  onChange={e=>setVideoMin(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addMinutes("video")}
                  style={{...S.input,borderColor:VIDEO_COLOR+"55"}}/>
                <button style={{...S.addBtn,background:VIDEO_COLOR}} onClick={()=>addMinutes("video")}>+ Add</button>
              </div>
              {(selRec?.videoLog||[]).length>0&&(
                <div style={S.logBox}>
                  <div style={S.logHdr}><span>Session log</span>
                    <button style={S.miniClear} onClick={()=>resetType("video")}>Reset</button></div>
                  {[...(selRec.videoLog||[])].reverse().map((e,i)=><LogRow key={i} entry={e} color={VIDEO_COLOR}/>)}
                </div>
              )}
            </div>

            <div style={S.infoBox}>
              <p style={S.infoText}>
                💾 Every action is written to <code style={S.code}>data.json</code> on the server instantly.
                Use <strong>↓ Export</strong> to download a copy or <strong>↑ Import</strong> to restore one.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const S = {
  root:{minHeight:"100vh",background:"#080d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",
        display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 12px 60px",
        position:"relative",overflow:"hidden",color:"#e2e8f0"},
  blob:{position:"fixed",borderRadius:"50%",filter:"blur(90px)",pointerEvents:"none",zIndex:0},
  card:{position:"relative",zIndex:1,background:"rgba(13,20,38,0.96)",border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:24,width:"100%",maxWidth:1040,backdropFilter:"blur(24px)",
        boxShadow:"0 40px 100px rgba(0,0,0,0.7)",overflow:"hidden"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 28px 16px",
          borderBottom:"1px solid rgba(255,255,255,0.06)"},
  title:{margin:0,fontSize:"1.65rem",fontWeight:800,letterSpacing:"-0.5px",color:"#f8fafc"},
  sub:{margin:"4px 0 0",fontSize:"0.76rem",color:"#64748b"},
  headerBtns:{display:"flex",gap:8},
  iconBtn:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",
           borderRadius:10,padding:"7px 14px",fontSize:"0.76rem",fontWeight:600,cursor:"pointer"},
  body:{display:"grid",gridTemplateColumns:"1fr 370px"},
  calSection:{padding:"20px 24px",borderRight:"1px solid rgba(255,255,255,0.06)"},
  monthRow:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12},
  monthLabel:{fontWeight:700,fontSize:"0.98rem",color:"#f1f5f9"},
  navBtn:{background:"rgba(255,255,255,0.07)",border:"none",color:"#94a3b8",borderRadius:8,
          width:30,height:30,fontSize:"1.1rem",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  weekRow:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:5},
  weekDay:{textAlign:"center",fontSize:"0.62rem",fontWeight:700,color:"#334155",paddingBottom:4,letterSpacing:"0.07em",textTransform:"uppercase"},
  grid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3},
  dayCell:{background:"rgba(255,255,255,0.025)",border:"1px solid transparent",borderRadius:9,
           padding:"5px 2px 4px",cursor:"pointer",display:"flex",flexDirection:"column",
           alignItems:"center",minHeight:56,transition:"all 0.12s",color:"#64748b"},
  daySel:{background:"rgba(110,231,183,0.1)",border:"1px solid #6EE7B7",color:"#f1f5f9"},
  dayToday:{border:"1px solid rgba(249,168,212,0.45)",color:"#f1f5f9"},
  dayNum:{fontSize:"0.76rem",fontWeight:700,marginBottom:2},
  dots:{display:"flex",gap:3,marginBottom:2},
  dot:{width:6,height:6,borderRadius:"50%",display:"inline-block",flexShrink:0},
  miniTime:{display:"flex",flexDirection:"column",gap:1,fontSize:"0.5rem",fontWeight:700,textAlign:"center"},
  totals:{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"},
  chip:{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"7px 12px",fontSize:"0.76rem"},
  panel:{padding:"22px 22px 20px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto",maxHeight:"84vh"},
  panelHead:{display:"flex",alignItems:"center",justifyContent:"space-between"},
  panelTitle:{margin:0,fontSize:"0.88rem",fontWeight:700,color:"#f1f5f9",letterSpacing:"-0.2px"},
  delDayBtn:{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",
             borderRadius:8,padding:"4px 10px",color:"#f87171",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"},
  accumRow:{display:"flex",gap:10},
  accumBox:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5,
            background:"rgba(255,255,255,0.04)",border:"1px solid",borderRadius:14,padding:"14px 8px"},
  accumLabel:{fontSize:"0.62rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"center"},
  barWrap:{display:"flex",height:7,borderRadius:8,overflow:"hidden",background:"rgba(255,255,255,0.07)"},
  barSeg:{transition:"width 0.35s ease",height:"100%"},
  addBlock:{display:"flex",flexDirection:"column",gap:7},
  label:{fontSize:"0.74rem",fontWeight:700,letterSpacing:"0.04em"},
  addRow:{display:"flex",gap:8},
  input:{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid",borderRadius:11,
         padding:"9px 12px",color:"#f1f5f9",fontSize:"0.94rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  addBtn:{border:"none",borderRadius:11,padding:"9px 15px",color:"#0a0f1e",fontWeight:800,fontSize:"0.84rem",cursor:"pointer",whiteSpace:"nowrap"},
  logBox:{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",
          borderRadius:10,padding:"7px 11px",maxHeight:110,overflowY:"auto"},
  logHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"0.65rem",
          color:"#475569",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5},
  miniClear:{background:"rgba(239,68,68,0.14)",border:"1px solid rgba(239,68,68,0.25)",
             borderRadius:6,padding:"2px 8px",color:"#f87171",fontSize:"0.63rem",fontWeight:700,cursor:"pointer"},
  infoBox:{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px",marginTop:4},
  infoText:{margin:0,fontSize:"0.72rem",color:"#64748b",lineHeight:1.5},
  code:{background:"rgba(255,255,255,0.08)",borderRadius:4,padding:"1px 5px",fontFamily:"monospace",fontSize:"0.75rem",color:"#94a3b8"},
  toast:{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",padding:"10px 22px",
         borderRadius:12,border:"1px solid",fontSize:"0.81rem",fontWeight:600,zIndex:999,
         color:"#f1f5f9",boxShadow:"0 8px 30px rgba(0,0,0,0.5)",letterSpacing:"0.02em",whiteSpace:"nowrap"},
};
