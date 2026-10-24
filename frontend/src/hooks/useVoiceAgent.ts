// Voice agent: Web Speech API recognition (en-IN) -> page snapshot -> POST /api/voice -> run the returned actions -> settle -> repeat
// until the server says "finish" or asks a question. The microphone is only used after the person switches the agent ON; it is released
// when they switch it OFF or the agent unmounts. Recognition is closed while the agent speaks (it must not hear itself) and stays open
// while it works, but then only to hear "stop".
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, session } from '../api/client';
import { sm } from '../api/sm';
import { voiceRoutes, type VoiceAction, type VoiceAsk } from '../utils/voice';
import { executeAction, settle, sleep } from '../utils/voiceExecutor';
import { getPageSnapshot, pageTitle } from '../utils/voiceSnapshot';

export type VoicePhase = 'off' | 'listening' | 'thinking' | 'speaking' | 'error';
export interface VoiceStep {
  id: number;
  label: string;
  status: 'run' | 'ok' | 'fail';
}

/* Minimal typing of the (prefixed) Web Speech API, which TypeScript's DOM lib does not include. */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANG = 'en-IN';
const MAX_STEPS = 12;
const MAX_MS = 30_000;
const QUESTION_SILENCE_MS = 10_000;
const STOP_WORD = /\b(stop|cancel|abort)\b/i;
// The assistant's name: "Elva" or "hey Elva". Permissive to catch common mishearings (Elba, Alva, Alba, Elvis…).
const WAKE_WORD = /^\s*(?:(?:hey|hi|hello|ok|okay)\s+)?el?[bv]a\b[,.!?]?\s*/i;

/** The spoken greeting, with the signed-in person's first name when there is one. */
export function greetingFor(): string {
  const name = session.user()?.name?.trim().split(/\s+/)[0];
  return name ? `Hello ${name}, how can I help you?` : 'Hello, how can I help you?';
}

function describe(a: VoiceAction): string {
  switch (a.type) {
    case 'navigate':
      return `Open ${a.path.replace(/^\/|\/$/g, '') || 'home'}`;
    case 'scroll':
      return `Scroll ${a.direction}`;
    case 'click':
      return `Click ${a.label ?? 'item'}`;
    case 'select':
      return `Select ${a.option} in ${a.label ?? 'list'}`;
    case 'fill':
      return `Fill ${a.label ?? 'field'}`;
    case 'toggle':
      return `Switch ${a.label ?? 'option'}`;
    case 'find':
      return `Find ${a.query}`;
    case 'wait':
      return 'Wait';
    case 'back':
      return 'Go back';
    case 'close':
      return 'Close popup';
    default:
      return 'Highlight field';
  }
}

