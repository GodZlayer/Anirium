import path from "node:path";
import { downloadSnapshot } from "./catalog/download-snapshot.mjs";

const url = "https://api.mangabaka.org/v1/database/series.jsonl.tar.gz";
const destination = path.resolve("storage/app/catalog/snapshots/mangabaka-series.jsonl.tar.gz");
console.log("[MangaBaka] Download com checksum e retomada; a execução não publica o catálogo.");
const result = await downloadSnapshot({ url, checksumUrl: url + ".sha1", destination });
console.log(JSON.stringify({ destination, ...result }));
