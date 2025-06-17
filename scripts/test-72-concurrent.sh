#!/bin/bash

# 简化版72并发写入测试
BASE_URL="http://localhost:3000"

echo "🚀 测试目标: 1秒内72个并发写入"

# 创建测试数据
cat > test_data.json << 'EOF'
{
  "client_ip": "192.168.1.100",
  "timestamp": "20250617000000001",
  "model_type": "test_model",
  "label": "pass",
  "confidence": 0.95,
  "frame_id": 1,
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": 1024000,
  "size_formatted": "1MB",
  "jpeg_quality": 85,
  "inference_time_ms": 15.5,
  "capture_time_ms": 2.3,
  "jpeg_encode_time_ms": 8.7,
  "pc_num": "PC001"
}
EOF

echo "📊 开始测试..."

# 测试72个请求，72并发
echo -e "\n🔥 测试1: 72请求/72并发 (极限测试)"
ab -n 72 -c 72 -p test_data.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 测试72个请求，36并发
echo -e "\n🔥 测试2: 72请求/36并发 (中等并发)"
ab -n 72 -c 36 -p test_data.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 测试72个请求，18并发
echo -e "\n🔥 测试3: 72请求/18并发 (低并发)"
ab -n 72 -c 18 -p test_data.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 检查连接池状态
echo -e "\n🏊 连接池状态:"
curl -s "$BASE_URL/api/quality-records/pool-status" | jq '.data.connections'

# 清理
rm -f test_data.json

echo -e "\n✅ 测试完成!"
echo "💡 如果RPS >= 72，说明能够满足1秒内72个请求的需求" 