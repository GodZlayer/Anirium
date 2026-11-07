import React from "react";

export function ContextNavigationCard({ label, onOpen, children, className, style }: {
  label: string;
  onOpen: () => void;
  children: React.ReactNode;
  className: string;
  style: React.CSSProperties;
}) {
  return <button type="button" aria-label={label} onClick={onOpen} style={style}
    onFocus={event => {
      const card = event.currentTarget, track = card.parentElement;
      if (!track) return;
      const bounds = card.getBoundingClientRect(), viewport = track.getBoundingClientRect();
      if (bounds.right > viewport.right) track.scrollLeft += bounds.right - viewport.right;
      else if (bounds.left < viewport.left) track.scrollLeft -= viewport.left - bounds.left;
    }}
    className={`${className} text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300`}>
    {children}
  </button>;
}
