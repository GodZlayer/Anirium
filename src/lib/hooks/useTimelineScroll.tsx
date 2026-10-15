'use client';
// src/lib/hooks/useTimelineScroll.ts
import { useEffect, useState, createContext, useContext, ReactNode } from 'react';

interface TimelineContextValue {
  /** Normalized scroll position (0 – 1) */
  t: number;
}

const TimelineContext = createContext<TimelineContextValue>({ t: 0 });

export const TimelineProvider = ({ children }: { children: ReactNode }) => {
  const [t, setT] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const maxScroll = docHeight - winHeight;
      const newT = maxScroll > 0 ? scrollY / maxScroll : 0;
      setT(Math.min(Math.max(newT, 0), 1));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initialise
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  

return <TimelineContext.Provider value={{ t }}>{children}</TimelineContext.Provider>;
};

export const useTimeline = () => useContext(TimelineContext);
