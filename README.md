# weixing-service

基于 Express 和 Node.js 的后端服务，使用 TypeScript 实现以下功能：

1. 通过 HTTP 接口管理持久化参数数据
2. 通过 SSH 协议远程重启 RISC-V 设备
3. 通过串口与本地设备通信

## 功能特点

- 基于 Express 的 RESTful API
- 使用 NeDB 进行轻量级持久化数据存储
- 通过 SSH 远程管理设备
- 串口通信支持
- 完整的日志记录
- TypeScript 强类型保障

## 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/weixing-service.git
cd weixing-service

# 安装依赖
npm install

# 编译TypeScript
npm run build
```

## 配置

在项目根目录创建`.env`文件，配置以下参数：

```
# 服务器配置
PORT=3000
NODE_ENV=development

# 持久化存储配置
DB_PATH=./data

# SSH配置
SSH_HOST=192.168.1.100
SSH_PORT=22
SSH_USERNAME=root
SSH_PRIVATE_KEY_PATH=/path/to/private/key
REBOOT_COMMAND=reboot

# 串口配置
ALARM_SERIAL_PORT=COM4
RELAY_SERIAL_PORT=COM5
SERIAL_BAUD_RATE=9600
```

## 运行

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start

# 跳过数据库验证模式（开发）
npm run dev:no-db

# 跳过数据库验证模式（生产）
npm run start:no-db
```

### 启动参数

#### SKIP_DATABASE_VALIDATION

当设置为 `true` 时，应用将跳过数据库连接验证，并禁用所有数据库相关的 API。

**使用场景：**

- 数据库服务不可用时仍需要测试非数据库功能
- 网络扫描、串口通信等独立功能的开发和测试
- 数据库维护期间的临时运行

**可用服务：**

- 串口通信 (`/api/serial/*`)
- 网络扫描 (`/api/network/*`)

**禁用服务：**

- 参数管理 (`/api/parameters/*`)
- 设备管理 (`/api/device/*`)
- 灯光控制 (`/api/light/*`)
- 继电器控制 (`/api/relay/*`)
- 测量数据 (`/api/measurements/*`)
- 质量记录 (`/api/quality-records/*`)

**设置方法：**

```bash
# 环境变量方式
export SKIP_DATABASE_VALIDATION=true
npm run dev

# 或使用预配置的脚本
npm run dev:no-db
```

## API 文档

### 参数管理

- `GET /api/parameters` - 获取所有参数
- `GET /api/parameters/:key` - 获取指定参数
- `POST /api/parameters` - 创建或更新参数
- `DELETE /api/parameters/:key` - 删除指定参数
- `POST /api/parameters/batch` - 批量更新参数

### 设备管理

- `POST /api/device/reboot` - 重启远程设备
- `POST /api/device/command` - 在远程设备执行命令
- `POST /api/device/disconnect` - 断开 SSH 连接

### 串口通信

- `POST /api/serial/open` - 打开串口
- `POST /api/serial/close` - 关闭串口
- `GET /api/serial/status` - 获取串口状态
- `POST /api/serial/send` - 发送数据到串口

## 示例

### 保存参数

```bash
curl -X POST http://localhost:3000/api/parameters \
  -H "Content-Type: application/json" \
  -d '{"key": "deviceName", "value": "RISC-V-001"}'
```

### 重启设备

```bash
curl -X POST http://localhost:3000/api/device/reboot
```

### 发送串口数据

```bash
curl -X POST http://localhost:3000/api/serial/send \
  -H "Content-Type: application/json" \
  -d '{"data": "AT+CMD\r\n"}'
```

# 管道测量数据存储

本项目使用 SQLite 数据库实现了管道测量数据的长期存储方案。该方案专为处理管道测量数据而设计，支持与现有 nedb 规格管理系统的无缝集成。

## 数据存储方案

### 数据库设计

使用 SQLite 作为底层存储引擎，主要特点：

- 嵌入式数据库，无需额外的数据库服务
- 使用单一文件存储，便于备份和迁移
- 支持标准 SQL 查询，高效处理大量数据
- 适合长期运行和数据持续积累的应用场景

### 表结构

测量数据表(measurements)包含以下字段：

