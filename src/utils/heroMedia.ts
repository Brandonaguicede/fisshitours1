// Which media the home Hero shows for a given set of `home.hero.*` settings. The public Hero and the Admin's Portada preview both
// read it, so the preview shows exactly what the landing resolves (video vs image, desktop vs phone, poster fallback) instead of a
// second implementation that can drift.

// Upgrade only our bundled assets. Custom videos selected in the admin remain intact.
export function currentHeroAsset(value: string) {
  const upgrades: Record<string, string> = {
    '/videos/hero-papagayo-desktop-v1.mp4': '/videos/hero-papagayo-desktop-v2.mp4',
    '/videos/hero-papagayo-mobile-v1.mp4': '/videos/hero-papagayo-mobile-v2.mp4',
    '/images/hero-papagayo-poster-v1.webp': '/images/hero-papagayo-poster-v2.webp',
  };
  return upgrades[value] ?? value;
}

export type HeroMediaSettings = Partial<Record<string, string>>;

export interface ResolvedHeroMedia {
  /** `home.hero.media_mode === 'video'`. */
  videoMode: boolean;
  /** The video the landing would play in this context ('' when none is configured). Phones prefer the phone video, computers the desktop one. */
  videoUrl: string;
  /** Still frame shown while the video loads / when it cannot play; also the background of a video-mode hero without a playable video. */
  poster: string;
  /** First slide of the image slideshow for this context: the phone image on phones, the desktop image otherwise ('' = nothing configured). */
  imageUrl: string;
}

export function resolveHeroMedia(settings: HeroMediaSettings, isMobile: boolean): ResolvedHeroMedia {
  const value = (key: string) => settings[key] ?? '';
  const desktopVideo = currentHeroAsset(value('home.hero.video'));
  const mobileVideo = currentHeroAsset(value('home.hero.mobile_video')) || desktopVideo;
  return {
    videoMode: value('home.hero.media_mode') === 'video',
    videoUrl: isMobile ? mobileVideo : desktopVideo || mobileVideo,
    poster: currentHeroAsset(value('home.hero.video_poster')) || (isMobile ? value('home.hero.mobile_image') : '') || value('home.hero.image'),
    imageUrl: isMobile ? value('home.hero.mobile_image') : value('home.hero.image'),
  };
}
