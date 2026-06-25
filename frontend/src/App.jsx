import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Activity, BookOpen, Clock, Database, Gauge, Sparkles, Star, Wand2, Volume2, VolumeX } from "lucide-react";
import Shell, { Card, MetricCard } from "./components/Shell.jsx";
import { ActionBar, defaultParams, genres, languages, Select, Slider } from "./components/Controls.jsx";
import { BarMetricChart, DonutChart, LineMetricChart, TrendChart } from "./components/Charts.jsx";
import { api } from "./services/api.js";
import { copyText, downloadPdf, downloadTxt, readingLabel } from "./utils/downloads.js";
import { useAuth } from "./context/AuthContext.jsx";

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
      <Slider label="Max Tokens" value={params.max_tokens} min={30} max={2000} step={10} onChange={(max_tokens) => setParams({ ...params, max_tokens })} />
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
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">Generated Output</p>
          <h2 className="mt-2 text-2xl font-black">{result.title}</h2>
          <p className="mt-2 text-sm text-red-500">{result.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select disabled={translating} onChange={handleTranslate} value="" className="btn-secondary h-auto py-3 px-4 text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-red-500/50">
            <option value="" disabled className="bg-slate-900 text-red-500">Translate...</option>
            {languages.map((l) => <option key={l} value={l} className="bg-slate-900 text-red-500">{l}</option>)}
          </select>
          <button onClick={toggleRecite} className={`btn-secondary h-auto py-3 px-4 text-sm font-bold ${isReciting ? "animate-pulse border-red-500 bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.5)]" : ""}`}>
            {isReciting ? <VolumeX size={18} /> : <Volume2 size={18} />}
            {isReciting ? "Stop Reciting" : "Read Aloud"}
          </button>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm">
            <strong>{result.model_used}</strong>
            <p className="text-red-500">{result.device} inference</p>
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

function InsightsPage({ analytics }) {
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
        <Card className="xl:col-span-2">
          <h3 className="mb-4 text-lg font-black">Rating Distribution</h3>
          <BarMetricChart data={analytics?.rating_distribution || []} xKey="rating" bars={[{ key: "count", name: "Stories" }]} />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-black">Recent Stories</h3>
          <div className="grid gap-3">
            {(analytics?.recent_stories || []).slice(0, 4).map((story) => (
              <div key={story.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between gap-3"><strong>{story.title}</strong><span className="text-red-500 text-sm">{story.genre}</span></div>
                <p className="mt-2 line-clamp-2 text-sm text-red-500">{story.generated_story}</p>
              </div>
            ))}
            {(!analytics?.recent_stories || analytics.recent_stories.length === 0) && (
              <p className="text-red-500 text-sm italic">No stories generated yet.</p>
            )}
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-black">Top Rated Stories</h3>
          <div className="grid gap-3">
            {(analytics?.top_rated || []).slice(0, 4).map((story) => (
              <div key={story.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between gap-3"><strong>{story.title}</strong><span className="text-red-500">{story.rating} stars</span></div>
                <p className="mt-2 line-clamp-2 text-sm text-red-500">{story.generated_story}</p>
              </div>
            ))}
            {(!analytics?.top_rated || analytics.top_rated.length === 0) && (
              <p className="text-red-500 text-sm italic">No stories rated yet.</p>
            )}
          </div>
        </Card>
      </div>
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
          <div key={i} className={`p-3 rounded-xl max-w-[85%] ${m.role === 'assistant' ? 'bg-red-500/10 text-red-500 self-start' : 'bg-white/10 text-red-500 self-end'}`}>
            <p className="text-sm">{m.content}</p>
          </div>
        ))}
        {loading && <div className="text-red-500 animate-pulse text-sm">Brainstorming...</div>}
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
  const [params, setParams] = useState(() => {
    try {
      const saved = localStorage.getItem("jananiai-params");
      return saved ? JSON.parse(saved) : defaultParams;
    } catch {
      return defaultParams;
    }
  });
  const [prompt, setPrompt] = useState(localStorage.getItem("jananiai-prompt") || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("static");
  const storyText = result?.combined_story || result?.generated_story || "";

  useEffect(() => {
    localStorage.setItem("jananiai-params", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("jananiai-prompt", prompt);
  }, [prompt]);

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
          <button className={`text-sm font-bold pb-1 border-b-2 transition-all ${mode === 'static' ? 'border-red-500 text-red-500' : 'border-transparent text-red-500 hover:text-red-500'}`} onClick={() => setMode("static")}>Quick Prompt</button>
          <button className={`text-sm font-bold pb-1 border-b-2 transition-all ${mode === 'brainstorm' ? 'border-red-500 text-red-500' : 'border-transparent text-red-500 hover:text-red-500'}`} onClick={() => setMode("brainstorm")}>Interactive Brainstorm</button>
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
            <Card><h3 className="mb-3 font-black">Original Text</h3><p className="whitespace-pre-wrap leading-7 text-red-500">{result.original_text}</p></Card>
            <Card><h3 className="mb-3 font-black">Generated Continuation</h3><p className="whitespace-pre-wrap leading-7 text-red-500">{result.continuation}</p></Card>
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
        <button key={star} onClick={() => onChange(star)} className={star <= value ? "text-red-500" : "text-slate-500"}>
          <Star size={18} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function LibraryPage({ onSaved }) {
  const [stories, setStories] = useState([]);
  const [tab, setTab] = useState("public");
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
        <button className={`text-lg font-bold pb-2 border-b-2 ${tab === 'private' ? 'border-red-500 text-red-500' : 'border-transparent text-red-500 hover:text-red-500'}`} onClick={() => setTab("private")}>My Private Library</button>
        <button className={`text-lg font-bold pb-2 border-b-2 ${tab === 'public' ? 'border-red-500 text-red-500' : 'border-transparent text-red-500 hover:text-red-500'}`} onClick={() => setTab("public")}>Public Discover Feed</button>
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
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">{story.genre} | {story.model_used} | {story.language} {story.visibility === 'public' && ` | By ${story.author_name}`}</p>
                  <h3 className="mt-2 text-xl font-black">{story.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-red-500">{story.generated_story}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-red-500">
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


function ProfilePage({ theme, setTheme, onSaved }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user) {
      api.getProfile().then(setProfile).catch(err => toast.error(err.message));
    }
  }, [user]);

  if (!user) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="text-xl font-black">User Profile</h3>
        <p className="mt-2 text-sm text-red-500">Your account details and statistics.</p>
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div><p className="font-bold">Name</p><p className="text-sm text-red-500">{user.name}</p></div>
          <div><p className="font-bold">Email</p><p className="text-sm text-red-500">{user.email}</p></div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div><p className="font-bold text-xl">{profile?.total_stories || 0}</p><p className="text-xs text-red-500">Stories Generated</p></div>
            <div><p className="font-bold text-xl">{profile?.total_words || 0}</p><p className="text-xs text-red-500">Words Written</p></div>
          </div>
          <button className="btn-secondary mt-2 w-full" onClick={logout}>Log Out</button>
        </div>
      </Card>
      <Card>
        <h3 className="text-xl font-black">Application Settings</h3>
        <p className="mt-2 text-sm text-red-500">Control presentation and local development options.</p>
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
          <div><p className="font-bold">Theme</p><p className="text-sm text-red-500">Toggle dark and light UI modes.</p></div>
          <button className="btn-primary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
      </Card>
    </div>
  );
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let res;
      if (isLogin) {
        res = await api.login({ email, password });
      } else {
        res = await api.register({ email, password, name });
      }
      login(res.user, res.token);
      toast.success("Welcome to JananiAI!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    toast("Google Login requires a Client ID to be configured.", { icon: "ℹ️" });
  };

  return (
    <div className="min-h-screen dark-theme flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img src="/logo.png" alt="JananiAI Logo" className="h-20 w-auto object-contain" />
        </div>
        <Card className="space-y-6">
          <h2 className="text-2xl font-black text-center">{isLogin ? "Welcome Back" : "Create Account"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <input required className="input w-full" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
            )}
            <input required type="email" className="input w-full" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} />
            <input required type="password" className="input w-full" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <button disabled={loading} type="submit" className="btn-primary w-full text-center flex justify-center">
              {loading ? "Please wait..." : (isLogin ? "Log In" : "Register")}
            </button>
          </form>
          
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="shrink-0 px-4 text-xs text-red-500 uppercase">Or continue with</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>
          
          <button type="button" onClick={handleGoogle} className="btn-secondary w-full flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Google
          </button>
          
          <div className="text-center text-sm text-red-500 pt-2">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => setIsLogin(!isLogin)} className="font-bold text-white hover:underline">
              {isLogin ? "Sign Up" : "Log In"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("Insights");
  const [theme, setTheme] = useState(localStorage.getItem("jananiai-theme") || "dark");
  const { analytics, refresh } = useAnalytics();
  useEffect(() => { localStorage.setItem("jananiai-theme", theme); }, [theme]);

  if (!user) {
    return <AuthScreen />;
  }

  const pages = {
    Insights: <InsightsPage analytics={analytics} />,
    "Story Generator": <GeneratorPage onSaved={refresh} />,
    "Story Completion": <CompletionPage onSaved={refresh} />,
    "Story Library": <LibraryPage onSaved={refresh} />,
    Profile: <ProfilePage theme={theme} setTheme={setTheme} onSaved={refresh} />
  };

  return (
    <Shell page={page} setPage={setPage} theme={theme} setTheme={setTheme}>
      {Object.entries(pages).map(([name, component]) => (
        <div key={name} className={page === name ? "block" : "hidden"}>
          {component}
        </div>
      ))}
    </Shell>
  );
}
