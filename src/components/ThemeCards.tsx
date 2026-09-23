"use client";

import { Check, ArrowUp, Plus, Sparkles } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";

// Each preview owns its tokens, including Ember when the app is dark.
function PreviewArt({ id, large = false }: { id: ThemeId; large?: boolean }) {
  return (
    <span data-theme={id} aria-hidden="true" className={`theme-art ${large ? "theme-art-large" : ""}`}>
      <span className="theme-art-header">
        <span className="theme-art-avatar">R</span>
        <span className="theme-art-contact">Your people<span>Always a little closer</span></span>
        <span className="theme-art-dot" />
      </span>
      <span className="theme-art-messages">
        <span className="theme-art-incoming">Same time, same place?</span>
        <span className="theme-art-outgoing">Wouldn’t miss it. <Check size={12} /></span>
      </span>
      {large && <span className="theme-art-composer"><Plus size={16} /><span>Message…</span><span className="theme-art-send"><ArrowUp size={15} /></span></span>}
    </span>
  );
}

export function ThemeCards() {
  const { theme, setTheme } = useTheme();
  const selected = THEMES.find(t => t.id === theme)!;
  return (
    <div className="appearance-picker">
      <div className="appearance-showcase">
        <div className="appearance-intro">
          <span className="appearance-eyebrow"><Sparkles size={14} /> MADE FOR YOUR MOOD</span>
          <h3>{selected.label}</h3>
          <p>{selected.blurb}. A fresh feel for every conversation.</p>
          <span className="appearance-saved"><Check size={14} /> Saved on this device</span>
        </div>
        <PreviewArt id={theme} large />
      </div>
      <div className="theme-grid" role="group" aria-label="Theme">
        {THEMES.map(t => {
          const active = theme === t.id;
          return (
            <button key={t.id} onClick={() => setTheme(t.id)} aria-pressed={active}
              aria-label={`${t.label}${active ? " (active)" : ""}`} data-active={active} className="theme-preview">
              <PreviewArt id={t.id} />
              <span className="theme-card-caption">
                <span><span className="theme-card-name">{t.label}</span><span className="theme-card-description">{t.blurb}</span></span>
                <span className="theme-choice-mark">{active && <Check size={13} strokeWidth={2.5} />}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
