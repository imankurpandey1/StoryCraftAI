import { motion } from "framer-motion";
import { BarChart3, BookOpen, Gauge, Home, Library, Moon, Settings, Sparkles, Star, Sun, Wand2 } from "lucide-react";

const navItems = [
  ["Dashboard", Home],
  ["Story Generator", Wand2],
  ["Story Completion", Sparkles],
  ["Story Library", Library],
  ["Analytics", BarChart3],
  ["Ratings", Star],
  ["Settings", Settings]
];

export default function Shell({ page, setPage, children, theme, setTheme }) {
  return (
    <div className={`min-h-screen ${theme === "dark" ? "dark-theme" : "light-theme"}`}>
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-glow">
              <Gauge size={24} />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">JananiAI</p>
              <p className="text-xs text-emerald-200">Generative NLP Studio</p>
            </div>
          </div>
          <nav className="space-y-2">
            {navItems.map(([label, Icon]) => (
              <button
                key={label}
                onClick={() => setPage(label)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  page === label ? "bg-emerald-400 text-slate-950 shadow-glow" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="w-full lg:pl-72">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/45 px-4 py-4 backdrop-blur-xl sm:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gold">Intelligent Story Generation</p>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{page}</h1>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
                {navItems.map(([label]) => (
                  <button key={label} onClick={() => setPage(label)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${page === label ? "bg-emerald-400 text-slate-950" : "glass"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="btn-secondary self-start md:self-auto">
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
            </div>
          </header>
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-7xl p-4 sm:p-8">
            {children}
          </motion.section>
        </main>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`glass rounded-3xl p-5 ${className}`}>{children}</div>;
}

export function MetricCard({ label, value, sub, icon: Icon }) {
  return (
    <Card className="transition hover:-translate-y-1 hover:shadow-glow overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-400 truncate">{label}</p>
          <p className="mt-2 text-3xl font-black break-words" style={{ wordBreak: 'break-word' }}>{value}</p>
          {sub && <p className="mt-1 text-xs text-emerald-200 truncate">{sub}</p>}
        </div>
        {Icon && <div className="shrink-0 rounded-2xl bg-emerald-400/15 p-3 text-emerald-300"><Icon size={22} /></div>}
      </div>
    </Card>
  );
}
