import { useState } from "react";
import { X } from "lucide-react";

/**
 * Minimal chip/tag input — nothing like it existed in the component
 * library yet. Controlled `value: string[]` / `onChange`, type + Enter (or
 * comma) to add a tag, click the X on a chip to remove it.
 */
export default function TagInput({ value = [], onChange, placeholder = "Add a tag…" }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const remove = (tag) => onChange(value.filter((item) => item !== tag));

  return (
    <div className="flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove ${tag}`}
            className="text-brand/70 transition-colors hover:text-brand"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          } else if (event.key === "Backspace" && !draft && value.length) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={commit}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[100px] flex-1 border-0 bg-transparent p-1 text-sm text-text outline-none placeholder:text-muted"
      />
    </div>
  );
}
