#!/bin/bash

# 带图片的72并发写入测试
BASE_URL="http://localhost:3000"

echo "🚀 测试目标: 1秒内72个并发写入 (包含图片)"

# 创建带图片的测试数据
cat > test_data_with_image.json << 'EOF'
{
  "client_ip": "192.168.1.101",
  "timestamp": "20250617000000101",
  "model_type": "image_test_model",
  "label": "fail",
  "confidence": 0.85,
  "frame_id": 101,
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": 2048000,
  "size_formatted": "2MB",
  "jpeg_quality": 85,
  "inference_time_ms": 25.5,
  "capture_time_ms": 3.1,
  "jpeg_encode_time_ms": 12.7,
  "pc_num": "PC101",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAQABADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAMEBv/EACQQAAEDAwMEAwAAAAAAAAAAAAECAwQABREGIRIxQVETImFx/8QAFwEAAwEAAAAAAAAAAAAAAAAAAAECA//EABwRAAICAwEBAAAAAAAAAAAAAAECABEDEiExQf/aAAwDAQACEQMRAD8A5+vtLXfT8xEPUFmfgOONJdSl5AUClWcHBBBwfkVmKt0ldNK3JcC+2qZbpSEhfhyWyhW0jI3B9RWy1TqKTrCz/sE2MqI42424y4gKLbiDkKAPUEbg1nKVKlQGLEzTHJGU4+P/2Q=="
}
EOF

echo "📊 开始带图片的高并发测试..."

# 测试1: 36个请求，18并发 (带图片)
echo -e "\n🔥 测试1: 36请求/18并发 (带图片)"
ab -n 36 -c 18 -p test_data_with_image.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 测试2: 72个请求，24并发 (带图片)
echo -e "\n🔥 测试2: 72请求/24并发 (带图片)"
ab -n 72 -c 24 -p test_data_with_image.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 测试3: 72个请求，36并发 (带图片)
echo -e "\n🔥 测试3: 72请求/36并发 (带图片)"
ab -n 72 -c 36 -p test_data_with_image.json -T "application/json" "$BASE_URL/api/quality-records" | grep -E "(Requests per second|Time per request|Failed requests|Time taken)"

# 检查存储空间
echo -e "\n💾 存储空间状态:"
curl -s "$BASE_URL/api/quality-records/storage-info" | jq '.data | {available_gb: .available_gb, used_percent: .used_percent}'

# 检查连接池状态
echo -e "\n🏊 连接池状态:"
curl -s "$BASE_URL/api/quality-records/pool-status" | jq '.data.connections'

# 清理
rm -f test_data_with_image.json

echo -e "\n✅ 带图片的高并发测试完成!"
echo "💡 图片处理会降低RPS，但如果仍然 >= 72，说明系统能够处理带图片的高并发场景" 