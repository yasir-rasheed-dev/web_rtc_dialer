import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { formatPhoneDisplay } from "../../lib/phone";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Formatted, click-to-copy phone number. Shows "(555) 123-4567", copies the
 * raw value, flashes "Copied!" and a check icon. Use everywhere a number is
 * displayed — call logs, recordings, the incoming/active-call UI, contacts.
 */
export default function PhoneNumber({ value, className = "", iconClassName = "", muteFallback = "—" }) {
  const raw = String(value ?? "").trim();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!raw) return <span className={className}>{muteFallback}</span>;

  const onCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (await copyText(raw)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied!" : "Click to copy"}
      className={`group/phone relative inline-flex max-w-full items-center gap-1 tabular-nums transition-colors hover:text-brand ${className}`}
    >
      <span className="truncate">{formatPhoneDisplay(raw)}</span>
      {copied ? (
        <Check size={12} className={`shrink-0 text-emerald-500 ${iconClassName}`} />
      ) : (
        <Copy
          size={12}
          className={`shrink-0 opacity-0 transition-opacity group-hover/phone:opacity-60 ${iconClassName}`}
        />
      )}
      {copied ? (
        <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-text px-1.5 py-0.5 text-[10px] font-medium text-bg shadow">
          Copied!
        </span>
      ) : null}
    </button>
  );
}
