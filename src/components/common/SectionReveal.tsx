import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type SectionRevealVariant = 'rise' | 'emerge' | 'drift' | 'mask' | 'atmosphere';

/**
 * Style + attribute for a child that should stagger in after its parent
 * `SectionReveal` becomes visible (see `.section-reveal [data-reveal]` in
 * index.css). `order` 0 is first; each step adds ~110ms of delay.
 */
export function reveal(order: number): { 'data-reveal': true; style: CSSProperties } {
  return { 'data-reveal': true, style: { '--reveal-order': order } as CSSProperties };
}

/** Same stagger as `reveal()`, plus a very light blur→sharp settle — for a
 * single piece that should read as materializing (see `[data-reveal-blur]`
 * in index.css) rather than the plain fade+lift every other child gets. */
export function revealBlur(order: number): { 'data-reveal-blur': true; style: CSSProperties } {
  return { 'data-reveal-blur': true, style: { '--reveal-order': order } as CSSProperties };
}

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
  /**
   * Entrance language for this section. 'rise' (default) is the plain
   * fade+lift used for utilitarian sections; the others give each major
   * section its own underwater-flavored entrance instead of one identical
   * effect everywhere. See `.section-reveal--*` in index.css.
   */
  variant?: SectionRevealVariant;
}

/** Reveals a section once it enters the viewport without affecting layout. */
export function SectionReveal({ children, className = '', variant = 'rise' }: SectionRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const variantClass = variant !== 'rise' ? ` section-reveal--${variant}` : '';
  return <div ref={ref} className={`section-reveal${variantClass}${visible ? ' section-reveal--visible' : ''}${className ? ` ${className}` : ''}`}>{children}</div>;
}
