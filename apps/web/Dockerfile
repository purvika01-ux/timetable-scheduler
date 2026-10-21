# Development image used by `make dev`. A production image arrives with deployment (Phase 11).
FROM node:24-alpine
WORKDIR /srv/web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
USER node
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
