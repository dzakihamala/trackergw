// src/App.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from './firebase';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import useSound from 'use-sound';
import { Play, Pause, Plus, AlertCircle, Trash2, Repeat, Infinity, CheckCircle2, GripVertical, CalendarDays, Settings as SettingsIcon, X, Hash, AlertTriangle, Clock, SkipForward, Zap, Coffee } from 'lucide-react';

// --- DND-KIT IMPORTS ---
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

// --- AUDIO ---
const SOUND_WORK_DONE = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const SOUND_BREAK_DONE = 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3';
const SOUND_COMPLETE = 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3';

const STORAGE_KEY = 'GRIND_OS_STATE_V2';

// --- WEB WORKER (INLINE) ---
const workerCode = `
let intervalId;
self.onmessage = function(e) {
  if (e.data === 'START') {
    if (!intervalId) {
      intervalId = setInterval(() => {
        self.postMessage('TICK');
      }, 10); // 10ms precision
    }
  } else if (e.data === 'STOP') {
    clearInterval(intervalId);
    intervalId = null;
  }
};
`;

// --- UTILS ---
const formatTimeMs = (milliseconds) => {
  const absMs = Math.abs(milliseconds);
  const h = Math.floor(absMs / 3600000);
  const m = Math.floor((absMs % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((absMs % 60000) / 1000).toString().padStart(2, '0');
  const ms = Math.floor((absMs % 1000) / 10).toString().padStart(2, '0'); 
  
  if (h > 0) return `${h}:${m}:${s}`; 
  return `${m}:${s}:${ms}`;
};

const formatDurationDetailed = (seconds) => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const getDeadlineStatus = (deadlineStr) => {
  if (!deadlineStr) return null;
  const target = new Date(deadlineStr);
  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  if (diffDays < 0) return { text: "TERLEWAT", bg: "bg-red-600 text-white border-red-600" };
  if (diffDays === 0) return { text: "HARI INI", bg: "bg-red-500 text-white border-red-500" };
  return { text: `${diffDays} HARI LAGI`, bg: "bg-white text-black border-2 border-black" };
};

const QUOTES = [
  "EXECUTE.",
  "PRECISION BEATS POWER.",
  "DISCIPLINE IS FREEDOM.",
  "FOCUS ON THE OUTCOME.",
  "MAKE IT HAPPEN."
];

// --- MODAL COMPONENTS ---

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, type = 'normal' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-100">
      <div className="bg-white border-4 border-black p-8 w-full max-w-sm shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative">
        <h2 className={`text-xl font-black uppercase mb-4 flex items-center gap-2 ${type === 'danger' ? 'text-red-600' : 'text-black'}`}>
          {type === 'danger' && <AlertTriangle size={24}/>}
          {title}
        </h2>
        <p className="font-bold text-gray-600 mb-8 uppercase text-sm leading-relaxed border-l-4 border-gray-200 pl-4">
          {message}
        </p>
        <div className="flex gap-4">
          <button onClick={onCancel} className="flex-1 py-3 font-bold border-2 border-gray-300 hover:border-black hover:bg-gray-100 uppercase transition-colors">
            BATAL
          </button>
          <button onClick={onConfirm} className={`flex-1 py-3 font-bold text-white border-2 border-black uppercase transition-transform hover:-translate-y-1 hover:shadow-lg ${type === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-black hover:bg-gray-800'}`}>
            YA, LANJUTKAN
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({ config, onSave, onClose }) => {
  const toHMS = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
  };

  const workHMS = toHMS(config.work);
  const shortHMS = toHMS(config.short);
  const longHMS = toHMS(config.long);

  const [localConfig, setLocalConfig] = useState({
    workH: workHMS.h, workM: workHMS.m, workS: workHMS.s,
    shortH: shortHMS.h, shortM: shortHMS.m, shortS: shortHMS.s,
    longH: longHMS.h, longM: longHMS.m, longS: longHMS.s,
    interval: config.interval
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const val = parseInt(value);
    setLocalConfig(prev => ({ ...prev, [name]: isNaN(val) ? 0 : val }));
  };

  const handleSave = () => {
    const newConfig = {
        work: (localConfig.workH * 3600) + (localConfig.workM * 60) + localConfig.workS,
        short: (localConfig.shortH * 3600) + (localConfig.shortM * 60) + localConfig.shortS,
        long: (localConfig.longH * 3600) + (localConfig.longM * 60) + localConfig.longS,
        interval: localConfig.interval
    };
    onSave(newConfig);
  };

  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white border-4 border-black p-6 w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative">
        <button onClick={onClose} className="absolute top-4 right-4 hover:bg-gray-200 p-1 rounded"><X size={24}/></button>
        <h2 className="text-xl font-black uppercase mb-6 border-b-2 border-black pb-2 flex items-center gap-2">
          <SettingsIcon size={24}/> KONFIGURASI
        </h2>
        <div className="space-y-6">
          {[ { label: "DURASI FOKUS", prefix: "work" }, { label: "BREAK PENDEK", prefix: "short" }, { label: "BREAK PANJANG", prefix: "long" } ].map((item) => (
            <div key={item.prefix}>
                <label className="block text-xs font-bold uppercase mb-2 border-l-4 border-black pl-2">{item.label}</label>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <span className="text-[9px] font-bold text-gray-400 uppercase">JAM</span>
                        <input type="number" name={`${item.prefix}H`} value={localConfig[`${item.prefix}H`]} onChange={handleChange} className="w-full border-2 border-black p-2 font-mono font-bold text-lg"/>
                    </div>
                    <div className="flex-1">
                        <span className="text-[9px] font-bold text-gray-400 uppercase">MENIT</span>
                        <input type="number" name={`${item.prefix}M`} value={localConfig[`${item.prefix}M`]} onChange={handleChange} className="w-full border-2 border-black p-2 font-mono font-bold text-lg"/>
                    </div>
                    <div className="flex-1">
                        <span className="text-[9px] font-bold text-red-400 uppercase">DETIK</span>
                        <input type="number" name={`${item.prefix}S`} value={localConfig[`${item.prefix}S`]} onChange={handleChange} className="w-full border-2 border-red-200 focus:border-red-500 p-2 font-mono font-bold text-lg"/>
                    </div>
                </div>
            </div>
          ))}
          <div>
            <label className="block text-xs font-bold uppercase mb-1 text-blue-600">Interval Long Break (Sesi)</label>
            <div className="relative">
                <Hash size={18} className="absolute left-3 top-4 text-gray-400"/>
                <input type="number" name="interval" value={localConfig.interval} onChange={handleChange} className="w-full border-2 border-black pl-10 p-3 font-mono font-bold text-lg"/>
            </div>
          </div>
        </div>
        <button onClick={handleSave} className="w-full mt-8 bg-black text-white font-bold py-3 uppercase hover:bg-white hover:text-black border-2 border-transparent hover:border-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:-translate-x-1">
          SIMPAN PENGATURAN
        </button>
      </div>
    </div>
  );
};

const AddTaskModal = ({ onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [deadline, setDeadline] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title) return;
    onAdd({ title, isUrgent, deadline });
  };

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-2 border-black p-8 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 font-bold hover:underline">TUTUP</button>
        <h2 className="text-2xl font-bold mb-8 uppercase tracking-wider border-b-2 border-black pb-2">
          MISI BARU
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-black uppercase mb-2">JUDUL TUGAS</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white border-2 border-black px-4 py-3 text-lg font-bold outline-none focus:bg-gray-50 placeholder-gray-400" placeholder="Ketik nama tugas..."/>
          </div>
          <div className="flex flex-col gap-4 p-4 border-2 border-black bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} className="w-6 h-6 accent-black cursor-pointer border-2 border-black"/>
              <span className={`font-bold uppercase ${isUrgent ? 'text-red-600' : 'text-black'}`}>PRIORITAS / DEADLINE</span>
            </label>
            {isUrgent && (
              <div className="animate-in slide-in-from-top-2">
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full bg-white border-2 border-black p-2 text-sm font-bold outline-none"/>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-4 mt-8">
            <button type="submit" className="bg-black text-white px-8 py-3 font-bold uppercase tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:-translate-x-1">DEPLOY</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SortableAgendaCard = ({ agenda, isSelected, onClick, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: agenda.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  const deadlineStatus = agenda.isUrgent ? getDeadlineStatus(agenda.deadline) : null;

  return (
    <div 
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(agenda.id)}
      className={`
        relative p-5 cursor-pointer flex flex-col justify-between group border-2 border-black bg-white transition-all min-h-[160px]
        ${isSelected 
          ? 'shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] -translate-y-1 -translate-x-1 bg-yellow-50' 
          : 'hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'}
        ${agenda.isUrgent ? 'border-l-[8px] border-l-red-600' : ''}
      `}
    >
      <div className="flex justify-between items-start gap-2">
        <h3 className={`font-bold text-black uppercase truncate leading-tight ${agenda.isUrgent ? 'text-md' : 'text-lg'}`}>
          {agenda.title}
        </h3>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded">
           <GripVertical className="text-black" size={20}/>
        </div>
      </div>
      <div className="flex flex-col items-start mt-4 w-full">
        {agenda.isUrgent ? (
          <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1 border-2 mb-2 ${deadlineStatus?.bg}`}>
             <CalendarDays size={14} className="text-inherit"/>
             {deadlineStatus?.text}
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
             <span className="text-3xl font-black tracking-tighter text-black tabular-nums font-mono">
               {formatDurationDetailed(agenda.todayDuration)}
             </span>
             <span className="text-[10px] font-bold text-gray-400 uppercase">HARI INI</span>
          </div>
        )}
        <div className="flex justify-between w-full border-t border-gray-200 pt-2 mt-2">
             <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide tabular-nums font-mono">
               TOTAL: {formatDurationDetailed(agenda.totalDuration)}
             </div>
        </div>
      </div>
      {!agenda.isUrgent && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(agenda); }}
            className="absolute bottom-3 right-3 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 border-2 border-transparent hover:border-red-600"
          >
            <Trash2 size={18} />
          </button>
      )}
    </div>
  );
};

// --- MAIN APP ---

function App() {
  const [agendas, setAgendas] = useState([]);
  const [selectedId, setSelectedId] = useState(null); 
  const [quote, setQuote] = useState(QUOTES[0]);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmation, setConfirmation] = useState({ isOpen: false, type: 'normal', title: '', message: '', onConfirm: () => {} });

  // Config (Seconds)
  const [config, setConfig] = useState({ work: 1500, short: 300, long: 900, interval: 4 });
  
  // Timer States
  const [isPomodoroMode, setIsPomodoroMode] = useState(true);
  const [timerMode, setTimerMode] = useState('work'); 
  const [timeLeftMs, setTimeLeftMs] = useState(1500 * 1000); 
  const [isActive, setIsActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(1);
  const [isOvertime, setIsOvertime] = useState(false);
  
  const workerRef = useRef(null);
  const accumulatedRef = useRef(0);

  // Derived State (Data Source)
  const selectedAgenda = useMemo(() => agendas.find(a => a.id === selectedId) || null, [agendas, selectedId]);

// Sounds
  const [playWorkDone] = useSound('/trackergw/work.mp3');
  const [playBreakDone] = useSound('/trackergw/break.mp3');
  const [playComplete] = useSound('/trackergw/finish.mp3');

  // DnD
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // WORKER SETUP
  useEffect(() => {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));
    workerRef.current.onmessage = (e) => {
      if (e.data === 'TICK') {
        handleTick();
      }
    };
    return () => workerRef.current.terminate();
  }, []);

  const stateRef = useRef({ isPomodoroMode, timerMode, timeLeftMs, isActive, isOvertime, selectedId });
  useEffect(() => {
    stateRef.current = { isPomodoroMode, timerMode, timeLeftMs, isActive, isOvertime, selectedId };
  }, [isPomodoroMode, timerMode, timeLeftMs, isActive, isOvertime, selectedId]);

  // --- TICK LOGIC ---
  const handleTick = () => {
    const { isPomodoroMode, timerMode, isOvertime, selectedId } = stateRef.current;

    // 1. VISUAL UPDATE
    if (!isPomodoroMode) {
       // FLOW: Count UP
       setTimeLeftMs(prev => prev + 10);
    } else {
       // POMODORO: Count DOWN / UP
       if (!isOvertime) {
           setTimeLeftMs((prev) => {
             if (prev <= 0) {
               setIsOvertime(true);
               timerMode === 'work' ? playWorkDone() : playBreakDone();
               return 0; 
             }
             return prev - 10;
           });
       } else {
           setTimeLeftMs(prev => prev + 10);
       }
    }

    // 2. DATA ACCUMULATION
    if (selectedId && timerMode === 'work') {
       accumulatedRef.current += 10;
       // Sync to state every 1 second
       if (accumulatedRef.current >= 1000) {
         const secondsToAdd = Math.floor(accumulatedRef.current / 1000);
         accumulatedRef.current %= 1000;

         setAgendas(prev => prev.map(a => 
           a.id === selectedId
             ? { ...a, totalDuration: a.totalDuration + secondsToAdd, todayDuration: a.todayDuration + secondsToAdd }
             : a
         ));
         saveStateToStorage();
       }
    } else if (isActive) {
        if (Date.now() % 1000 < 20) saveStateToStorage();
    }
  };

  // --- STRICT SYNC LOGIC (THE FIX) ---
  // Ini memastikan saat TIDAK berjalan (Pause) atau Ganti Mode/Kartu,
  // Timer HARUS menampilkan data asli dari kartu.
  useEffect(() => {
    // Jalankan hanya jika Timer PAUSE atau User ganti kartu
    if (!isActive && selectedAgenda) {
        if (!isPomodoroMode) {
            // Flow Mode: Timer = Total Durasi Hari Ini
            setTimeLeftMs(selectedAgenda.todayDuration * 1000);
        } else {
            // Pomodoro Mode: Jika PAUSED dan belum Overtime, biarkan (jangan reset ke durasi kartu)
            // Tapi jika kita baru ganti mode ke Pomodoro, toggleSystemMode yang akan handle reset.
        }
    }
  }, [selectedAgenda, isActive, isPomodoroMode]); // selectedAgenda changed -> Sync UI

  // --- PERSISTENCE ---
  const saveStateToStorage = () => {
      const state = {
          timeLeftMs: stateRef.current.timeLeftMs,
          isActive: stateRef.current.isActive,
          isPomodoroMode: stateRef.current.isPomodoroMode,
          timerMode: stateRef.current.timerMode,
          selectedId: stateRef.current.selectedId,
          isOvertime: stateRef.current.isOvertime,
          sessionCount,
          config,
          timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  useEffect(() => {
    if (isActive) workerRef.current.postMessage('START');
    else {
        workerRef.current.postMessage('STOP');
        saveStateToStorage();
    }
  }, [isActive]);

  // LOAD DATA & RECOVER
  useEffect(() => {
    const init = async () => {
      // Load DB
      const querySnapshot = await getDocs(collection(db, "agendas"));
      let fetchedData = [];
      querySnapshot.forEach((doc) => fetchedData.push({ id: doc.id, ...doc.data() }));
      const today = new Date().toISOString().split('T')[0];
      fetchedData = fetchedData.map(item => {
        if (item.lastUpdated !== today) {
           updateDoc(doc(db, "agendas", item.id), { todayDuration: 0, lastUpdated: today });
           return { ...item, todayDuration: 0 };
        }
        return item;
      });
      fetchedData.sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));
      
      // Load Storage
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      let restoredAgendas = fetchedData;

      if (saved) {
          setConfig(saved.config || config);
          setIsPomodoroMode(saved.isPomodoroMode);
          setTimerMode(saved.timerMode);
          setSessionCount(saved.sessionCount);
          setIsOvertime(saved.isOvertime);
          setSelectedId(saved.selectedId);

          const elapsed = Date.now() - saved.timestamp;
          const validElapsed = elapsed > 86400000 ? 0 : elapsed; // max 24h offline
          let newTime = saved.timeLeftMs;

          if (saved.isActive) {
              if (!saved.isPomodoroMode) {
                  newTime += validElapsed;
              } else {
                  if (!saved.isOvertime) {
                      newTime -= validElapsed;
                      if (newTime <= 0) {
                          newTime = Math.abs(newTime);
                          setIsOvertime(true);
                      }
                  } else {
                      newTime += validElapsed;
                  }
              }

              if (saved.selectedId && saved.timerMode === 'work') {
                  const secondsToAdd = Math.floor(validElapsed / 1000);
                  restoredAgendas = restoredAgendas.map(a => 
                      a.id === saved.selectedId 
                      ? { ...a, totalDuration: a.totalDuration + secondsToAdd, todayDuration: a.todayDuration + secondsToAdd }
                      : a
                  );
                  // Fire DB update for offline progress
                  const t = restoredAgendas.find(a => a.id === saved.selectedId);
                  if (t) updateDoc(doc(db, "agendas", saved.selectedId), { totalDuration: t.totalDuration, todayDuration: t.todayDuration });
              }
              setIsActive(true);
          }
          setTimeLeftMs(newTime);
      }
      setAgendas(restoredAgendas);
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    };
    init();
  }, []);

  const totalGlobalToday = agendas.reduce((acc, curr) => acc + (curr.todayDuration || 0), 0);

  useEffect(() => {
    if (!isActive && selectedId) {
        const task = agendas.find(a => a.id === selectedId);
        if (task) {
            updateDoc(doc(db, "agendas", selectedId), {
                totalDuration: task.totalDuration,
                todayDuration: task.todayDuration,
                lastUpdated: new Date().toISOString().split('T')[0]
            });
        }
    }
  }, [isActive]);

  // ACTIONS
  const openConfirm = (title, message, action, type='normal') => {
    setConfirmation({ isOpen: true, title, message, type, onConfirm: () => { action(); setConfirmation({ ...confirmation, isOpen: false }); } });
  };

  const toggleSystemMode = () => {
    setIsActive(false); 
    setIsOvertime(false);
    accumulatedRef.current = 0;

    const nextIsPomodoro = !isPomodoroMode;
    setIsPomodoroMode(nextIsPomodoro);

    if (nextIsPomodoro) {
        setTimerMode('work');
        setTimeLeftMs(config.work * 1000);
    } else {
        // FORCE SYNC: Grab latest time from Agendas
        const currentTask = agendas.find(a => a.id === selectedId);
        if (currentTask) {
            setTimeLeftMs(currentTask.todayDuration * 1000);
        } else {
            setTimeLeftMs(0);
        }
    }
  };

  const handleSwitchMode = (autoStart = false) => {
    setIsActive(false);
    setIsOvertime(false);
    accumulatedRef.current = 0;

    let newMode = timerMode;
    let newTime = 0;

    if (timerMode === 'work') {
      const isLong = sessionCount % config.interval === 0;
      newMode = isLong ? 'longBreak' : 'shortBreak';
      newTime = (isLong ? config.long : config.short) * 1000;
    } else {
      newMode = 'work';
      newTime = config.work * 1000;
      if (timerMode === 'longBreak') setSessionCount(1);
      else setSessionCount(c => c + 1);
    }

    setTimerMode(newMode);
    setTimeLeftMs(newTime);
    if (autoStart) setTimeout(() => setIsActive(true), 50); 
  };

  const handleMainButton = () => {
      if (!selectedId) return alert("PILIH MISI DULU");
      if (isPomodoroMode && isOvertime) {
          handleSwitchMode(true);
      } else {
          setIsActive(!isActive);
      }
  };

  const handleSaveSettings = (newConfig) => {
    setConfig(newConfig);
    setShowSettings(false);
    if (!isActive && isPomodoroMode && timerMode === 'work') {
        setTimeLeftMs(newConfig.work * 1000);
    }
  };

  const handleAddAgenda = async (newData) => {
    const newDoc = { ...newData, totalDuration: 0, todayDuration: 0, lastUpdated: new Date().toISOString().split('T')[0] };
    const ref = doc(collection(db, "agendas"));
    await setDoc(ref, newDoc);
    const updated = [...agendas, { id: ref.id, ...newDoc }];
    updated.sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));
    setAgendas(updated);
    setShowAddModal(false);
  };

  const handleDeleteRequest = (agenda) => {
    openConfirm("KONFIRMASI HAPUS", `Hapus "${agenda.title}" permanen?`, async () => {
        await deleteDoc(doc(db, "agendas", agenda.id));
        setAgendas(prev => prev.filter(a => a.id !== agenda.id));
        if (selectedId === agenda.id) setSelectedId(null);
    }, 'danger');
  };

  const handleCompleteRequest = () => {
    if (!selectedId) return;
    openConfirm("MISI SELESAI?", `Tandai "${selectedAgenda.title}" selesai?`, async () => {
        playComplete();
        await deleteDoc(doc(db, "agendas", selectedId));
        setAgendas(prev => prev.filter(a => a.id !== selectedId));
        setSelectedId(null);
        setIsActive(false);
    }, 'normal');
  };

  const handleDragEnd = (event) => {
    const {active, over} = event;
    if (!over || active.id === over.id) return;
    const isUrgent = agendas.find(a => a.id === active.id)?.isUrgent;
    const currentList = agendas.filter(a => a.isUrgent === isUrgent);
    const otherList = agendas.filter(a => a.isUrgent !== isUrgent);
    const oldIndex = currentList.findIndex(t => t.id === active.id);
    const newIndex = currentList.findIndex(t => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(currentList, oldIndex, newIndex);
        setAgendas(isUrgent ? [...reordered, ...otherList] : [...otherList, ...reordered]);
    }
  };

  const urgentTasks = agendas.filter(a => a.isUrgent);
  const regularTasks = agendas.filter(a => !a.isUrgent);

  const getPanelTheme = () => {
      if (!isPomodoroMode) return 'bg-white border-black'; 
      if (timerMode === 'work') {
          if (isOvertime) return 'bg-red-500 border-red-700 text-white'; 
          return 'bg-white border-black text-black'; 
      }
      if (timerMode === 'shortBreak') {
          if (isOvertime) return 'bg-yellow-400 border-yellow-600 text-black'; 
          return 'bg-blue-100 border-blue-300 text-blue-900'; 
      }
      if (timerMode === 'longBreak') {
          if (isOvertime) return 'bg-yellow-400 border-yellow-600 text-black'; 
          return 'bg-purple-100 border-purple-300 text-purple-900'; 
      }
      return 'bg-white border-black';
  };

  const panelTheme = getPanelTheme();
  const textColor = panelTheme.includes('text-white') ? 'text-white' : 'text-black';

  return (
    <div className="min-h-screen bg-white text-black font-sans bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
      
      {/* HEADER */}
      <header className="h-24 border-b-2 border-black flex items-center px-4 lg:px-8 justify-between sticky top-0 z-30 bg-white/90 backdrop-blur-md gap-4">
        <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter uppercase flex items-center gap-2">
            <div className="w-6 h-6 bg-black"></div>
            GRIND OS.
            </h1>
        </div>

        {/* GLOBAL TIMER */}
        <div className="flex-1 flex justify-center">
            <div className="hidden md:flex flex-col items-center border-2 border-black px-6 py-1 bg-gray-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0">TOTAL KERJA HARI INI</span>
                <div className="text-2xl font-black font-mono tracking-tighter flex items-center gap-2">
                    <Clock size={18}/>
                    {formatDurationDetailed(totalGlobalToday)}
                </div>
            </div>
        </div>

        <div className="flex gap-2 lg:gap-4">
            <button onClick={toggleSystemMode} className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-white hover:bg-gray-100 border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5">
             {isPomodoroMode ? <Repeat size={16} className="text-black"/> : <Infinity size={16} className="text-black"/>}
             <span className="hidden lg:inline text-sm font-bold uppercase tracking-wide">
                 {isPomodoroMode ? 'MODE POMODORO' : 'MODE FLOW'}
             </span>
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 border-2 border-black hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all">
               <SettingsIcon size={20}/>
            </button>
        </div>
      </header>

      {/* MOBILE GLOBAL TIMER */}
      <div className="md:hidden w-full border-b-2 border-black bg-gray-50 p-2 flex justify-center items-center gap-2">
         <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">TOTAL HARI INI:</span>
         <span className="text-sm font-black font-mono tracking-tighter">{formatDurationDetailed(totalGlobalToday)}</span>
      </div>

      {/* BODY */}
      <div className="max-w-7xl mx-auto p-4 lg:p-8 h-[calc(100vh-6rem)]">
        <div className="grid grid-cols-12 gap-6 lg:gap-10 h-full">
          {/* LEFT: LIST */}
          <div className="col-span-12 lg:col-span-7 overflow-y-auto pr-2 custom-scrollbar pb-20">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                {urgentTasks.length > 0 && (
                <div className="mb-10">
                    <h2 className="text-sm font-bold text-red-600 mb-4 tracking-widest uppercase flex items-center gap-2 border-b-2 border-red-600 pb-2">
                    <AlertCircle size={16}/> PRIORITAS TINGGI
                    </h2>
                    <SortableContext items={urgentTasks} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                        {urgentTasks.map((agenda) => (
                            <SortableAgendaCard key={agenda.id} agenda={agenda} isSelected={selectedId === agenda.id} onClick={setSelectedId} onDelete={() => handleDeleteRequest(agenda)}/>
                        ))}
                        </div>
                    </SortableContext>
                </div>
                )}
                <div>
                <h2 className="text-sm font-bold text-black mb-4 tracking-widest uppercase border-b-2 border-black pb-2">
                    {urgentTasks.length > 0 ? 'AGENDA LAINNYA' : 'SEMUA AGENDA'}
                </h2>
                <SortableContext items={regularTasks} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                        {regularTasks.map((agenda) => (
                            <SortableAgendaCard key={agenda.id} agenda={agenda} isSelected={selectedId === agenda.id} onClick={setSelectedId} onDelete={() => handleDeleteRequest(agenda)}/>
                        ))}
                        <button onClick={() => setShowAddModal(true)} className="h-[160px] border-2 border-dashed border-black flex flex-col items-center justify-center text-black hover:bg-black hover:text-white transition-all group">
                            <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mb-3 group-hover:bg-white group-hover:text-black border-2 border-black transition-colors"><Plus size={24}/></div>
                            <span className="text-sm font-bold uppercase tracking-wider">TAMBAH MISI</span>
                        </button>
                    </div>
                </SortableContext>
                </div>
            </DndContext>
          </div>

          {/* RIGHT: CONTROL PANEL */}
          <div className="col-span-12 lg:col-span-5 flex flex-col h-full min-h-[500px]">
            <div className={`flex-1 flex flex-col items-center justify-center relative border-2 p-4 lg:p-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 ${selectedAgenda ? panelTheme : 'bg-gray-50 border-black'}`}>
              
              {/* TIMER DISPLAY */}
              <div className="mb-6 relative">
                <div className={`text-6xl lg:text-8xl font-black tracking-tighter tabular-nums relative z-10 font-mono ${textColor}`}>
                    {formatTimeMs(timeLeftMs)}
                </div>
              </div>
              
              {/* STATUS LABEL */}
              <div className="h-8 mb-10 flex items-center gap-3">
                 {isPomodoroMode && !isOvertime && (
                     <span className={`text-xs font-bold uppercase border-2 px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 ${timerMode === 'work' ? 'bg-white text-black border-black' : 'bg-white text-blue-900 border-blue-900'}`}>
                        {timerMode === 'work' ? <Zap size={14}/> : <Coffee size={14}/>}
                        {timerMode === 'work' ? `FOKUS SESI ${sessionCount}` : 'ISTIRAHAT'}
                     </span>
                 )}
                 {isOvertime && (
                     <span className="text-xs font-bold uppercase text-white bg-black border-2 border-white px-3 py-1 animate-pulse shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] flex items-center gap-2">
                         <AlertTriangle size={14}/>
                         OVERTIME ({timerMode === 'work' ? 'KERJA' : 'ISTIRAHAT'})
                     </span>
                 )}
              </div>

              {selectedAgenda ? (
                <div className="flex flex-col items-center w-full">
                  <h3 className={`text-2xl lg:text-3xl font-black text-center mb-2 uppercase leading-none ${textColor}`}>{selectedAgenda.title}</h3>
                  <p className={`text-sm font-bold mb-10 uppercase tracking-wider opacity-70 ${textColor}`}>
                    {selectedAgenda.isUrgent ? 'STATUS: CRITICAL' : 'STATUS: NORMAL'}
                  </p>
                  
                  {/* MAIN BUTTON (SMART ACTION) */}
                  <button 
                    onClick={handleMainButton}
                    className={`
                      w-24 h-24 flex items-center justify-center mb-8 transition-all duration-100 transform active:translate-y-1 active:translate-x-1 border-4 
                      ${isOvertime 
                        ? 'bg-black border-white text-white animate-bounce' 
                        : (isActive ? 'bg-white border-black text-black' : 'bg-black border-black text-white')}
                      shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]
                    `}
                  >
                    {isActive 
                      ? (isOvertime ? <SkipForward size={32} fill="currentColor"/> : <Pause size={32} fill="currentColor" />) 
                      : <Play size={36} fill="currentColor" className="ml-1"/>}
                  </button>

                  {selectedAgenda.isUrgent && (
                    <button onClick={handleCompleteRequest} className="flex items-center gap-2 px-6 py-4 bg-white text-black hover:bg-green-50 border-2 border-black font-bold uppercase tracking-widest transition-all w-full justify-center mb-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5">
                      <CheckCircle2 size={20} /> SELESAIKAN MISI
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center opacity-50">
                  <p className="text-lg font-bold uppercase tracking-widest">PILIH MISI UNTUK MEMULAI.</p>
                </div>
              )}
            </div>
            <div className="mt-auto pt-8 text-center hidden lg:block">
               <p className="text-sm font-bold text-black uppercase tracking-[0.3em] border-t-2 border-black pt-4">"{quote}"</p>
            </div>
          </div>
        </div>
      </div>

      {showAddModal && <AddTaskModal onClose={() => setShowAddModal(false)} onAdd={handleAddAgenda} />}
      {showSettings && <SettingsModal config={config} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />}
      <ConfirmModal 
        isOpen={confirmation.isOpen} 
        title={confirmation.title} 
        message={confirmation.message} 
        type={confirmation.type}
        onConfirm={confirmation.onConfirm} 
        onCancel={() => setConfirmation({ ...confirmation, isOpen: false })} 
      />
    </div>
  );
}

export default App;