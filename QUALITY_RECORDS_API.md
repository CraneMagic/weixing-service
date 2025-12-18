# 质量检测记录 API 文档

## 概述

质量检测记录 API 提供了完整的管材质量检测数据管理功能，包括数据存储、查询、状态管理和图片处理。支持新增的 `error_path` 和 `oss_path` 字段，用于处理错误图片路径和 OSS 上传路径。

## 数据模型

### QualityRecord 接口

```typescript
interface QualityRecord {
  client_ip: string; // 客户端IP地址（主键）
  timestamp: string; // 时间戳（主键）
  capture_time?: string; // 捕获时间
  model_type?: string; // 模型类型
  label?: string; // 检测标签（pass/fail等）
  confidence?: number; // 置信度
  frame_id?: number; // 帧ID
  fis?: number; // 帧间隔
  fps?: number; // 帧率
  filename?: string; // 文件名
  resolution?: string; // 分辨率
  size_bytes?: number; // 文件大小（字节）
  size_formatted?: string; // 格式化文件大小
  jpeg_quality?: number; // JPEG质量
  inference_time_ms?: number; // 推理时间（毫秒）
  capture_time_ms?: number; // 捕获时间（毫秒）
  jpeg_encode_time_ms?: number; // JPEG编码时间（毫秒）
  image?: string | null; // 图片数据（Base64）
  message_id?: string; // 消息ID
  object_key?: string; // 临时文件夹路径
  status?: string; // 审核状态（NULL/IGNORED/INREVIEW）
  pc_num?: string; // 工控机编号
  error_path?: string | null; // 错误图片路径（仅fail标签有值）
  oss_path?: string | null; // OSS上传路径
  has_code?: boolean; // 是否有喷码
}
```

### 新增字段说明

- **`error_path`**: 错误图片路径，仅当 `label = "fail"` 时有值，其他情况为 `null`
- **`oss_path`**: OSS 上传路径，根据上传策略决定是否有值
- **`object_key`**: 临时文件夹路径，保持向后兼容
- **`has_code`**: 是否有喷码，布尔值，`true` 表示有喷码，`false` 表示无喷码，`null` 表示未设置

## API 接口

### 1. 创建质量检测记录

#### 单个记录创建

```http
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

#### 批量记录创建

```http
POST /api/quality-records/batch
Content-Type: application/json

{
  "records": [
    {
      "client_ip": "192.168.1.100",
      "timestamp": "20250612100000123456",
      "label": "fail",
      "confidence": 0.95,
      "error_path": "error/fail/2024/12/25/14/30/test_001.jpg",
      "oss_path": "weixing/error/fail/images/2024/12/25/14/30/test_001.jpg"
    },
    {
      "client_ip": "192.168.1.101",
      "timestamp": "20250612100000234567",
      "label": "pass",
      "confidence": 0.98,
      "oss_path": "weixing/pass/images/2024/12/25/14/31/test_002.jpg"
    }
  ]
}
```

### 2. 查询质量检测记录

#### 获取记录列表

```http
GET /api/quality-records?page=1&limit=20&client_ip=192.168.1.100&label=fail&status=INREVIEW
```

**查询参数：**

- `page`: 页码（默认：1）
- `limit`: 每页记录数（默认：20）
- `client_ip`: 客户端 IP 过滤
- `pcNum`: 工控机编号过滤
- `model_type`: 模型类型过滤
- `status`: 状态过滤（NULL/IGNORED/INREVIEW）
- `label`: 标签过滤
- `startTime`: 开始时间（ISO 格式）
- `endTime`: 结束时间（ISO 格式）
- `sortBy`: 排序字段（默认：timestamp）
- `sortOrder`: 排序方向（ASC/DESC，默认：DESC）

#### 获取单条记录

```http
GET /api/quality-records/{client_ip}/{timestamp}
```

#### 按秒统计

```http
GET /api/quality-records/by-second?startTime=2024-01-01T00:00:00Z&endTime=2024-01-02T00:00:00Z
```

#### 按秒和 IP 统计

```http
GET /api/quality-records/by-second/by-ip?startTime=2024-01-01T00:00:00Z&endTime=2024-01-02T00:00:00Z
```

### 3. 更新质量检测记录

#### 更新单条记录

```http
PUT /api/quality-records/{client_ip}/{timestamp}
Content-Type: application/json

{
  "status": "INREVIEW",
  "label": "fail",
  "error_path": "error/fail/2024/12/25/14/30/updated_test_001.jpg",
  "oss_path": "weixing/error/fail/images/2024/12/25/14/30/updated_test_001.jpg"
}
```

### 4. 状态管理接口

#### 批量更新 pass 记录状态为 IGNORED

```http
POST /api/quality-records/update-status/pass-to-ignored
```

#### 批量更新 fail 记录状态为 INREVIEW（全量）

```http
POST /api/quality-records/update-status/fail-to-inreview
Content-Type: application/json

[]
```

#### 批量更新指定 fail 记录状态为 INREVIEW

```http
POST /api/quality-records/update-status/fail-to-inreview
Content-Type: application/json

[
  {
    "client_ip": "192.168.1.101",
    "timestamp": "20250612100000123456"
  },
  {
    "client_ip": "192.168.1.102",
    "timestamp": "20250612100001234567"
  }
]
```

### 5. 图片管理接口

#### 获取图片

```http
GET /api/quality-records/images/{filename}
```

#### 获取存储空间信息

```http
GET /api/quality-records/storage-info
```

#### 手动触发清理

```http
# 常规清理
POST /api/quality-records/regular-cleanup

# 紧急清理
POST /api/quality-records/emergency-cleanup

