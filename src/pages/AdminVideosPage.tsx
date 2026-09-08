import { FormEvent, useState } from 'react';
import { Check, Film, Plus, Trash2 } from 'lucide-react';
import { Container } from '../components/common/Container';
import { clearHeroVideoSettings, getActiveHeroVideo, getHeroVideos, HeroVideo, saveHeroVideos, setActiveHeroVideo } from '../services/heroVideoService';

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<HeroVideo[]>(getHeroVideos);
  const [activeId, setActiveId] = useState(getActiveHeroVideo().id);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const activate = (id: string) => { setActiveId(id); setActiveHeroVideo(id); };
  function addVideo(event: FormEvent) {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    const next = [...videos, { id: crypto.randomUUID(), name: name.trim() || 'Video del hero', url: cleanUrl }];
    setVideos(next); saveHeroVideos(next); setName(''); setUrl('');
  }
  function removeVideo(id: string) {
    if (videos.length === 1) return;
    const next = videos.filter((video) => video.id !== id); setVideos(next); saveHeroVideos(next);
    if (id === activeId) activate(next[0].id);
  }
  function reset() { clearHeroVideoSettings(); const next = getHeroVideos(); setVideos(next); setActiveId(next[0].id); }

  return <main className="min-h-screen bg-ocean-950 px-4 pb-16 pt-28 text-white sm:px-6"><Container>
    <div className="mb-10 flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300"><Film size={24} /></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Panel admin</p><h1 className="font-display text-4xl font-bold">Videos del hero</h1></div></div>
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]"><section className="space-y-4"><h2 className="text-lg font-bold">Biblioteca de videos R2</h2>{videos.map((video) => <article key={video.id} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-bold">{video.name}</p><p className="mt-1 truncate text-sm text-white/55">{video.url}</p></div><div className="flex shrink-0 gap-2"><button className="rounded-full border border-cyan-300/40 px-4 py-2 text-sm font-bold text-cyan-200 disabled:border-emerald-300/40 disabled:text-emerald-300" disabled={activeId === video.id} onClick={() => activate(video.id)} type="button">{activeId === video.id ? <><Check size={15} className="mr-1 inline" />Activo</> : 'Usar en hero'}</button><button className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/60 hover:text-red-300" aria-label={`Eliminar ${video.name}`} onClick={() => removeVideo(video.id)} type="button"><Trash2 size={16} /></button></div></article>)}</section>
    <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.06] p-6"><h2 className="text-lg font-bold">Agregar video</h2><p className="mt-2 text-sm leading-6 text-white/60">Sube el MP4 a R2 y pega aquí su URL pública.</p><form className="mt-5 space-y-3" onSubmit={addVideo}><input className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none" placeholder="Nombre del video" value={name} onChange={(e) => setName(e.target.value)} /><input className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none" placeholder="https://media.../video.mp4" required type="url" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 font-bold text-ocean-950" type="submit"><Plus size={18} />Agregar video</button></form><button className="mt-4 w-full text-sm text-white/50 underline" onClick={reset} type="button">Restablecer video local</button></aside></div>
  </Container></main>;
}
