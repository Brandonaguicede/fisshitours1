export type HeroVideo = {
  id: string;
  name: string;
  url: string;
};

const STORAGE_KEY = 'papagayo.hero.videos';
const ACTIVE_KEY = 'papagayo.hero.activeVideo';
const DEFAULT_URL = '/videos/hero-ocean-charter.mp4';

function initialVideos(): HeroVideo[] {
  const configuredUrl = import.meta.env.VITE_HERO_VIDEO_URL?.trim();
  const url = configuredUrl || DEFAULT_URL;
  return [{ id: 'default-hero', name: 'Video principal', url }];
}

export function getHeroVideos(): HeroVideo[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const videos = JSON.parse(stored) as HeroVideo[];
      if (Array.isArray(videos) && videos.length > 0) return videos;
    }
  } catch {
    // Use the bundled default if local storage is unavailable or malformed.
  }
  return initialVideos();
}

export function saveHeroVideos(videos: HeroVideo[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
}

export function getActiveHeroVideo(): HeroVideo {
  const videos = getHeroVideos();
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  return videos.find((video) => video.id === activeId) || videos[0];
}

export function setActiveHeroVideo(id: string) {
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event('hero-video-change'));
}

export function clearHeroVideoSettings() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new Event('hero-video-change'));
}
