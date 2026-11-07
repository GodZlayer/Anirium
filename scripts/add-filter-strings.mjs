// Insere as chaves de filtro nos 6 idiomas do designStrings.ts (interface + cada locale).
import fs from "node:fs";

const file = "resources/js/lib/designStrings.ts";
let src = fs.readFileSync(file, "utf8");

if (src.includes("filterClear")) {
  console.log("Chaves já presentes; nada a fazer.");
  process.exit(0);
}

const keys = ["filterAll", "filterFormat", "filterGenre", "filterSort", "sortPopularity", "sortScore", "sortYear", "sortTitle", "filterClear", "noResults"];

const locales = [
  ["Todos", "Formato", "Gênero", "Ordenar", "Popularidade", "Nota", "Ano", "Título", "Limpar filtros", "Nenhuma obra encontrada com esses filtros"],
  ["All", "Format", "Genre", "Sort by", "Popularity", "Score", "Year", "Title", "Clear filters", "No titles match these filters"],
  ["すべて", "形式", "ジャンル", "並び替え", "人気", "評価", "年", "タイトル", "フィルターを解除", "該当する作品がありません"],
  ["Todos", "Formato", "Género", "Ordenar", "Popularidad", "Nota", "Año", "Título", "Limpiar filtros", "Ninguna obra coincide con estos filtros"],
  ["Tous", "Format", "Genre", "Trier", "Popularité", "Note", "Année", "Titre", "Effacer les filtres", "Aucune œuvre ne correspond à ces filtres"],
  ["Alle", "Format", "Genre", "Sortieren", "Beliebtheit", "Bewertung", "Jahr", "Titel", "Filter zurücksetzen", "Keine Titel gefunden"],
];

const lines = src.split("\n");
const out = [];
let localeIdx = 0;
let interfaceDone = false;

for (const line of lines) {
  out.push(line);
  if (!interfaceDone && /^\s*exploreDescription: string;\s*$/.test(line)) {
    for (const k of keys) out.push(`    ${k}: string;`);
    interfaceDone = true;
  } else if (/^\s*exploreDescription: ".*",\s*$/.test(line)) {
    const values = locales[localeIdx++];
    keys.forEach((k, i) => out.push(`      ${k}: ${JSON.stringify(values[i])},`));
  }
}

if (!interfaceDone || localeIdx !== 6) {
  console.error(`Inserção incompleta: interface=${interfaceDone}, locales=${localeIdx}/6. Nada foi gravado.`);
  process.exit(1);
}

fs.writeFileSync(file, out.join("\n"), "utf8");
console.log("Chaves inseridas: interface + 6 locales.");
