FROM node:22-alpine
WORKDIR /app
COPY server.js index.html wiki.html WIKI.md README.md LANGUAGE.md LICENSE E++.zip epp_language.zip ./
COPY js ./js
COPY css ./css
COPY third_party/licenses ./third_party/licenses
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=8000 HOST=0.0.0.0 EPP_GALLERY_PATH=/data/shared.js
EXPOSE 8000
CMD ["node", "server.js"]