# 自动检查并清理
POST /api/quality-records/auto-check-cleanup
```

### 6. 连接池状态监控

```http
GET /api/quality-records/pool-status
```

## 响应格式

### 成功响应

```json
{
  "success": true,
  "message": "操作成功",
  "data": {
    // 具体数据
  }
}
```

### 错误响应

```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

### 分页响应

```json
{
  "success": true,
  "data": [
    // 记录数组
  ],
  "total": 1000,
  "page": 1,
  "limit": 20
}
```

## 状态字段说明

- **`NULL`**: 初始状态
- **`IGNORED`**: 已忽略（通常用于 pass 记录）
- **`INREVIEW`**: 审核中（通常用于 fail 记录）

## 数据维护策略

### 自动清理

- fail 标签的图片保留 7 天
- 其他标签的图片保留 1 天
- 自动清理过期图片文件
- 支持紧急清理模式

### 手动维护

- 使用 `/api/quality-records/regular-cleanup` 接口执行常规清理
- 使用 `/api/quality-records/emergency-cleanup` 接口执行紧急清理
- 使用 `/api/quality-records/storage-info` 接口查看存储状态

## 使用示例

### 创建 fail 记录（包含 error_path）

```bash
curl -X POST http://localhost:3000/api/quality-records \
  -H "Content-Type: application/json" \
  -d '{
    "client_ip": "192.168.1.100",
    "timestamp": "20250612100000123456",
    "label": "fail",
    "confidence": 0.95,
    "error_path": "error/fail/2024/12/25/14/30/test_001.jpg",
    "oss_path": "weixing/error/fail/images/2024/12/25/14/30/test_001.jpg",
    "model_type": "yolo_v8",
    "pc_num": "PC-001"
  }'
```

### 创建 pass 记录（不包含 error_path）

```bash
curl -X POST http://localhost:3000/api/quality-records \
  -H "Content-Type: application/json" \
  -d '{
    "client_ip": "192.168.1.101",
    "timestamp": "20250612100000234567",
    "label": "pass",
    "confidence": 0.98,
    "oss_path": "weixing/pass/images/2024/12/25/14/31/test_002.jpg",
    "model_type": "yolo_v8",
    "pc_num": "PC-002"
  }'
```

### 查询 fail 记录

```bash
curl "http://localhost:3000/api/quality-records?label=fail&status=INREVIEW&limit=10"
```

### 批量更新状态

```bash
curl -X POST http://localhost:3000/api/quality-records/update-status/fail-to-inreview \
  -H "Content-Type: application/json" \
  -d '[
    {
      "client_ip": "192.168.1.101",
      "timestamp": "20250612100000123456"
    }
  ]'
```

## 审核功能

### 审核结果类型

- **`pass`**: 合格（无瑕疵）- 表示 AI 检测为 fail 但实际是误报
- **`fail`**: 不合格（有瑕疵）- 表示 AI 检测正确，确实有瑕疵
- **`unclear`**: 无法判断 - 表示图片质量或角度问题无法确定

### 审核相关接口

#### 获取待审核记录

```http
GET /api/quality-records/pending-review?page=1&limit=20&startTime=2024-01-01T00:00:00Z&endTime=2024-01-01T23:59:59Z&client_ip=192.168.1.100&pc_num=PC-001
```

#### 更新单条记录审核结果

```http
PUT /api/quality-records/{client_ip}/{timestamp}/review
Content-Type: application/json

{
  "review_result": "pass",  // pass/fail/unclear
  "reviewer": "admin",
  "review_notes": "审核备注"
}
```

#### 批量更新审核结果

```http
POST /api/quality-records/batch-review
Content-Type: application/json

{
  "records": [
    {
      "client_ip": "192.168.1.100",
      "timestamp": "20250612100000123456",
      "review_result": "pass"
    }
  ],
  "reviewer": "admin",
  "review_notes": "批量审核备注"
}
```

#### 获取误报率统计

```http
GET /api/quality-records/stats/false-positive-rate?startTime=2024-01-01T00:00:00Z&endTime=2024-01-31T23:59:59Z&groupBy=day
```

**响应格式：**

```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "total_reviewed": 100,
      "confirmed_fail": 85,
      "false_positive": 15,
      "unclear": 0,
      "false_positive_rate": 15.0
    }
  ],
  "summary": {
    "total_reviewed": 1000,
    "confirmed_fail": 850,
    "false_positive": 150,
    "unclear": 0,
    "false_positive_rate": 15.0
  }
}
```

### 误报率计算规则

- **误报率** = `false_positive` / (`confirmed_fail` + `false_positive`) \* 100%
- 只统计已审核的记录（`review_result` 不为 NULL）
- `unclear` 记录不参与误报率计算
- 支持按天、周、月分组统计

## 注意事项

1. **向后兼容性**: 新字段为可选字段，不影响现有 API 调用
2. **数据一致性**: `error_path` 仅在 `label = "fail"` 时有值
3. **图片存储**: 支持 Base64 图片数据，自动保存到本地文件系统
4. **批量操作**: 批量创建限制最大 100 条记录
5. **状态管理**: 系统会根据 label 自动设置初始状态
6. **存储清理**: 定期清理过期图片文件，释放磁盘空间
7. **审核功能**: 支持三种审核结果，误报率只统计已审核记录

## 错误处理

常见错误码：

- `400`: 请求参数错误
- `404`: 记录未找到
- `500`: 服务器内部错误
- `507`: 存储空间不足

## 性能优化

- 使用 PostgreSQL 数据库，支持高并发
- 添加了多个索引优化查询性能
- 支持分页查询，避免大量数据传输
- 图片文件自动清理，节省存储空间
