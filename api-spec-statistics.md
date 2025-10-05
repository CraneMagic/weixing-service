# 质量记录统计信息 API 规范

## 接口概述

- **接口路径**: `/api/quality-records/statistics`
- **请求方法**: `GET`
- **功能**: 获取指定时间范围内的质量记录统计信息

## 请求参数

| 参数名     | 类型   | 必需 | 说明                     | 示例                            |
| ---------- | ------ | ---- | ------------------------ | ------------------------------- |
| startTime  | string | 是   | 开始时间 (ISO 8601 格式) | `2025-10-05T00:00:00.000Z`      |
| endTime    | string | 是   | 结束时间 (ISO 8601 格式) | `2025-10-05T23:59:59.000Z`      |
| client_ip  | string | 否   | 指定 IP 地址过滤         | `192.168.71.28`                 |
| pc_num     | string | 否   | 指定 PC 编号过滤         | `tongrang-LAB02`                |
| model_type | string | 否   | 模型类型过滤             | `DETECTION` 或 `CLASSIFICATION` |

## 请求示例

```bash
# 基础查询 - 获取某天的所有统计
GET /api/quality-records/statistics?startTime=2025-10-05T00:00:00.000Z&endTime=2025-10-05T23:59:59.000Z

# 指定IP查询
GET /api/quality-records/statistics?startTime=2025-10-05T00:00:00.000Z&endTime=2025-10-05T23:59:59.000Z&client_ip=192.168.71.28

# 指定PC编号查询
GET /api/quality-records/statistics?startTime=2025-10-05T00:00:00.000Z&endTime=2025-10-05T23:59:59.000Z&pc_num=tongrang-LAB02

# 指定模型类型查询
GET /api/quality-records/statistics?startTime=2025-10-05T00:00:00.000Z&endTime=2025-10-05T23:59:59.000Z&model_type=DETECTION
```

## 响应格式

### 成功响应 (200 OK)

```json
{
  "success": true,
  "data": {
    // 基础统计
    "totalImages": 1500,
    "passCount": 1200,
    "failCount": 280,
    "invalidCount": 20,

    // 审核状态统计
    "statusCounts": {
      "INREVIEW": 50, // 待审核
      "RESOLVED": 200, // 已解决
      "IGNORED": 30, // 已忽略
      "MARKED": 0 // 已标记
    },

    // 审核结果统计（仅针对已解决的记录）
    "reviewResultCounts": {
      "pass": 150, // 审核为合格
      "fail": 40, // 审核为不合格
      "unclear": 10 // 审核为无法判断
    },

    // 质量指标
    "qualityMetrics": {
      "falsePositiveRate": 12.5, // 误报率 (%)
      "falseNegativeRate": 2.1, // 漏报率 (%)
      "accuracy": 85.4 // 准确率 (%)
    },

    // 时间范围信息
    "timeRange": {
      "startTime": "2025-10-05T00:00:00.000Z",
      "endTime": "2025-10-05T23:59:59.000Z",
      "duration": "1天"
    }
  }
}
```

### 错误响应

#### 参数错误 (400 Bad Request)

```json
{
  "success": false,
  "error": "缺少必需的查询参数",
  "message": "startTime 和 endTime 参数是必需的"
}
```

#### 服务器错误 (500 Internal Server Error)

```json
{
  "success": false,
  "error": "服务器内部错误",
  "message": "统计信息计算失败"
}
```

## 计算逻辑说明

### 基础统计

- `totalImages`: 指定时间范围内的所有记录总数
- `passCount`: `label = 'pass'` 的记录数量
- `failCount`: `label = 'fail'` 的记录数量
- `invalidCount`: `label = 'invalid'` 的记录数量

### 审核状态统计

- `INREVIEW`: `status = 'INREVIEW'` 的记录数量
- `RESOLVED`: `status = 'RESOLVED'` 的记录数量
- `IGNORED`: `status = 'IGNORED'` 的记录数量
- `MARKED`: `status = 'MARKED'` 的记录数量

### 审核结果统计（仅针对已解决记录）

- `pass`: `status = 'RESOLVED' AND review_result = 'pass'` 的记录数量
- `fail`: `status = 'RESOLVED' AND review_result = 'fail'` 的记录数量
- `unclear`: `status = 'RESOLVED' AND review_result = 'unclear'` 的记录数量

### 质量指标计算

- `falsePositiveRate`: `(label='fail' AND review_result='pass'的记录数 / label='fail'的总记录数) * 100`
- `falseNegativeRate`: `(label='pass' AND review_result='fail'的记录数 / label='pass'的总记录数) * 100`
- `accuracy`: `(AI和人工审核结果一致的记录数 / 总审核记录数) * 100`

### 时间范围信息

- `duration`: 根据时间跨度自动生成描述，如 "1 天"、"2 小时"、"30 分钟" 等

## 性能要求

- 响应时间应在 500ms 以内
- 支持大数据量的聚合查询
- 建议对常用查询条件建立数据库索引

## 注意事项

1. 所有时间参数使用 ISO 8601 格式
2. 百分比数值保留 2 位小数
3. 当分母为 0 时，相关比率为 0
4. 时间范围不应超过 30 天，避免性能问题
5. 支持空结果（所有统计值为 0）
