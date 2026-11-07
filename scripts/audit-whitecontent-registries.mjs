import fs from "node:fs";
import path from "node:path";
import { transformWithOxc } from "vite";

const locales=["pt-BR","en-US","ja-JP","es-ES","fr-FR","de-DE"];
const modules=["designStrings","catalogStrings","discussionStrings","playbackStrings","unifiedCatalogStrings"];
const flatten=(value,prefix="")=>value && typeof value==="object" ? Object.entries(value).flatMap(([key,item])=>flatten(item,prefix?`${prefix}.${key}`:key)):[prefix];
const registries=[], loaded={};
for(const name of modules){
  const file=`resources/js/lib/${name}.ts`, source=fs.readFileSync(file,"utf8");
  const transformed=await transformWithOxc(source,file);
  const exports=await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  loaded[name]=exports;
  for(const [id,value] of Object.entries(exports)){
    if(!value || typeof value!=="object" || !locales.some(locale=>locale in value))continue;
    const paths=value=>value===undefined?[]:typeof value==="string"?["$value"]:flatten(value).filter(Boolean);
    const keys=[...new Set(locales.flatMap(locale=>paths(value[locale])))];
    registries.push({file,id,keys:keys.length,locales:locales.map(locale=>({locale,present:locale in value,missing:keys.filter(key=>!paths(value[locale]).includes(key))}))});
  }
}
const themes=loaded.designStrings.THEME_PALETTES;
const expected=[...new Set(Object.values(themes).flatMap(value=>flatten(value)))];
const themeCoverage=Object.entries(themes).map(([id,value])=>({id,missing:expected.filter(key=>!flatten(value).includes(key))}));
const report=JSON.parse(fs.readFileSync("storage/app/architecture-audit/whitecontent.json","utf8"));
const usages=[],invalid=[];
for(const entry of report.inventory.filter(item=>item.file.startsWith("resources/js/")&&!item.centralDefinition)){
  const lines=fs.readFileSync(entry.file,"utf8").split(/\r?\n/);
  lines.forEach((line,index)=>{
    if(/^\s*(?:\/\/|\*|\/\*)/.test(line))return;
    for(const match of line.matchAll(/\b(?:tokens|theme)\.(colors|radii)\.([A-Za-z]\w*)/g)){
      const key=`${match[1]}.${match[2]}`, missingIn=Object.entries(themes).filter(([,value])=>value[match[1]]?.[match[2]]===undefined).map(([id])=>id);
      const usage={file:entry.file,line:index+1,key};usages.push(usage);
      if(missingIn.length)invalid.push({...usage,missingIn});
    }
  });
}
const result={schema:1,checkedAt:new Date().toISOString(),registries,themeCoverage,invalidTokenReferences:invalid,unusedThemeFields:expected.filter(key=>!usages.some(usage=>usage.key===key)&&/^(colors|radii)\./.test(key)),limitations:["Key parity is structural; it does not prove translation quality or that every visible state uses a dictionary.","Literal token access only; dynamic indexing and browser computed CSS require separate review."]};
fs.writeFileSync(path.join("storage/app/architecture-audit","registries.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
