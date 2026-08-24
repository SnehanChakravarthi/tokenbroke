"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tokenbroke-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="raised grid size-9 place-items-center text-sm"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      }}
    >
      <span aria-hidden>{dark ? "☾" : "☀"}</span>
    </button>
  );
}
