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
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD_RATE=9600
```

## 运行

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
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
