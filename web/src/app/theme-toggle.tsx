'use client';
import { useEffect, useState } from 'react';
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('health-theme'); } catch { /* Storage is optional. */ }
    const initial = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = initial ? 'dark' : 'light';
    setDark(initial);
  }, []);
  return <button type="button" className="theme" aria-label="明るい画面と暗い画面を切り替える" aria-pressed={dark} onClick={() => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('health-theme', next ? 'dark' : 'light'); } catch { /* Storage is optional. */ }
  }}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor"/></svg></button>;
}
