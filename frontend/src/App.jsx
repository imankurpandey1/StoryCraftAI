import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Activity, BookOpen, Clock, Database, Gauge, Sparkles, Star, Wand2, Volume2, VolumeX } from "lucide-react";
import Shell, { Card, MetricCard } from "./components/Shell.jsx";
import { ActionBar, defaultParams, genres, languages, Select, Slider } from "./components/Controls.jsx";
import { BarMetricChart, DonutChart, LineMetricChart, TrendChart } from "./components/Charts.jsx";
import { api } from "./services/api.js";
import { copyText, downloadPdf, downloadTxt, readingLabel } from "./utils/downloads.js";

const modelOptions = [
  { label: "Qwen2.5 0.5B Instruct (best quality)", value: "qwen2.5-0.5b-instruct" },
  { label: "DistilGPT-2", value: "distilgpt2" },
  { label: "GPT-2", value: "gpt2" }
];

function useAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const refresh = async () => {
    try {
      setAnalytics(await api.getAnalytics());
    } catch (error) {
      toast.error(error.message);
    }
  };
  useEffect(() => { refresh(); }, []);
  return { analytics, refresh };
}

function SettingsPanel({ params, setParams }) {
  return (
    <Card className="space-y-5">
      <Select label="Language" value={params.language} onChange={(language) => setParams({ ...params, language })} options={languages} />
      <Select label="Genre" value={params.genre} onChange={(genre) => setParams({ ...params, genre })} options={genres} />
      <Select label="Model" value={params.model} onChange={(model) => setParams({ ...params, model })} options={modelOptions} />
      <Slider label="Max Tokens" value={params.max_tokens} min={30} max={500} step={10} onChange={(max_tokens) => setParams({ ...params, max_tokens })} />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold uppercase tracking-widest text-slate-400">Author Name</label>
        <input type="text" value={params.author_name} onChange={(e) => setParams({ ...params, author_name: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200 outline-none focus:border-emerald-500/50" />
      </div>
      <Select label="Visibility" value={params.visibility} onChange={(visibility) => setParams({ ...params, visibility })} options={["private", "public"]} />
    </Card>
  );
}

function StoryResult({ result }) {
  const [isReciting, setIsReciting] = useState(false);

  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  const toggleRecite = () => {
    if (isReciting) {
      window.speechSynthesis.cancel();
      setIsReciting(false);
    } else {
      const text = result?.combined_story || result?.generated_story || "";
      const utterance = new SpeechSynthesisUtterance(text);
      const langMap = {
        "English": "en-US", "Spanish": "es-ES", "French": "fr-FR", 
        "German": "de-DE", "Italian": "it-IT", "Portuguese": "pt-BR", 
        "Japanese": "ja-JP", "Chinese": "zh-CN", "Hindi": "hi-IN", "Russian": "ru-RU"
      };
      utterance.lang = langMap[result?.language] || langMap[result?.parameters?.language] || "en-US";
      utterance.onend = () => setIsReciting(false);
      window.speechSynthesis.speak(utterance);
      setIsReciting(true);
    }
  };

  const [translating, setTranslating] = useState(false);
  const handleTranslate = async (e) => {
    const lang = e.target.value;
    if (!lang) return;
    setTranslating(true);
    const text = result.combined_story || result.generated_story;
    const promise = api.translateStory({ text, language: lang, model: result.model_key || "qwen2.5-0.5b-instruct" });
    toast.promise(promise, { loading: `Translating to ${lang}...`, success: "Translated!", error: "Translation failed" });
    try {
      const res = await promise;
      if (res.success) {
        if (setResult) {
          setResult({ ...result, combined_story: res.data.combined_story, generated_story: res.data.combined_story, language: lang });
        }
        if (isReciting) {
          window.speechSynthesis.cancel();
          setIsReciting(false);
        }
      }
    } finally {
      setTranslating(false);
      e.target.value = "";
    }
  };

  if (!result) return null;
  const story = result.combined_story || result.generated_story;
  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-gold">Generated Output</p>
          <h2 className="mt-2 text-2xl font-black">{result.title}</h2>
          <p className="mt-2 text-sm text-slate-400">{result.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select disabled={translating} onChange={handleTranslate} value="" className="btn-secondary h-auto py-3 px-4 text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-emerald-400/50">
            <option value="" disabled className="bg-slate-900 text-white">Translate...</option>
            {languages.map((l) => <option key={l} value={l} className="bg-slate-900 text-white">{l}</option>)}
          </select>
          <button onClick={toggleRecite} className={`btn-secondary h-auto py-3 px-4 text-sm font-bold ${isReciting ? "animate-pulse border-emerald-400 bg-emerald-400/20 shadow-[0_0_20px_rgba(16,185,129,0.5)]" : ""}`}>
            {isReciting ? <VolumeX size={18} /> : <Volume2 size={18} />}
            {isReciting ? "Stop Reciting" : "Read Aloud"}
          </button>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm">
            <strong>{result.model_used}</strong>
            <p className="text-slate-400">{result.device} inference</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Words" value={result.word_count} icon={BookOpen} />
        <MetricCard label="Reading Time" value={readingLabel(result.reading_time)} icon={Clock} />
        <MetricCard label="Generation Time" value={`${result.generation_time}s`} icon={Gauge} />
        <MetricCard label="Memory" value={`${result.memory_usage || 0} MB`} icon={Activity} />
      </div>
      <article className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/20 p-5 leading-8 text-slate-100">
        {story}
      </article>
    </Card>
  );
}

function Dashboard({ analytics }) {
  const empty = !analytics;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total Stories" value={empty ? 0 : analytics.total_stories} icon={Database} />
        <MetricCard label="Average Rating" value={empty ? "0.0" : analytics.average_rating} sub="Rated stories" icon={Star} />
        <MetricCard label="Most Used Genre" value={empty ? "N/A" : analytics.most_used_genre} icon={Sparkles} />
        <MetricCard label="Generations" value={empty ? 0 : analytics.generation_count} icon={Wand2} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-black">Generation Trends</h3>
          <TrendChart data={analytics?.generation_trends || []} />
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-black">Genre Distribution</h3>
          <DonutChart data={analytics?.genre_distribution || []} />
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-black">Model Usage</h3>
          <DonutChart data={analytics?.model_usage || []} />
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-black">Performance Analytics</h3>
          <LineMetricChart data={analytics?.performance || []} />
        </Card>
      </div>
      <Card>
        <h3 className="mb-4 text-lg font-black">Recent Stories</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(analytics?.recent_stories || []).map((story) => (
            <div key={story.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-bold">{story.title}</p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-400">{story.generated_story}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InteractiveBuilder({ prompt, setPrompt, onGenerate }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Let's brainstorm your story. What kind of character, setting, or conflict do you have in mind?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim()) return;
    const newMsgs = [...messages, { role: "user", content: input }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const res = await api.chatRefine({ messages: newMsgs });
      if (res.reply) {
        setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
        setPrompt(newMsgs.filter(m => m.role === "user").map(m => m.content).join("\n\n"));
      }
    } catch (e) {
      toast.error("Chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 flex flex-col">
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-xl max-w-[85%] ${m.role === 'assistant' ? 'bg-emerald-400/10 text-emerald-100 self-start' : 'bg-white/10 text-white self-end'}`}>
            <p className="text-sm">{m.content}</p>
          </div>
        ))}
        {loading && <div className="text-emerald-400 animate-pulse text-sm">Brainstorming...</div>}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Type your idea..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="btn-secondary" onClick={send} disabled={loading}>Send</button>
      </div>
      <button className="btn-primary w-full mt-2" onClick={onGenerate}>Write Story</button>
    </Card>
  );
}

function GeneratorPage({ onSaved }) {
  const [params, setParams] = useState(defaultParams);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("static");
  const storyText = result?.combined_story || result?.generated_story || "";

  const generate = async () => {
    setLoading(true);
    try {
      const data = await api.generateStory({ prompt, ...params });
      setResult(data);
      toast.success("Story generated successfully");
      try {
        await api.saveStory({ ...data, ...params });
        onSaved();
      } catch (err) {
        console.error("Auto-save failed", err);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      await api.saveStory({ ...result, ...params });
      toast.success("Story saved to library");
      onSaved();
    } catch (error) {
      toast.error("Failed to save: " + error.message);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="flex justify-end gap-4 mb-2">
          <button className={`text-sm font-bold pb-1 border-b-2 transition-all ${mode === 'static' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`} onClick={() => setMode("static")}>Quick Prompt</button>
          <button className={`text-sm font-bold pb-1 border-b-2 transition-all ${mode === 'brainstorm' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`} onClick={() => setMode("brainstorm")}>Interactive Brainstorm</button>
        </div>
        {mode === "static" ? (
          <Card>
            <textarea className="input min-h-56 resize-y" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Enter a cinematic prompt with a character, setting, and conflict..." />
          </Card>
        ) : (
          <InteractiveBuilder prompt={prompt} setPrompt={setPrompt} onGenerate={generate} />
        )}
        <ActionBar
          loading={loading}
          onGenerate={generate}
          onReset={() => { setPrompt(""); setResult(null); }}
          onSave={result ? save : null}
          onCopy={result ? () => copyText(storyText).then(() => toast.success("Copied")) : null}
          onPdf={result ? () => downloadPdf(`${result.title}.pdf`, result.title, storyText) : null}
          onTxt={result ? () => downloadTxt(`${result.title}.txt`, storyText) : null}
        />
        <StoryResult result={result} />
      </div>
      <SettingsPanel params={params} setParams={setParams} />
    </div>
  );
}

function CompletionPage({ onSaved }) {
  const [params, setParams] = useState({ ...defaultParams, genre: "Mystery" });
  const [unfinished, setUnfinished] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const complete = async () => {
    setLoading(true);
    try {
      const data = await api.completeStory({ unfinished_story: unfinished, ...params });
      setResult(data);
      toast.success("Story completed");
      try {
        await api.saveStory({ ...data, ...params });
        onSaved();
      } catch (err) {
        console.error("Auto-save failed", err);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <textarea className="input min-h-56 resize-y" value={unfinished} onChange={(event) => setUnfinished(event.target.value)} placeholder="Paste an unfinished story here..." />
        </Card>
        <ActionBar
          loading={loading}
          generateLabel="Complete Story"
          onGenerate={complete}
          onReset={() => { setUnfinished(""); setResult(null); }}
          onSave={result ? async () => { try { await api.saveStory({ ...result, ...params }); toast.success("Completed story saved"); onSaved(); } catch (err) { toast.error("Failed to save: " + err.message); } } : null}
          onCopy={result ? () => copyText(result.combined_story).then(() => toast.success("Copied")) : null}
          onPdf={result ? () => downloadPdf(`${result.title}.pdf`, result.title, result.combined_story) : null}
          onTxt={result ? () => downloadTxt(`${result.title}.txt`, result.combined_story) : null}
        />
        {result && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><h3 className="mb-3 font-black">Original Text</h3><p className="whitespace-pre-wrap leading-7 text-slate-300">{result.original_text}</p></Card>
            <Card><h3 className="mb-3 font-black">Generated Continuation</h3><p className="whitespace-pre-wrap leading-7 text-slate-300">{result.continuation}</p></Card>
          </div>
        )}
        <StoryResult result={result} />
      </div>
      <SettingsPanel params={params} setParams={setParams} />
    </div>
  );
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} onClick={() => onChange(star)} className={star <= value ? "text-gold" : "text-slate-500"}>
          <Star size={18} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function LibraryPage({ onSaved }) {
  const [stories, setStories] = useState([]);
  const [tab, setTab] = useState("private");
  const [filters, setFilters] = useState({ search: "", genre: "", min_rating: "" });
  const [editing, setEditing] = useState(null);

  const load = async () => setStories(await api.getStories({ ...filters, visibility: tab }));
  useEffect(() => { load().catch((error) => toast.error(error.message)); }, [tab]);

  const deleteStory = async (id) => {
    await api.deleteStory(id);
    toast.success("Story deleted");
    load();
    onSaved();
  };

  const rate = async (id, rating) => {
    await api.rateStory(id, rating);
    toast.success("Rating updated");
    load();
    onSaved();
  };

  const update = async () => {
    await api.updateStory(editing.id, editing);
    toast.success("Story updated");
    setEditing(null);
    load();
  };

  const toggleVisibility = async (story) => {
    const newVis = story.visibility === "public" ? "private" : "public";
    await api.updateStory(story.id, { ...story, visibility: newVis });
    toast.success(`Story is now ${newVis}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-white/10 pb-2">
        <button className={`text-lg font-bold pb-2 border-b-2 ${tab === 'private' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`} onClick={() => setTab("private")}>My Private Library</button>
        <button className={`text-lg font-bold pb-2 border-b-2 ${tab === 'public' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`} onClick={() => setTab("public")}>Public Discover Feed</button>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-5">
          <input className="input md:col-span-2" placeholder="Search stories..." value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Select label="" value={filters.genre} onChange={(genre) => setFilters({ ...filters, genre })} options={[{ label: "All Genres", value: "" }, ...genres]} />
          <Select label="" value={filters.min_rating} onChange={(min_rating) => setFilters({ ...filters, min_rating })} options={[{ label: "Any Rating", value: "" }, 1, 2, 3, 4, 5].map((x) => typeof x === "object" ? x : { label: `${x}+ Stars`, value: x })} />
          <button className="btn-primary" onClick={load}>Apply Filters</button>
        </div>
      </Card>
      <motion.div initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }} className="grid gap-5">
        {stories.map((story) => (
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} key={story.id}>
            <Card>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">{story.genre} | {story.model_used} | {story.language} {story.visibility === 'public' && ` | By ${story.author_name}`}</p>
                  <h3 className="mt-2 text-xl font-black">{story.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{story.generated_story}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>{story.word_count} words</span><span>{readingLabel(story.reading_time)}</span><span>{story.generation_time}s</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <StarRating value={story.rating} onChange={(rating) => rate(story.id, rating)} />
                  {tab === "private" && <button className="btn-secondary" onClick={() => toggleVisibility(story)}>Make Public</button>}
                  {tab === "public" && <button className="btn-secondary" onClick={() => toggleVisibility(story)}>Make Private</button>}
                  <button className="btn-secondary" onClick={() => setEditing(story)}>Edit</button>
                  <button className="btn-secondary" onClick={() => copyText(story.generated_story).then(() => toast.success("Copied"))}>Copy</button>
                  <button className="btn-secondary" onClick={() => downloadTxt(`${story.title}.txt`, story.generated_story)}>TXT</button>
                  <button className="btn-secondary" onClick={() => downloadPdf(`${story.title}.pdf`, story.title, story.generated_story)}>PDF</button>
                  <button className="btn-secondary" onClick={() => deleteStory(story.id)}>Delete</button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-3xl space-y-4">
            <input className="input" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
            <textarea className="input min-h-72" value={editing.generated_story} onChange={(event) => setEditing({ ...editing, generated_story: event.target.value })} />
            <div className="flex gap-3">
              <button className="btn-primary" onClick={update}>Save Changes</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AnalyticsPage({ analytics }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><h3 className="mb-4 text-lg font-black">Stories Per Day</h3><TrendChart data={analytics?.generation_trends || []} /></Card>
      <Card><h3 className="mb-4 text-lg font-black">Model Usage</h3><DonutChart data={analytics?.model_usage || []} /></Card>
      <Card><h3 className="mb-4 text-lg font-black">Genre Popularity</h3><DonutChart data={analytics?.genre_distribution || []} /></Card>
      <Card><h3 className="mb-4 text-lg font-black">Generation Speed Comparisons</h3><LineMetricChart data={analytics?.performance || []} /></Card>
      <Card className="xl:col-span-2">
        <h3 className="mb-4 text-lg font-black">Rating Distribution</h3>
        <BarMetricChart data={analytics?.rating_distribution || []} xKey="rating" bars={[{ key: "count", name: "Stories" }]} />
      </Card>
    </div>
  );
}

function RatingsPage({ analytics }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Average Rating" value={analytics?.average_rating || 0} icon={Star} />
        <MetricCard label="Rated Stories" value={(analytics?.top_rated || []).length} icon={BookOpen} />
        <MetricCard label="Total Library" value={analytics?.total_stories || 0} icon={Database} />
      </div>
      <Card><h3 className="mb-4 text-lg font-black">Rating Distribution</h3><BarMetricChart data={analytics?.rating_distribution || []} xKey="rating" bars={[{ key: "count", name: "Stories" }]} /></Card>
      <Card>
        <h3 className="mb-4 text-lg font-black">Top Rated Stories</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {(analytics?.top_rated || []).map((story) => (
            <div key={story.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex justify-between gap-3"><strong>{story.title}</strong><span className="text-gold">{story.rating} stars</span></div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-400">{story.generated_story}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SettingsPage({ theme, setTheme }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="text-xl font-black">Application Settings</h3>
        <p className="mt-2 text-sm text-slate-400">Control presentation and local development options.</p>
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
          <div><p className="font-bold">Theme</p><p className="text-sm text-slate-400">Toggle dark and light UI modes.</p></div>
          <button className="btn-primary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
      </Card>
      <Card>
        <h3 className="text-xl font-black">Model Notes</h3>
        <p className="mt-3 leading-7 text-slate-300">Qwen2.5 0.5B Instruct provides the strongest prompt adherence. GPT-2 is a smaller baseline, while DistilGPT-2 is faster and lighter. The first use of a model downloads its files into the backend model cache.</p>
      </Card>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [theme, setTheme] = useState(localStorage.getItem("jananiai-theme") || "dark");
  const { analytics, refresh } = useAnalytics();
  useEffect(() => { localStorage.setItem("jananiai-theme", theme); }, [theme]);

  const pages = {
    Dashboard: <Dashboard analytics={analytics} />,
    "Story Generator": <GeneratorPage onSaved={refresh} />,
    "Story Completion": <CompletionPage onSaved={refresh} />,
    "Story Library": <LibraryPage onSaved={refresh} />,
    Analytics: <AnalyticsPage analytics={analytics} />,
    Ratings: <RatingsPage analytics={analytics} />,
    Settings: <SettingsPage theme={theme} setTheme={setTheme} />
  };

  return (
    <Shell page={page} setPage={setPage} theme={theme} setTheme={setTheme}>
      {pages[page]}
    </Shell>
  );
}
