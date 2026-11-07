import React from "react";
import type { SupportedLanguage } from "../lib/designStrings";

interface FlagIconProps {
  code: SupportedLanguage;
  className?: string;
}

export function FlagIcon({ code, className = "w-5 h-3.5" }: FlagIconProps) {
  const commonClass = `${className} rounded-[2px] overflow-hidden shrink-0 shadow-xs inline-block align-middle border border-white/10`;

  switch (code) {
    case "pt-BR":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="640" height="480" fill="#009c3b" />
          <polygon points="320,55 585,240 320,425 55,240" fill="#ffdf00" />
          <circle cx="320" cy="240" r="120" fill="#002776" />
          <path d="M 200,245 C 245,210 395,210 440,240 C 395,224 245,224 200,245 Z" fill="#ffffff" />
        </svg>
      );

    case "en-US":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="640" height="480" fill="#b22234" />
          {/* 6 faixas brancas alternadas */}
          {[1, 3, 5, 7, 9, 11].map((i) => (
            <rect key={i} y={(480 / 13) * i} width="640" height={480 / 13} fill="#ffffff" />
          ))}
          {/* Cantão azul */}
          <rect width="260" height={(480 / 13) * 7} fill="#3c3b6e" />
          {/* Estrelas representativas */}
          <circle cx="65" cy="50" r="10" fill="#ffffff" />
          <circle cx="130" cy="50" r="10" fill="#ffffff" />
          <circle cx="195" cy="50" r="10" fill="#ffffff" />
          <circle cx="97" cy="100" r="10" fill="#ffffff" />
          <circle cx="162" cy="100" r="10" fill="#ffffff" />
          <circle cx="65" cy="150" r="10" fill="#ffffff" />
          <circle cx="130" cy="150" r="10" fill="#ffffff" />
          <circle cx="195" cy="150" r="10" fill="#ffffff" />
          <circle cx="97" cy="200" r="10" fill="#ffffff" />
          <circle cx="162" cy="200" r="10" fill="#ffffff" />
        </svg>
      );

    case "ja-JP":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="640" height="480" fill="#ffffff" />
          <circle cx="320" cy="240" r="144" fill="#bc002d" />
        </svg>
      );

    case "es-ES":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="640" height="480" fill="#aa151b" />
          <rect y="120" width="640" height="240" fill="#f1bf00" />
          <g transform="translate(130, 200)">
            <rect width="45" height="65" rx="8" fill="#aa151b" />
            <circle cx="22.5" cy="32.5" r="12" fill="#f1bf00" />
          </g>
        </svg>
      );

    case "fr-FR":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="213.3" height="480" fill="#002654" />
          <rect x="213.3" width="213.4" height="480" fill="#ffffff" />
          <rect x="426.7" width="213.3" height="480" fill="#ce1126" />
        </svg>
      );

    case "de-DE":
      return (
        <svg viewBox="0 0 640 480" className={commonClass} aria-hidden="true">
          <rect width="640" height="160" fill="#000000" />
          <rect y="160" width="640" height="160" fill="#dd0000" />
          <rect y="320" width="640" height="160" fill="#ffce00" />
        </svg>
      );

    default:
      return null;
  }
}
