FROM node:18-alpine

WORKDIR /app

# 复制依赖相关文件
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 编译TypeScript
RUN npm run build

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data

# 创建数据目录并设置权限
RUN mkdir -p /app/data /app/logs && \
    chown -R node:node /app/data /app/logs

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/index.js"] 