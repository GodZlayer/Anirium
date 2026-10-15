"use client";

import React, { useState } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Tooltip On-Demand (TGCode Standard)
 * Mantém a interface limpa e despoluída de textos longos.
 * Exibe a explicação contextual completa imediatamente ao hover ou foco de teclado.
 */
export default function Tooltip({
  content,
  children,
  position = "top",
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-[var(--color-text-primary)] bg-[var(--color-bg-raised,#23232A)] border border-[var(--color-border-highlight,#FFC766)]/50 rounded-lg shadow-xl backdrop-blur-md pointer-events-none whitespace-normal max-w-xs transition-opacity duration-200 animate-in fade-in-0 zoom-in-95 ${positionClasses[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
