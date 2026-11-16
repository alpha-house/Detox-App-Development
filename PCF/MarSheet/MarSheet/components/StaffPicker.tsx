import * as React from "react";
import { MarApi } from "./api";
import { Staff } from "./types";

interface Props {
  api: MarApi;
  value?: Staff;
  onChange: (s: Staff | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Small type-ahead over cp_staff (name or initials). Tap a result to pick it. */
export const StaffPicker: React.FC<Props> = ({ api, value, onChange, placeholder, disabled }) => {
  const [text, setText] = React.useState("");
  const [results, setResults] = React.useState<Staff[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const search = async () => {
      try {
        const r = await api.searchStaff(text);
        if (!cancelled) {
          setResults(r);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    };
    const t = window.setTimeout(() => void search(), 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [text, api]);

  if (value) {
    return (
      <span className="mar-staff-chip" title={value.name}>
        {value.initials}
        {!disabled && (
          <button type="button" className="mar-chip-x" aria-label="Clear staff" onClick={() => onChange(undefined)}>
            ×
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="mar-picker">
      <input
        className="mar-input mar-input-staff"
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? "Name…"}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(results.length > 0)}
      />
      {open && results.length > 0 && (
        <ul className="mar-picker-list">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setText("");
                  setOpen(false);
                }}
              >
                <b>{s.initials}</b> {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};
