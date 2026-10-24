import React from 'react';
import { AlertCircle, Bot, Check, Loader2, Mic, Square, X } from 'lucide-react';
import { useVoiceAgent, type VoicePhase } from '../../hooks/useVoiceAgent';
import './VoiceAgentButton.css';

const STATUS: Record<VoicePhase, string> = {
  off: 'Voice assistant is off',
  listening: 'Listening… try “scroll down” or “fill brand name as Acme”',
  thinking: 'Working on it…',
  speaking: 'Speaking…',
  error: 'Voice assistant is unavailable',
};

/** Floating voice assistant switch (bottom right of every signed-in page) with its status panel. Mounted once, above the routes. */
export const VoiceAgentButton: React.FC = () => {
  const { phase, active, bgListening, transcript, reply, error, steps, ask, busy, toggle, turnOff, stop, choose } = useVoiceAgent();
  const chips = ask ? [...(ask.options ?? []), ...(ask.kind === 'provide_value' ? ['Skip', "That's all"] : [])] : [];
  const label = active ? 'Turn voice assistant off' : bgListening ? "Say 'Hey Elva' or click to activate" : 'Turn voice assistant on';

  return (
    <div className="voice-agent" data-phase={phase}>
      {active && (
        <div className="voice-panel" role="status" aria-live="polite" data-testid="voice-panel">
          <div className="voice-panel-head">
            <span className="voice-panel-title">
              <Bot size={15} /> Voice assistant
            </span>
            <button type="button" className="voice-panel-close" onClick={turnOff} aria-label="Close voice assistant">
              <X size={14} />
            </button>
          </div>
          <p className="voice-panel-status">{error ? error : STATUS[phase]}</p>
          {transcript && !error && <p className="voice-panel-transcript">“{transcript}”</p>}
          {steps.length > 0 && !error && (
            <ul className="voice-steps" aria-label="Steps">
              {steps.map((st) => (
                <li key={st.id} data-status={st.status}>
                  {st.status === 'run' ? <Loader2 size={12} className="voice-spin" /> : st.status === 'ok' ? <Check size={12} /> : <X size={12} />}
                  <span>{st.label}</span>
                </li>
              ))}
            </ul>
          )}
          {reply && !error && <p className="voice-panel-reply">{reply}</p>}
          {ask && !error && (
            <div className="voice-ask" data-testid="voice-ask">
              <p className="voice-ask-q">{ask.question}</p>
              <div className="voice-chips">
                {chips.map((c) => (
                  <button key={c} type="button" className="voice-chip" onClick={() => choose(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {busy && !error && (
            <button type="button" className="voice-stop" onClick={stop} data-testid="voice-stop">
              <Square size={11} /> Stop
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="voice-fab"
        onClick={toggle}
        aria-label={label}
        aria-pressed={active}
        title={label}
        data-testid="voice-fab"
        data-bg={bgListening && !active ? 'true' : undefined}
      >
        {phase === 'thinking' ? (
          <Loader2 size={22} className="voice-spin" />
        ) : phase === 'speaking' ? (
          <span className="voice-waves" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : phase === 'error' ? (
          <AlertCircle size={22} />
        ) : phase === 'listening' ? (
          <Mic size={22} />
        ) : (
          <Bot size={22} />
        )}
      </button>
    </div>
  );
};
