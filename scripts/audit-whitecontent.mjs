import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const roots=["resources/js","resources/data","resources/css","resources/views","app/Support","app/Http","routes","scripts/catalog/source-contracts.mjs"];
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const files=roots.flatMap(root=>fs.statSync(root).isDirectory()?walk(root):[root]).filter(file=>/\.(tsx?|mjs|css|php|json)$/.test(file)).sort();
const rules=[
  ["literal-color", /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i],
  ["palette-class", /\b(?:text|bg|border|fill|stroke|ring|shadow|placeholder)-(?:white|black|gray|slate|zinc|red|green|blue|yellow|amber|purple|pink|indigo|emerald|cyan|rose)(?:[\s/"'`-]|$)/],
  ["literal-ui-attribute", /\b(?:title|placeholder|aria-label|alt)\s*=\s*["'][^"']*[A-Za-zÀ-ÿ][^"']*["']/],
  ["literal-jsx-text", />\s*[A-Za-zÀ-ÿ][^<>{}]*</],
  ["content-specific", /PORTUGUESE_TITLE_MAP|LOCALIZED_SYNOPSIS_MAP|\b(?:Bleach|Naruto|Sword Art Online|Dragon Ball|Soul Society)\b/],
  ["identity-fallback", /mal-\$|episode:\$|:arc-\$|universe_id\s*\|\||work_id\s*\|\||\.mal_id\s*\|\|/],
];
const definitions=/resources\/js\/lib\/(?:designStrings|catalogStrings|discussionStrings|playbackStrings|unifiedCatalogStrings)\.ts$/;
const inventory=files.map(file=>{
  const source=fs.readFileSync(file,"utf8"), lines=source.split(/\r?\n/), normalized=file.replaceAll("\\","/");
  const central=definitions.test(normalized), findings=[];
  lines.forEach((line,index)=>{
    if(/^\s*(?:\/\/|\*|\/\*|<!--|\{\/\*)/.test(line))return;
    for(const [rule,pattern] of rules)if(pattern.test(line))findings.push({rule,line:index+1,evidence:line.trim().slice(0,300),centralDefinition:central});
  });
  return {file:normalized,lines:lines.length,sha256:createHash("sha256").update(source).digest("hex"),centralDefinition:central,findings};
});
const report={schema:1,checkedAt:new Date().toISOString(),scope:roots,limitations:["Lexical candidates require semantic review; comments and central definitions are classified separately.","This checks current source, not browser rendering or deployed artifact equality."],
  files:inventory.length,findings:inventory.flatMap(item=>item.findings).length,inventory};
const directory="storage/app/architecture-audit";fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,"whitecontent.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({files:report.files,byRule:Object.fromEntries(rules.map(([rule])=>[rule,inventory.flatMap(item=>item.findings).filter(item=>item.rule===rule&&!item.centralDefinition).length])),frontend:inventory.filter(item=>item.file.startsWith("resources/js/")).length,largest:inventory.filter(item=>item.file.startsWith("resources/js/")).sort((a,b)=>b.lines-a.lines).slice(0,8).map(({file,lines})=>({file,lines}))}));
