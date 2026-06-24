import { Download, FileText, RotateCcw, Save, Wand2 } from "lucide-react";

export const genres = ["Fantasy", "Mystery", "Horror", "Sci-Fi", "Adventure", "Romance", "Mythology", "Children's Stories"];
export const languages = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Chinese", "Hindi", "Russian"];

export const defaultParams = {
  language: "English",
  genre: "Fantasy",
  model: "qwen2.5-0.5b-instruct",
  max_tokens: 180,
  visibility: "private",
  author_name: "Anonymous"
};

export function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-300">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input">
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>{option.label || option}</option>
        ))}
      </select>
    </label>
  );
}

export function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 flex justify-between text-sm font-semibold text-slate-300">
        {label}
        <strong className="text-gold">{value}</strong>
      </span>
      <input className="slider w-full" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function ActionBar({ loading, onGenerate, onReset, onSave, onCopy, onPdf, onTxt, generateLabel = "Generate" }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button disabled={loading} onClick={onGenerate} className="btn-primary">
        <Wand2 size={16} />
        {loading ? "Generating..." : generateLabel}
      </button>
      <button onClick={onReset} className="btn-secondary"><RotateCcw size={16} />Reset</button>
      <button disabled={!onSave} onClick={onSave} className="btn-secondary"><Save size={16} />Save</button>
      <button disabled={!onCopy} onClick={onCopy} className="btn-secondary">Copy</button>
      <button disabled={!onPdf} onClick={onPdf} className="btn-secondary"><Download size={16} />PDF</button>
      <button disabled={!onTxt} onClick={onTxt} className="btn-secondary"><FileText size={16} />TXT</button>
    </div>
  );
}
