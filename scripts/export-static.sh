#!/bin/sh
set -e
rm -rf /app/build-export
mkdir -p /app/build-export/src/app /app/build-export/public
cp -r /app/src/app/page.tsx /app/src/app/layout.tsx /app/src/app/globals.css /app/src/app/calendar /app/src/app/privacidade /app/src/app/service /app/src/app/suporte /app/src/app/_not-found /app/build-export/src/app/ 2>/dev/null || true
cp -r /app/src/addons /app/src/components /app/src/context /app/src/lib /app/src/types /app/build-export/src/
cp -r /app/public/* /app/build-export/public/
cat << 'EOF' > /app/build-export/next.config.mjs
const nextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};
export default nextConfig;
EOF
cp /app/tsconfig.json /app/package.json /app/build-export/
ln -s /app/node_modules /app/build-export/node_modules
cd /app/build-export
npx next build
cp -r out/* /export-out/
echo "STATIC EXPORT SUCCESS"
