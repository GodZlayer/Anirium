const fs = require("fs");
const manifestPath = "/app/.next/routes-manifest.json";
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.redirects = manifest.redirects || [];
  manifest.redirects = manifest.redirects.filter(r => r.destination !== "https://anirium.com.br");
  manifest.redirects.unshift({
    source: "/",
    destination: "https://anirium.com.br",
    statusCode: 302,
    regex: "^/(?:/)?$"
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("SUCCESS: routes-manifest.json patched with root redirect to anirium.com.br");
} else {
  console.error("ERROR: manifest not found at " + manifestPath);
}
