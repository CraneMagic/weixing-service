#!/bin/bash

# 压力测试脚本
# 测试微星服务的各个API端点性能

BASE_URL="http://localhost:3000"
RESULTS_DIR="./stress-test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 创建结果目录
mkdir -p $RESULTS_DIR

echo "🚀 开始压力测试 - $TIMESTAMP"
echo "📊 测试结果将保存到: $RESULTS_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试函数
run_test() {
    local test_name=$1
    local url=$2
    local requests=$3
    local concurrency=$4
    local method=${5:-GET}
    local data_file=${6:-}
    
    echo -e "\n${BLUE}🔥 测试: $test_name${NC}"
    echo "URL: $url"
    echo "请求数: $requests, 并发数: $concurrency, 方法: $method"
    
    local output_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.txt"
    
    if [ "$method" = "POST" ] && [ -n "$data_file" ]; then
        ab -n $requests -c $concurrency -p "$data_file" -T "application/json" "$url" > "$output_file" 2>&1
    else
        ab -n $requests -c $concurrency "$url" > "$output_file" 2>&1
    fi
    
    # 提取关键指标
    local rps=$(grep "Requests per second" "$output_file" | awk '{print $4}')
    local mean_time=$(grep "Time per request.*mean" "$output_file" | head -1 | awk '{print $4}')
    local failed=$(grep "Failed requests" "$output_file" | awk '{print $3}')
    
    echo -e "${GREEN}✅ 完成${NC}"
    echo "   RPS: $rps"
    echo "   平均响应时间: ${mean_time}ms"
    echo "   失败请求: $failed"
    echo "   详细结果: $output_file"
}

# 检查服务是否运行
echo -e "\n${YELLOW}🔍 检查服务状态...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ 服务未运行，请先启动服务${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 服务正常运行${NC}"

# 创建测试数据文件
echo -e "\n${YELLOW}📝 创建测试数据...${NC}"

# 简单质量记录数据（无图片）
cat > "$RESULTS_DIR/simple_record.json" << 'EOF'
{
  "client_ip": "192.168.1.100",
  "timestamp": "20250616185600001",
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

# 带图片的质量记录数据（小图片）
cat > "$RESULTS_DIR/image_record.json" << 'EOF'
{
  "client_ip": "192.168.1.101",
  "timestamp": "20250616185600002",
  "model_type": "test_model",
  "label": "fail",
  "confidence": 0.85,
  "frame_id": 2,
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": 2048000,
  "size_formatted": "2MB",
  "jpeg_quality": 85,
  "inference_time_ms": 18.2,
  "capture_time_ms": 2.1,
  "jpeg_encode_time_ms": 12.4,
  "pc_num": "PC002",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
}
EOF

echo -e "${GREEN}✅ 测试数据创建完成${NC}"

# 开始压力测试
echo -e "\n${YELLOW}🎯 开始压力测试...${NC}"

# 1. 健康检查端点 - 轻量级测试
run_test "health_check" "$BASE_URL/health" 1000 10

# 2. 连接池状态检查
run_test "pool_status" "$BASE_URL/api/quality-records/pool-status" 500 5

# 3. 质量记录查询 - 不同并发级别
run_test "get_records_low" "$BASE_URL/api/quality-records?limit=20&page=1" 500 5
run_test "get_records_medium" "$BASE_URL/api/quality-records?limit=20&page=1" 1000 10
run_test "get_records_high" "$BASE_URL/api/quality-records?limit=20&page=1" 2000 20

# 4. 简单记录创建（无图片）
run_test "create_simple_record" "$BASE_URL/api/quality-records" 500 5 "POST" "$RESULTS_DIR/simple_record.json"

# 5. 带图片记录创建（较重负载）
run_test "create_image_record" "$BASE_URL/api/quality-records" 100 3 "POST" "$RESULTS_DIR/image_record.json"

# 6. 复杂聚合查询
run_test "stats_by_second" "$BASE_URL/api/quality-records/by-second?limit=60&page=1" 200 5

# 7. 存储信息查询
run_test "storage_info" "$BASE_URL/api/quality-records/storage-info" 300 5

# 生成汇总报告
echo -e "\n${YELLOW}📊 生成测试报告...${NC}"

REPORT_FILE="$RESULTS_DIR/summary_report_${TIMESTAMP}.md"

cat > "$REPORT_FILE" << EOF
# 压力测试报告

**测试时间**: $(date)
**测试环境**: $(uname -a)
**Node.js版本**: $(node --version)

## 测试结果汇总

| 测试项目 | 请求数 | 并发数 | RPS | 平均响应时间(ms) | 失败请求 |
|---------|--------|--------|-----|-----------------|----------|
EOF

# 提取所有测试结果
for result_file in $RESULTS_DIR/*_${TIMESTAMP}.txt; do
    if [ -f "$result_file" ]; then
        test_name=$(basename "$result_file" "_${TIMESTAMP}.txt")
        rps=$(grep "Requests per second" "$result_file" | awk '{print $4}' | head -1)
        mean_time=$(grep "Time per request.*mean" "$result_file" | head -1 | awk '{print $4}')
        failed=$(grep "Failed requests" "$result_file" | awk '{print $3}')
        requests=$(grep "Complete requests" "$result_file" | awk '{print $3}')
        concurrency=$(grep "Concurrency Level" "$result_file" | awk '{print $3}')
        
        echo "| $test_name | $requests | $concurrency | $rps | $mean_time | $failed |" >> "$REPORT_FILE"
    fi
done

cat >> "$REPORT_FILE" << EOF

## 性能分析

### 🎯 关键发现
- **最高RPS**: 在健康检查端点达到
- **图片处理影响**: 带图片的请求明显较慢
- **数据库查询**: 复杂聚合查询性能表现
- **连接池状态**: 观察连接池使用情况

### 📈 优化建议
1. **连接池调优**: 根据并发需求调整连接池大小
2. **图片处理优化**: 考虑异步处理或压缩
3. **缓存策略**: 对频繁查询添加缓存
4. **索引优化**: 优化数据库查询性能

### 🔧 系统资源使用
- 查看系统监控了解CPU、内存、磁盘使用情况
- 监控数据库连接数和查询性能
- 观察网络I/O和磁盘I/O情况

EOF

echo -e "\n${GREEN}🎉 压力测试完成！${NC}"
echo -e "${BLUE}📋 测试报告: $REPORT_FILE${NC}"
echo -e "${BLUE}📁 详细结果: $RESULTS_DIR${NC}"

# 显示汇总
echo -e "\n${YELLOW}📊 快速汇总:${NC}"
cat "$REPORT_FILE" | grep -A 20 "| 测试项目"

# 清理临时文件
rm -f "$RESULTS_DIR/simple_record.json" "$RESULTS_DIR/image_record.json"

echo -e "\n${GREEN}✅ 测试完成，建议查看详细报告进行性能分析${NC}" 