- `id`: 自增主键
- `timestamp`: 测量时间戳
- `spec_id`: 关联的规格 ID (来自 nedb)
- `spec_name`: 规格名称
- `outer_max/avg/min`: 外径最大/平均/最小值
- `inner_max/avg/min`: 内径最大/平均/最小值
- `wall_max/avg/min`: 壁厚最大/平均/最小值
- `outer_non_circularity`: 外径不圆度
- `inner_non_circularity`: 内径不圆度
- `is_compliant`: 是否符合规格 (1=是, 0=否, NULL=未检查)
- `corrected_data`: 修正后的数据的 JSON 存储（包含修正后的外径和内径数据）
- `caculated_data`: 计算后的详细数据的 JSON 存储（包含外径、内径、壁厚以及中心点数据）

### 索引优化

为提高查询性能，添加了以下索引：

- 时间索引：快速检索特定时间范围内的数据
- 规格 ID 索引：按规格分组查询时提高性能
- 合规性索引：快速过滤符合/不符合规格的数据

## API 接口

### 数据存储接口

```
# 创建测量数据
POST /api/measurements
Content-Type: application/json

{
  "correctedData": {
    "outerAdjusted": number[],
    "innerAdjusted": number[]
  },
  "caculatedData": {
    "outer_diameters": number[][],
    "inner_diameters": number[][],
    "wall_thicknesses": number[][],
    "center": number[]
  },
  "resultData": {
    "outerStats": { "max": number, "avg": number, "min": number },
    "innerStats": { "max": number, "avg": number, "min": number },
    "wallStats": { "max": number, "avg": number, "min": number },
    "outerNonCircularity": number,
    "innerNonCircularity": number
  },
  "specKey": "可选的规格ID"
}
```

> **注意**: 系统支持最大 50MB 的请求体大小，适用于包含大量测量数据的请求。

### 数据查询接口

```
# 获取最近的测量数据
GET /api/measurements?hours=24&limit=1000&specId=可选的规格ID

# 获取单条测量数据
GET /api/measurements/:id
```

### 数据分析接口

```
# 获取合规性统计
GET /api/measurements/stats/compliance?startTime=ISO日期&endTime=ISO日期&specId=可选的规格ID

# 获取按规格分组的统计
GET /api/measurements/stats/specs?startTime=ISO日期&endTime=ISO日期

# 获取趋势数据
GET /api/measurements/stats/trend?startTime=ISO日期&endTime=ISO日期&interval=hour|day&specId=可选的规格ID
```

### 数据维护接口

```
# 清理过期数据
POST /api/measurements/maintenance/cleanup?days=90

# 优化数据库
POST /api/measurements/maintenance/optimize
```

## 数据维护策略

### 自动清理

系统配置了定时清理任务：

- 默认保留最近 90 天的数据（可通过环境变量 `DATA_RETENTION_DAYS` 配置）
- 定时清理间隔为 7 天（可通过环境变量 `CLEANUP_INTERVAL_DAYS` 配置）
- 清理后会自动优化数据库，释放磁盘空间

### 手动维护

可通过 API 接口手动触发数据清理和优化操作：

- 使用 `/api/measurements/maintenance/cleanup` 接口清理过期数据
- 使用 `/api/measurements/maintenance/optimize` 接口优化数据库

## 与规格系统集成

测量数据可以关联到 nedb 中存储的规格数据：

- 保存测量数据时可指定规格 ID
- 系统会自动判断数据是否符合规格要求
- 支持按规格分组查询和统计

## 环境变量配置

- `DB_PATH`: 数据目录路径，默认为 "./data"
- `DATA_RETENTION_DAYS`: 数据保留天数，默认为 90 天
- `CLEANUP_INTERVAL_DAYS`: 清理间隔天数，默认为 7 天

# 质量检测记录存储

本项目使用 PostgreSQL 数据库实现了质量检测记录的长期存储方案。该方案专为处理管材质量检测数据而设计，支持图片存储、状态管理和批量操作。

## 数据存储方案

### 数据库设计

使用 PostgreSQL 作为底层存储引擎，主要特点：

- 高性能关系型数据库，支持复杂查询
- 支持事务处理，确保数据一致性
- 支持 JSON 数据类型，灵活存储复杂数据
- 适合高并发和大数据量的应用场景

### 表结构

质量检测记录表(quality_records)包含以下字段：