export function useVoiceAgent() {
  const navigate = useNavigate();
  const location = useLocation();

  const [phase, setPhase] = useState<VoicePhase>('off');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<VoiceStep[]>([]);
  const [ask, setAsk] = useState<VoiceAsk | null>(null);
  const [running, setRunning] = useState(false);
  const [bgListening, setBgListening] = useState(false);

  const onRef = useRef(false); // switched ON by the person
  const speakingRef = useRef(false); // the agent is talking: recognition stays closed
  const runningRef = useRef(false); // a plan is executing: recognition only listens for "stop"
  const cancelRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<VoiceAsk | null>(null);
  const turnsRef = useRef<{ r: string; t: string }[]>([]);
  const lastFillRef = useRef<{ i: string; l: string; prev: string; v: string } | null>(null);
  const silenceRef = useRef(0);
  const reaskedRef = useRef(false);
  const stepId = useRef(0);
  const routeRef = useRef(location.pathname);
  const startRef = useRef<() => void>(() => {}); // the latest startListening, for callbacks created before it
  const finalRef = useRef<(text: string) => void>(() => {});
  const bgRecRef = useRef<Recognition | null>(null); // always-on wake-word listener (runs when agent is off)
  const bgStartRef = useRef<() => void>(() => {}); // latest startBgListener, for callbacks created before it
  useEffect(() => {
    routeRef.current = location.pathname;
  }, [location.pathname]);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const stopBgRec = useCallback(() => {
    const rec = bgRecRef.current;
    bgRecRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* already stopped */ }
    }
    setBgListening(false);
  }, []);

  const clearSilence = useCallback(() => window.clearTimeout(silenceRef.current), []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!text || typeof window.speechSynthesis === 'undefined') return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG;
      u.rate = 1.05;
      // some browsers never fire `end` (no voices installed): do not stay deaf forever
      const guard = window.setTimeout(resolve, 2500 + text.length * 90);
      const done = () => {
        window.clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }, []);

  /** Say something with the microphone closed, then listen again; a pending question gets a silence timer. */
  const sayAndListen = useCallback(
    async (text: string) => {
      clearSilence();
      speakingRef.current = true;
      stopRecognition();
      setPhase('speaking');
      await speak(text);
      speakingRef.current = false;
      if (!onRef.current) return;
      startRef.current();
      if (pendingRef.current) armSilence();
    },
    // armSilence is declared below; both only touch refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearSilence, speak, stopRecognition]
  );

  const armSilence = useCallback(() => {
    clearSilence();
    silenceRef.current = window.setTimeout(() => {
      const q = pendingRef.current;
      if (!onRef.current || !q || runningRef.current || speakingRef.current) return;
      if (!reaskedRef.current) {
        reaskedRef.current = true;
        void sayAndListen(q.question);
      } else {
        pendingRef.current = null; // asked twice: let it go
        setAsk(null);
      }
    }, QUESTION_SILENCE_MS);
  }, [clearSilence, sayAndListen]);

  const stopRun = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const runCommand = useCallback(
    async (text: string) => {
      clearSilence();
      runningRef.current = true;
      cancelRef.current = false;
      setRunning(true);
      setPhase('thinking');
      setTranscript(text);
      setSteps([]);
      setReply('');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const pendingIn = pendingRef.current;
      const done: Record<string, string>[] = [];
      const pinned: string[] = []; // ids find_element located: always kept in the snapshot
      const started = Date.now();
      const env = { navigate: (p: string) => (p.startsWith('/studio') ? window.location.assign(p) : navigate(p)), back: () => navigate(-1) };
      let count = 0;
      let say = '';
      let next: VoiceAsk | null = null;
      let failed = false;
      try {
        for (let round = 0; round < 14 && !cancelRef.current && !failed; round++) {
          const res = await sm.voice(
            {
              text,
              route: routeRef.current,
              title: pageTitle(),
              routes: voiceRoutes(session.user()?.role === 'admin'),
              snapshot: getPageSnapshot(pinned),
              done_steps: done,
              pending: round === 0 ? pendingIn : null,
              last_turns: turnsRef.current.slice(-6),
              last_fill: lastFillRef.current,
            },
            ctrl.signal
          );
          if (cancelRef.current) break;
          if (round === 0 && pendingIn) pendingRef.current = null; // consumed (answered, cancelled or re-asked below)
          for (const a of res.actions) {
            if (cancelRef.current) break;
            if (count >= MAX_STEPS || Date.now() - started > MAX_MS) {
              say = 'I stopped here because this is taking too long.';
              failed = true;
              break;
            }
            count++;
            const id = ++stepId.current;
            const label = describe(a);
            setSteps((s) => [...s.slice(-7), { id, label, status: 'run' }]);
            let r = await executeAction(a, env);
            if (!r.ok && !cancelRef.current) {
              await sleep(500); // the page may still be drawing: one more try
              r = await executeAction(a, env);
            }
            setSteps((s) => s.map((x) => (x.id === id ? { ...x, status: r.ok ? 'ok' : 'fail' } : x)));
            if (!r.ok) {
              say = r.error ? `I couldn't ${label.toLowerCase()}. ${r.error}` : `I couldn't ${label.toLowerCase()}.`;
              failed = true;
              break;
            }
            const entry: Record<string, string> = { a: a.type === 'fill' ? 'fill' : a.type === 'select' ? 'select' : a.type, l: label };
            if ('id' in a) entry.i = a.id;
            if (r.found) pinned.push(...r.found);
            if (r.info) entry.m = r.info;
            done.push(entry);
            if (a.type === 'fill') lastFillRef.current = { i: a.id, l: a.label ?? '', prev: r.prev ?? '', v: a.value };
            if (r.changed) await sleep(120);
          }
          if (failed || cancelRef.current) break;
          say = res.reply || say;
          if (res.ask) {
            next = res.ask;
            break;
          }
          if (res.finish || res.actions.length === 0) break;
          await settle(); // let the page react, then plan the rest from a fresh snapshot
        }
      } catch (e) {
        if (!cancelRef.current && !ctrl.signal.aborted) {
          say = e instanceof ApiError && e.status === 429 ? e.message : "Sorry, I didn't catch that. Please try again.";
        }
      }
      runningRef.current = false;
      setRunning(false);
      if (!onRef.current) return;
      if (cancelRef.current) {
        pendingRef.current = null;
        setAsk(null);
        setReply('Stopped.');
        await sayAndListen('Stopped.');
        return;
      }
      pendingRef.current = next;
      reaskedRef.current = false;
      setAsk(next);
      setReply(say);
      turnsRef.current = [...turnsRef.current, { r: 'user', t: text }, { r: 'agent', t: [say, next?.question].filter(Boolean).join(' ') }].slice(-6);
      await sayAndListen([say, next?.question].filter(Boolean).join(' '));
    },
    // navigate comes from the router and is stable; the rest are refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearSilence, navigate, sayAndListen]
  );

  useEffect(() => {
    finalRef.current = (text: string) => {
      if (runningRef.current) {
        if (STOP_WORD.test(text)) stopRun();
        return; // anything else while working is ignored
      }
      const wake = WAKE_WORD.exec(text);
      if (wake) {
        const rest = text.slice(wake[0].length).trim();
        if (!rest) {
          setReply(greetingFor());
          void sayAndListen(greetingFor()); // "Vlura" on its own: greet, then listen again
          return;
        }
        text = rest; // "hey Vlura open dashboard": the rest is the command
      }
      void runCommand(text);
    };
  }, [runCommand, stopRun, sayAndListen]);

  // Always-on background listener: wakes the agent when the user says "hey Vlura" without pressing any button.
  // Runs while the agent is off; pauses while it is active (mic is already open for commands).
  const startBgListener = useCallback(() => {
    if (onRef.current) return; // main agent is active: don't start
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    stopBgRec();
    const rec = new Ctor();
    rec.lang = 'en-US'; // en-US gives better accuracy for "Elva" than en-IN
    rec.continuous = true;  // no restart gaps — runs until we stop it
    rec.interimResults = false;
    rec.onresult = (e) => {
      if (onRef.current) return; // main agent took over
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const text = e.results[i][0].transcript.trim();
        const wake = WAKE_WORD.exec(text);
        if (!wake) continue;
        stopBgRec();
        const rest = text.slice(wake[0].length).trim();
        setError(null);
        setReply('');
        setTranscript('');
        setSteps([]);
        onRef.current = true;
        if (rest) {
          void runCommand(rest);
        } else {
          setReply(greetingFor());
          void sayAndListen(greetingFor());
        }
        return;
      }
    };
    rec.onerror = (e) => {
      bgRecRef.current = null;
      setBgListening(false);
      // mic denied: silently give up — button still works as fallback
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') return;
      // other transient errors: retry after a short pause
      if (!onRef.current) window.setTimeout(() => bgStartRef.current(), 2000);
    };
    rec.onend = () => {
      // continuous sessions only end on error or explicit abort; restart if it ended unexpectedly
      if (bgRecRef.current === rec && !onRef.current) {
        bgRecRef.current = null;
        setBgListening(false);
        window.setTimeout(() => bgStartRef.current(), 500);
      }
    };
    bgRecRef.current = rec;
    try {
      rec.start();
      setBgListening(true);
    } catch { /* start() while a prior session is closing: onend will retry */ }
  }, [runCommand, sayAndListen, stopBgRec]);

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !onRef.current || speakingRef.current) return;
    stopRecognition();
    const rec = new Ctor();
    rec.lang = LANG;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) finalRef.current(text);
          return;
        }
        interim += r[0].transcript;
      }
      if (!runningRef.current) {
        setTranscript(interim);
        if (pendingRef.current && interim) armSilence(); // still talking: do not nag
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend restarts
      onRef.current = false;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow it in the browser address bar, then try again.'
          : 'The microphone stopped unexpectedly. Press the button to try again.'
      );
      stopRecognition();
      setPhase('error');
    };
    rec.onend = () => {
      // Chrome ends recognition after a pause; keep listening while ON and not speaking
      if (recRef.current === rec && onRef.current && !speakingRef.current) {
        recRef.current = null;
        startRef.current();
      }
    };
    recRef.current = rec;
    try {
      rec.start(); // the browser asks for microphone permission here, on the first press only
      if (!runningRef.current) setPhase('listening');
    } catch {
      /* start() while a previous session is still closing: onend restarts */
    }
  }, [armSilence, stopRecognition]);

  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  useEffect(() => { bgStartRef.current = startBgListener; }, [startBgListener]);

  // Restart the background wake-word listener whenever the agent goes off (including on first mount).
  useEffect(() => {
    if (phase === 'off') bgStartRef.current();
  }, [phase]);

  const turnOff = useCallback(() => {
    onRef.current = false;
    speakingRef.current = false;
    runningRef.current = false;
    cancelRef.current = true;
    abortRef.current?.abort();
    clearSilence();
    stopRecognition();
    window.speechSynthesis?.cancel();
    pendingRef.current = null;
    setPhase('off');
    setTranscript('');
    setSteps([]);
    setAsk(null);
    setRunning(false);
  }, [clearSilence, stopRecognition]);

  const turnOn = useCallback(() => {
    stopBgRec(); // stop background listener before opening the main mic session
    setError(null);
    setReply('');
    setTranscript('');
    setSteps([]);
    if (!recognitionCtor()) {
      setError('Voice commands need Chrome or Edge on a computer or Android phone.');
      setPhase('error');
      return;
    }
    onRef.current = true;
    setReply(greetingFor());
    void sayAndListen(greetingFor()); // pressing the button greets, then listens (the microphone opens after the greeting)
  }, [sayAndListen, stopBgRec]);

  const toggle = useCallback(() => (onRef.current || phase !== 'off' ? turnOff() : turnOn()), [phase, turnOff, turnOn]);

  /** A tapped chip is an utterance like any other (an answer to the pending question, or "stop"). */
  const choose = useCallback(
    (text: string) => {
      if (!onRef.current) return;
      stopRecognition();
      if (runningRef.current) return;
      void runCommand(text);
    },
    [runCommand, stopRecognition]
  );

  // never leave the microphone or a voice running after the agent is gone (sign-out, closing the app)
  useEffect(() => () => { turnOff(); stopBgRec(); }, [turnOff, stopBgRec]);

  const busy = running || phase === 'speaking';
  return { phase, active: phase !== 'off', bgListening, transcript, reply, error, steps, ask, busy, toggle, turnOff, stop: stopRun, choose };
}
