FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY manifest.json ./
ENV PORT=4005
EXPOSE 4005
CMD ["node", "server.js"]
