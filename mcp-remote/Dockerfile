# Servidor MCP remoto. Construir desde la raíz del repositorio (necesita shared/):
#   docker build -f mcp-remote/Dockerfile -t solarsim-mcp-remote:<versión>-<sha> .
FROM node:24-alpine AS builder
WORKDIR /app/mcp-remote
COPY mcp-remote/package*.json ./
RUN npm ci
COPY mcp-remote/tsconfig.json ./
COPY mcp-remote/src ./src
COPY shared /app/shared
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY mcp-remote/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/mcp-remote/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/mcp-remote/src/index.js"]
