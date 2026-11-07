FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY server.test.js ./
COPY manifest.json ./
COPY verify-runtime.js ./
COPY verify-boundaries.js ./
COPY verify-boundaries.test.js ./
RUN node verify-boundaries.js
RUN node --test verify-boundaries.test.js
RUN node --check server.js
RUN node --test server.test.js
USER node
RUN node verify-runtime.js
ENV PORT=4001
EXPOSE 4001
CMD ["node", "server.js"]
