import type { ReactNode } from "react";

export default function InformationPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <a href="/" className="text-sm text-[#FFC766] hover:underline">← Voltar ao Anirium</a>
      <h1 className="mt-8 font-serif text-3xl font-bold sm:text-4xl">{title}</h1>
      <div className="mt-8 space-y-8 text-base leading-7 text-[#EADCC8] [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#FFF9F0] [&_a]:text-[#FFC766] [&_a]:underline [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
      <nav aria-label="Informações do Anirium" className="mt-12 flex flex-wrap gap-6 border-t border-[#3A3A43] pt-6 text-sm text-[#FFC766]">
        <a href="/privacidade">Privacidade</a>
        <a href="/suporte">Suporte</a>
        <a href="/service">Anirium+ Service</a>
      </nav>
    </main>
  );
}
