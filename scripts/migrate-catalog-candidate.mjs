import path from "node:path";
import { reprojectCandidate } from "./catalog/reproject-candidate.mjs";
const output = path.resolve(process.argv.find(arg => arg.startsWith("--output="))?.slice(9) || "storage/app/catalog/unified-candidate");
console.log(JSON.stringify(await reprojectCandidate(output)));
