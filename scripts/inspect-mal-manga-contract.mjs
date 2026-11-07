import fs from "node:fs";
import { createMalClient } from "./catalog/mal-client.mjs";

const fields = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,popularity,media_type,status,genres,num_chapters,num_volumes,authors,related_anime,related_manga";
const payload = await createMalClient(process.env.MAL_CLIENT_ID)(`https://api.myanimelist.net/v2/manga/21479?fields=${fields}`);
const evidence = { checkedAt: new Date().toISOString(), payload };
fs.mkdirSync("storage/app/catalog/myanimelist/manga-details", { recursive: true });
fs.writeFileSync("storage/app/catalog/myanimelist/manga-details/21479.json", JSON.stringify(evidence));
console.log(JSON.stringify({ id: payload.id, title: payload.title, fields: Object.keys(payload), media_type: payload.media_type,
  num_chapters: payload.num_chapters, num_volumes: payload.num_volumes, related_anime: payload.related_anime, related_manga: payload.related_manga }));
