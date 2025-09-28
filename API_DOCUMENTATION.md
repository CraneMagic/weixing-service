# 微星服务 API 接口文档

## 概述

微星服务是一个基于 Express.js 的后端服务，提供参数管理、设备控制、串口通信、质量检测等功能。

**基础 URL**: `http://localhost:3000` (默认端口)

**服务状态**: 可通过 `/health` 端点检查服务健康状态

## 接口分类

### 1. 系统健康检查

#### GET /health

检查服务健康状态

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "mode": "normal",
  "database": {
    "healthy": true,
    "totalConnections": 10,
    "idleConnections": 8,
    "waitingClients": 0
  },
  "availableServices": [
    "parameters",
    "device",
    "serial",
    "light",
    "relay",
    "measurements",
    "quality_records",
    "network_scan"
  ]
}
```

---

## 2. 参数管理 API (`/api/parameters`)

### GET /api/parameters

获取所有参数

**响应示例**:

```json
[
  {
    "key": "camera_settings",
    "value": {
      "resolution": "1920x1080",
      "fps": 30
    }
  }
]
```

### GET /api/parameters/:key

获取单个参数

**路径参数**:

- `key`: 参数键名

**响应示例**:

```json
{
  "key": "camera_settings",
  "value": {
    "resolution": "1920x1080",
    "fps": 30
  }
}
```

### GET /api/parameters/:key/:path

获取嵌套参数

**路径参数**:

- `key`: 参数键名
- `path`: 嵌套路径 (支持多级路径)

**响应示例**:

```json
{
  "key": "camera_settings",
  "path": "resolution",
  "value": "1920x1080"
}
```

### POST /api/parameters

创建或更新参数

**请求体**:

```json
{
  "key": "camera_settings",
  "value": {
    "resolution": "1920x1080",
    "fps": 30
  }
}
```

### POST /api/parameters/nested

更新嵌套参数

**请求体**:

```json
{
  "key": "camera_settings",
  "path": "resolution",
  "value": "1920x1080"
}
```

### POST /api/parameters/batch

批量更新参数

**请求体**:

```json
[
  {
    "key": "camera_settings",
    "value": {
      "resolution": "1920x1080",
      "fps": 30
    }
  },
  {
    "key": "system_config",
    "value": {
      "debug": true
    }
  }
]
```

### DELETE /api/parameters/:key

删除参数

**路径参数**:

- `key`: 参数键名

---

## 3. 设备管理 API (`/api/device`)

### POST /api/device/reboot

重启设备

**请求体**:

```json
{
  "ip": "192.168.1.100" // 可选，不提供则使用默认IP
}
```

**响应示例**:

```json
{
  "success": true,
  "message": "设备重启成功"
}
```

### POST /api/device/command

执行设备命令

**请求体**:

```json
{
  "command": "ls -la",
  "ip": "192.168.1.100" // 可选
}
```

**响应示例**:

```json
{
  "success": true,
  "output": "total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 ."
}
```

### POST /api/device/disconnect

断开 SSH 连接

**请求体**:

```json
{
  "ip": "192.168.1.100" // 可选，不提供则断开所有连接
}
```

---

## 4. 串口通信 API (`/api/serial`)

### POST /api/serial/open

打开串口

**响应示例**:

```json
{
  "success": true,
  "message": "串口已打开",
  "status": {
    "isOpen": true,
    "port": "/dev/ttyUSB0",
    "baudRate": 9600
  }
}
```

### POST /api/serial/close

关闭串口

**响应示例**:

```json
{
  "success": true,
  "message": "串口已关闭"
}
```

### GET /api/serial/status

获取串口状态

**响应示例**:

```json
{
  "success": true,
  "status": {
    "isOpen": true,
    "port": "/dev/ttyUSB0",
    "baudRate": 9600
  }
}
```

### POST /api/serial/send

发送数据到串口

**请求体**:

```json
{
  "data": "AT+COMMAND"
}
```

**响应示例**:

```json
{
  "success": true,
  "message": "数据已发送"
}
```

---

## 5. 灯光控制 API (`/api/light`)

### POST /api/light/normal

设置正常状态（绿灯开，红灯关）

**响应示例**:

```json
{
  "success": true,
  "message": "正常状态已设置"
}
```

### POST /api/light/alarm

设置报警状态（红灯开，绿灯关）

**响应示例**:

```json
{
  "success": true,
  "message": "报警状态已设置"
}
```

### POST /api/light/off

关闭所有指示灯

**响应示例**:

```json
{
  "success": true,
  "message": "所有指示灯已关闭"
}
```

---

## 6. 继电器控制 API (`/api/relay`)

### POST /api/relay/camera-power/off

关闭相机供电

**响应示例**:

```json
{
  "success": true,
  "message": "相机供电已关闭"
}
```

### POST /api/relay/camera-power/on

打开相机供电

**响应示例**:

```json
{
  "success": true,
  "message": "相机供电已打开"
}
```

### GET /api/relay/camera-power/status

查询相机供电状态

**响应示例**:

```json
{
  "success": true,
  "status": true, // true: 开启, false: 关闭
  "message": "相机供电状态: 开启"
}
```

### GET /api/relay/status

获取继电器串口连接状态

**响应示例**:

```json
{
  "success": true,
  "status": {
    "isOpen": true,
    "port": "/dev/ttyUSB1",
    "baudRate": 9600
  }
}
```

### GET /api/relay/test-connection

测试继电器串口连接

**响应示例**:

```json
{
  "success": true,
  "message": "继电器串口连接正常"
}
```

### GET /api/relay/test-query

测试不同的查询命令

**查询参数**:

- `commandType`: 命令类型 (status, status_with_feedback, toggle 等)

**响应示例**:

```json
{
  "success": true,
  "message": "查询命令发送成功"
}
```

### GET /api/relay/test-device-support

测试设备是否支持状态查询

**响应示例**:

```json
{
  "success": true,
  "supportsQuery": true,
  "responseData": ["Status: 开启"],
  "testResults": [
    {
      "command": "A0 01 05 A6",
      "sent": true,
      "response": true
    }
  ]
}
```

---

## 7. 测量数据 API (`/api/measurements`)

### POST /api/measurements

创建测量数据

**请求体**:

```json
{
  "value": 25.5,
  "unit": "°C",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "device_id": "sensor_001"
}
```

### GET /api/measurements

获取测量数据列表（支持分页、筛选、排序）

**查询参数**:

- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 50)
- `start_date`: 开始日期
- `end_date`: 结束日期
- `device_id`: 设备 ID
- `sort`: 排序字段
- `order`: 排序方向 (asc/desc)

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": "measurement_001",
      "value": 25.5,
      "unit": "°C",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "device_id": "sensor_001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

### GET /api/measurements/recent

获取最近的测量数据

**查询参数**:

- `limit`: 数量限制 (默认: 10)

### GET /api/measurements/:id

获取单条测量数据

### GET /api/measurements/csv

下载测量数据 CSV 文件

### GET /api/measurements/stats/compliance

获取合规性统计

### GET /api/measurements/stats/specs

获取规格统计

### GET /api/measurements/stats/trend

获取趋势统计

### POST /api/measurements/maintenance/cleanup

数据清理

### POST /api/measurements/maintenance/optimize

数据优化

### POST /api/measurements/udp/off

向测量单片机 UDP 发送关闭所有指示灯命令

### POST /api/measurements/udp/normal

向测量单片机 UDP 发送正常状态命令

### POST /api/measurements/udp/alarm

向测量单片机 UDP 发送报警状态命令

---

## 8. 质量记录 API (`/api/quality-records`)

### POST /api/quality-records

创建质量检测记录

**请求体**:

```json
{
  "client_ip": "192.168.1.100",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "result": "pass",
  "image_path": "/images/2024/01/01/image_001.jpg",
  "metadata": {
    "temperature": 25.5,
    "humidity": 60
  }
}
```

### POST /api/quality-records/batch

批量创建质量检测记录

**请求体**:

```json
[
  {
    "client_ip": "192.168.1.100",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "result": "pass",
    "image_path": "/images/2024/01/01/image_001.jpg"
  }
]
```

### GET /api/quality-records

获取质量检测记录列表

**查询参数**:

- `page`: 页码
- `limit`: 每页数量
- `start_date`: 开始日期
- `end_date`: 结束日期
- `client_ip`: 客户端 IP
- `result`: 检测结果 (pass/fail/ignored/in_review)
- `sort`: 排序字段
- `order`: 排序方向

### GET /api/quality-records/:client_ip/:timestamp

获取单条质量检测记录

### PUT /api/quality-records/:client_ip/:timestamp

更新质量检测记录

### DELETE /api/quality-records/:client_ip/:timestamp

删除质量检测记录

### GET /api/quality-records/by-second

获取按秒分组的统计信息

### GET /api/quality-records/by-second/by-ip

获取按秒和 IP 分组的统计信息

### GET /api/quality-records/pending-review

获取待审核记录

### PUT /api/quality-records/:client_ip/:timestamp/review

更新审核结果

### POST /api/quality-records/batch-review

批量更新审核结果

### GET /api/quality-records/stats/false-positive-rate

获取误报率统计

### GET /api/quality-records/storage-info

获取存储空间信息

### POST /api/quality-records/regular-cleanup

触发常规清理

### POST /api/quality-records/emergency-cleanup

触发紧急清理

### POST /api/quality-records/auto-check-cleanup

自动检查并清理

### GET /api/quality-records/pool-status

获取数据库连接池状态

### GET /api/quality-records/images/\*

获取图片文件

### GET /api/quality-records/error-images/\*

获取错误图片文件

**服务文件夹**: `./error/`

**示例**:

- 请求: `GET /api/quality-records/error-images/2024/fail/image001.jpg`
- 实际文件: `./error/2024/fail/image001.jpg`

---

## 9. 网络扫描 API (`/api/network`)

### GET /api/network/scan

完整网络扫描

**查询参数**:

- `subnet`: 子网地址 (可选，如 "192.168.1.0/24")

**响应示例**:

```json
{
  "success": true,
  "message": "网络扫描完成",
  "data": {
    "success": true,
    "devices": [
      {
        "ip": "192.168.1.1",
        "mac": "00:11:22:33:44:55",
        "hostname": "router",
        "isAlive": true,
        "responseTime": 5
      }
    ],
    "aliveCount": 1,
    "scanDuration": 2000
  }
}
```

### GET /api/network/quick-scan

快速网络扫描

### GET /api/network/devices/online

获取在线设备

### GET /api/network/devices/all

获取所有设备（包括离线设备）

### GET /api/network/devices/search

搜索特定设备

**查询参数**:

- `ip`: IP 地址
- `mac`: MAC 地址
- `hostname`: 主机名

### GET /api/network/status

网络状态检查

---

## 错误处理

所有 API 接口都遵循统一的错误响应格式：

```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

