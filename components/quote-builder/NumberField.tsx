"use client";
// A number box you can clear and retype. Commits a valid number as you type;
// goes back to the last good value if left empty or invalid.
import { useEffect, useState } from "react";

export function NumberField({
  value,
  onChange,
  label,
  step = 1,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  step?: number;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100);
      }}
      onBlur={() => setText(String(value))}
      className={`w-16 rounded-md sm:w-20 border-2 border-navy-100 bg-white px-2 py-1 text-right tabular-nums focus:border-navy ${className}`}
    />
  );
}
