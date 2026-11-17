"use client";
// Dictation with the browser's built-in Web Speech API.
// Renders nothing if the browser doesn't support it (e.g. Firefox).
import { useEffect, useRef, useState } from "react";

// Minimal types: the Web Speech API isn't in TypeScript's standard DOM types.
type SpeechResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  // Checked after mount so server and browser render the same HTML first.
  useEffect(() => setSupported(getRecognition() !== null), []);
  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getRecognition()!;
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      className={`inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-semibold transition disabled:opacity-50 ${
        listening
          ? "animate-pulse border-orange bg-orange text-white"
          : "border-navy-100 bg-white text-navy hover:border-navy"
      }`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
      </svg>
      {listening ? "Stop" : "Dictate"}
    </button>
  );
}
