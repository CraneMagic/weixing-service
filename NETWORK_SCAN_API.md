# 网络扫描 API 文档

## 概述

新增的网络扫描功能可以扫描局域网内的所有设备，获取设备的 IP 地址、MAC 地址、主机名和厂商信息。

## API 接口

### 1. 完整网络扫描

```
GET /api/network/scan?subnet=192.168.1.0/24
```

**参数：**

- `subnet` (可选): 要扫描的子网，格式为 `192.168.1.0/24`。如果不提供，将自动检测本机所在子网。

**响应示例：**

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
        "hostname": "router.local",
        "vendor": "Cisco",
        "isAlive": true,
        "responseTime": 1.2,
        "lastSeen": "2024-01-01T12:00:00.000Z"
      }
    ],
    "totalScanned": 254,
    "aliveCount": 5,
    "scanDuration": 15000
  }
}
```

### 2. 快速网络扫描

```
GET /api/network/quick-scan
```

快速扫描常见 IP 地址和 ARP 表中的设备，速度更快。

### 3. 获取在线设备

```
GET /api/network/devices/online
```

只返回当前在线的设备。

### 4. 获取所有设备

```
GET /api/network/devices/all
```

返回所有设备，包括离线设备（在 ARP 表中但 Ping 不通的设备）。

### 5. 搜索设备

```
GET /api/network/devices/search?ip=192.168.1&mac=00:11:22&hostname=router
```

**参数：**

- `ip` (可选): IP 地址或部分 IP 地址
- `mac` (可选): MAC 地址或部分 MAC 地址
- `hostname` (可选): 主机名或部分主机名

### 6. 网络状态检查

```
GET /api/network/status
```

检查网络状态和统计信息。

## 设备信息字段

- `ip`: IP 地址
- `mac`: MAC 地址（如果可用）
- `hostname`: 主机名（如果可解析）
- `vendor`: 设备厂商（基于 MAC 地址 OUI）
- `isAlive`: 是否在线（Ping 可达）
- `responseTime`: Ping 响应时间（毫秒）
- `lastSeen`: 最后发现时间

## 功能特性

1. **跨平台支持**: 支持 Windows、macOS 和 Linux
2. **并发扫描**: 使用并发 Ping 提高扫描速度
3. **ARP 表集成**: 结合 ARP 表信息发现更多设备
4. **厂商识别**: 基于 MAC 地址 OUI 识别设备厂商
5. **主机名解析**: 尝试解析设备主机名
6. **防火墙友好**: 即使设备阻止 Ping，也能通过 ARP 表发现

## 使用示例

### 扫描整个子网

```bash
curl "http://localhost:3000/api/network/scan?subnet=192.168.1.0/24"
```

### 快速扫描

```bash
curl "http://localhost:3000/api/network/quick-scan"
```

### 查找特定设备

```bash
curl "http://localhost:3000/api/network/devices/search?ip=192.168.1.100"
```

## 注意事项

1. 扫描大量 IP 地址可能需要较长时间
2. 某些设备可能阻止 Ping，但仍会在 ARP 表中显示
3. 需要适当的网络权限才能执行扫描
4. 扫描结果可能因网络配置而异

## 错误处理

所有接口都会返回统一的错误格式：

```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

常见错误：

- 无法获取本地网络信息
- 网络扫描超时
- 权限不足
- 无效的子网格式