**常见 HTTP 状态码**:

- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误
- `503`: 服务不可用（数据库禁用模式）

---

## 环境变量配置

服务支持以下环境变量：

- `PORT`: 服务端口 (默认: 3000)
- `SKIP_DATABASE_VALIDATION`: 跳过数据库验证 (true/false)
- `ALARM_SERIAL_PORT`: 报警串口路径 (默认: /dev/ttyUSB0)
- `RELAY_SERIAL_PORT`: 继电器串口路径 (默认: /dev/ttyUSB1)
- `SERIAL_BAUD_RATE`: 串口波特率 (默认: 9600)
- `DATA_RETENTION_DAYS`: 数据保留天数 (默认: 90)
- `CLEANUP_INTERVAL_DAYS`: 清理间隔天数 (默认: 7)

---

## 注意事项

1. **数据库模式**: 当 `SKIP_DATABASE_VALIDATION=true` 时，数据库相关 API 将被禁用
2. **串口通信**: 需要确保串口设备正确连接并有适当权限
3. **文件上传**: 支持大文件上传，限制为 50MB
4. **CORS**: 已启用跨域资源共享
5. **日志**: 使用 Winston 进行日志记录，支持不同级别

---

## 更新日志

- **v1.0.0**: 初始版本，包含所有基础功能
- 支持参数管理、设备控制、串口通信
- 支持质量检测记录和测量数据管理
- 支持网络扫描和设备发现
- 支持继电器控制和相机供电管理
