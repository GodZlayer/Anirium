import React from 'react';

/**
 * Minimal Footer component used by the layout.
 * In a full redesign you would replace this with the actual branding,
 * links, and legal information from the design manual.
 */
export default function Footer() {
  return (
    <footer className="border-t border-[#3A3A43]/60 py-8 px-4 md:px-12 text-center text-xs text-[#EADCC8]/60 bg-[#0B0B0D]">
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex items-center justify-center gap-2">
          <img
            src="/assets/logos/Anirium-favicon.png"
            alt="Anirium"
            className="w-5 h-5 rounded object-contain opacity-80"
          />
          <span className="font-bold text-[#FFF9F0]">
            Anirium © 2026 • Plataforma Canônica de Descoberta, Organização e Genealogia de Franquias de Anime
          </span>
        </div>
        <p className="text-[11px] text-[#EADCC8]/50 leading-relaxed">
          Metadados factuais fornecidos por integrações canônicas autorizadas. O Anirium Core não transmite, armazena, hospeda nem indexa obras audiovisuais.
        </p>
        <div className="pt-2 flex justify-center gap-6 text-[11px] text-[#EADCC8]/60">
          <span className="hover:text-[#FFC766] transition cursor-pointer">Termos de Uso</span>
          <span>•</span>
          <span className="hover:text-[#FFC766] transition cursor-pointer">Política de Privacidade (LGPD)</span>
          <span>•</span>
          <span className="hover:text-[#FFC766] transition cursor-pointer">Notice &amp; Takedown</span>
          <span>•</span>
          <span className="hover:text-[#FFC766] transition cursor-pointer">Proteção à Criança e Adolescente (Lei 15.211/2025)</span>
        </div>
      </div>
    </footer>
  );
}
