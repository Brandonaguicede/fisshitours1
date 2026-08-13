export type GalleryCategory = 'fishing' | 'boats' | 'beach' | 'snorkeling' | 'wildlife' | 'sunsets' | 'experiences';

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  category: GalleryCategory;
}