- `client_ip`: 客户端 IP 地址（主键之一）
- `timestamp`: 时间戳（主键之一）
- `capture_time`: 捕获时间
- `model_type`: 模型类型
- `label`: 检测标签（pass/fail 等）
- `confidence`: 置信度
- `frame_id`: 帧 ID
- `fis`: 帧间隔
- `fps`: 帧率
- `filename`: 文件名
- `resolution`: 分辨率
- `size_bytes`: 文件大小（字节）
- `size_formatted`: 格式化文件大小
- `jpeg_quality`: JPEG 质量
- `inference_time_ms`: 推理时间（毫秒）
- `capture_time_ms`: 捕获时间（毫秒）
- `jpeg_encode_time_ms`: JPEG 编码时间（毫秒）
- `image`: 图片数据（Base64）
- `message_id`: 消息 ID
- `object_key`: 临时文件夹路径
- `status`: 审核状态（NULL/IGNORED/INREVIEW）
- `pc_num`: 工控机编号
- `error_path`: 错误图片路径（仅 fail 标签有值）
- `oss_path`: OSS 上传路径

### 索引优化

为提高查询性能，添加了以下索引：

- 时间索引：快速检索特定时间范围内的数据
- 客户端 IP 索引：按设备分组查询时提高性能
- 标签索引：快速过滤特定检测结果
- 状态索引：快速过滤特定审核状态
- 复合索引：优化聚合查询性能

## API 接口

### 数据存储接口

```
# 创建质量检测记录
POST /api/quality-records
Content-Type: application/json

{
  "client_ip": "192.168.1.100",
  "timestamp": "20250612100000123456",
  "label": "fail",
  "confidence": 0.95,
  "object_key": "2024/12/25/14/30/test_001.jpg",
  "error_path": "error/fail/2024/12/25/14/30/test_001.jpg",
  "oss_path": "weixing/error/fail/images/2024/12/25/14/30/test_001.jpg",
  "model_type": "yolo_v8",
  "pc_num": "PC-001",
  "image": "base64_encoded_image_data"
}
```

### 数据查询接口

```
# 获取质量检测记录列表
GET /api/quality-records?page=1&limit=20&client_ip=192.168.1.100&label=fail&status=INREVIEW

# 获取单条质量检测记录
GET /api/quality-records/{client_ip}/{timestamp}

# 按秒获取统计信息
GET /api/quality-records/by-second?startTime=2024-01-01T00:00:00Z&endTime=2024-01-02T00:00:00Z

# 按秒和IP获取统计信息
GET /api/quality-records/by-second/by-ip?startTime=2024-01-01T00:00:00Z&endTime=2024-01-02T00:00:00Z
```

### 状态管理接口

```
# 批量更新pass记录状态为IGNORED
POST /api/quality-records/update-status/pass-to-ignored

# 批量更新fail记录状态为INREVIEW（全量）
POST /api/quality-records/update-status/fail-to-inreview
Content-Type: application/json

[]

# 批量更新指定fail记录状态为INREVIEW
POST /api/quality-records/update-status/fail-to-inreview
Content-Type: application/json

[
  {
    "client_ip": "192.168.1.101",
    "timestamp": "20250612100000123456"
  }
]

# 更新单条记录
PUT /api/quality-records/{client_ip}/{timestamp}
Content-Type: application/json

{
  "status": "INREVIEW",
  "label": "fail"
}
```

### 图片管理接口

```
# 获取图片
GET /api/quality-records/images/{filename}

# 获取存储空间信息
GET /api/quality-records/storage-info

# 手动触发清理
POST /api/quality-records/regular-cleanup
POST /api/quality-records/emergency-cleanup
```

## 字段说明

### 新增字段

- `object_key`: 临时文件夹路径（保持向后兼容）
- `error_path`: 错误图片路径，仅 fail 标签有值，其他为 null
- `oss_path`: OSS 上传路径，按上传策略决定是否有值

### 状态字段

- `NULL`: 初始状态
- `IGNORED`: 已忽略（通常用于 pass 记录）
- `INREVIEW`: 审核中（通常用于 fail 记录）

## 数据维护策略

### 自动清理

系统配置了定时清理任务：

- fail 标签的图片保留 7 天
- 其他标签的图片保留 1 天
- 自动清理过期图片文件
- 支持紧急清理模式

### 手动维护

可通过 API 接口手动触发清理操作：

- 使用 `/api/quality-records/regular-cleanup` 接口执行常规清理
- 使用 `/api/quality-records/emergency-cleanup` 接口执行紧急清理
- 使用 `/api/quality-records/storage-info` 接口查看存储状态

## 环境变量配置

- `DB_PATH`: 数据目录路径，默认为 "./data"
- `DATA_RETENTION_DAYS`: 数据保留天数，默认为 90 天
- `CLEANUP_INTERVAL_DAYS`: 清理间隔天数，默认为 7 天
