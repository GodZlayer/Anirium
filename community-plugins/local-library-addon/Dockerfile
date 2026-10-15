FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY manifest.json ./
ENV PORT=4002
EXPOSE 4002
CMD ["node", "server.js"]
