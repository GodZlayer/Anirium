import fs from "node:fs";
import path from "node:path";

const directory="storage/app/architecture-audit";
const report=JSON.parse(fs.readFileSync(path.join(directory,"whitecontent.json"),"utf8"));
const frontend=report.inventory.filter(item=>item.file.startsWith("resources/js/"));
const known=new Set(frontend.map(item=>item.file)), edges=new Map(), imports=[];
const resolve=(file,reference)=>{
  const candidate=path.posix.normalize(path.posix.join(path.posix.dirname(file),reference));
  return [candidate,...[".tsx",".ts",".mjs",".json","/index.ts","/index.tsx"].map(extension=>candidate+extension)].find(value=>fs.existsSync(value)&&fs.statSync(value).isFile());
};
for(const file of frontend){
  const source=fs.readFileSync(file.file,"utf8"), dependencies=[];
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.[^"']+)["']/g)){
    const target=resolve(file.file,match[1]);
    imports.push({from:file.file,reference:match[1],target:target || null});
    if(target)dependencies.push(target);
  }
  edges.set(file.file,dependencies);
}
const entries=["resources/js/app.tsx",...frontend.filter(item=>item.file.startsWith("resources/js/Pages/")).map(item=>item.file)];
const reached=new Set(), queue=[...entries];
while(queue.length){const file=queue.pop();if(reached.has(file))continue;reached.add(file);queue.push(...(edges.get(file)||[]));}
const result={schema:1,entries,imports,files:frontend.map(item=>({file:item.file,staticallyReached:reached.has(item.file),imports:edges.get(item.file)})),limitations:["Literal relative imports and eager Pages glob only. Unreached does not prove unused: manifests and variable dynamic imports require review."]};
fs.writeFileSync(path.join(directory,"source-graph.json"),JSON.stringify(result,null,2));
const lines=["# Inventário da revisão whitecontent","","Gerado pelos scripts de auditoria. Alcance estático não comprova execução de um fluxo e ausência de achados lexicais não comprova conformidade.","","| Arquivo | Linhas | Candidatos lexicais | Alcance |","|---|---:|---:|---|"];
for(const file of report.inventory){const status=known.has(file.file)?reached.has(file.file)?"import estático / entrada":"revisar carga dinâmica ou não uso":"fora do grafo JS";lines.push(`| ${file.file} | ${file.lines} | ${file.findings.length} | ${status} |`);}
fs.mkdirSync("docs/audits",{recursive:true});fs.writeFileSync("docs/audits/whitecontent-inventory-2026-10-25.md",lines.join("\n")+"\n");
console.log(JSON.stringify({frontend:frontend.length,reached:frontend.filter(file=>reached.has(file.file)).length,unreached:result.files.filter(file=>!file.staticallyReached).map(file=>file.file),unresolvedImports:imports.filter(item=>!item.target)}));
