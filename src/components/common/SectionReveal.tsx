import { useEffect, useRef, useState, type ReactNode } from 'react';

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
}

/** Reveals a section once it enters the viewport without affecting layout. */
export function SectionReveal({ children, className = '' }: SectionRevealProps) {
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

  return <div ref={ref} className={`section-reveal${visible ? ' section-reveal--visible' : ''}${className ? ` ${className}` : ''}`}>{children}</div>;
}
