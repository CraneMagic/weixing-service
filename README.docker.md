# Docker 部署说明

本文档介绍如何使用 Docker 和 Docker Compose 部署微型服务应用。

## 前提条件

- 安装 [Docker](https://docs.docker.com/get-docker/)
- 安装 [Docker Compose](https://docs.docker.com/compose/install/)

## 部署步骤

### 1. 构建并启动服务

在项目根目录下运行：

```bash
# 构建镜像并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 2. 停止服务

```bash
docker-compose down
```

### 3. 重新构建并启动

```bash
docker-compose up -d --build
```

## 数据持久化

服务使用以下卷进行数据持久化：

- `./data:/app/data` - 存储 NeDB 数据库文件和 SQLite 数据库
- `./logs:/app/logs` - 存储应用日志

## 环境变量配置

您可以在 `docker-compose.yml` 文件的 `environment` 部分修改以下环境变量：

- `PORT` - 应用端口（默认：3000）
- `DB_PATH` - 数据库存储路径（默认：/app/data）
- `DATA_RETENTION_DAYS` - 数据保留天数（默认：90）
- `CLEANUP_INTERVAL_DAYS` - 数据清理间隔天数（默认：7）

## 访问服务

部署成功后，可以通过 `http://localhost:3000` 访问服务的 API。

## 健康检查

服务配置了健康检查，每 30 秒检查一次服务状态。
