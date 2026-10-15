FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY manifest.json ./
ENV PORT=4004
EXPOSE 4004
CMD ["node", "server.js"]
