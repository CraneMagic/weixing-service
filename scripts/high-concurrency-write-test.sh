#!/bin/bash

# 高并发写入测试脚本
# 测试目标：1秒内处理72个写入请求

BASE_URL="http://localhost:3000"
RESULTS_DIR="./high-concurrency-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 创建结果目录
mkdir -p $RESULTS_DIR

echo "🚀 高并发写入测试 - 目标: 1秒内72个请求"
echo "📊 测试结果将保存到: $RESULTS_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查服务状态
echo -e "\n${YELLOW}🔍 检查服务状态...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ 服务未运行，请先启动服务${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 服务正常运行${NC}"

# 创建测试数据模板
echo -e "\n${YELLOW}📝 创建测试数据模板...${NC}"

# 生成不同的测试数据，避免主键冲突
generate_test_data() {
    local id=$1
    local current_time=$(date +"%Y%m%d%H%M%S")
    cat << EOF
{
  "client_ip": "192.168.1.${id}",
  "timestamp": "${current_time}${id}",
  "model_type": "test_model_${id}",
  "label": "$([ $((id % 3)) -eq 0 ] && echo "fail" || echo "pass")",
  "confidence": 0.$(( (id % 99) + 1 )),
  "frame_id": ${id},
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": $((1024000 + id * 1000)),
  "size_formatted": "1MB",
  "jpeg_quality": 85,
  "inference_time_ms": $((10 + id % 20)).5,
  "capture_time_ms": 2.3,
  "jpeg_encode_time_ms": 8.7,
  "pc_num": "PC$(printf "%03d" $id)"
}
EOF
}

# 生成带小图片的测试数据
generate_image_test_data() {
    local id=$1
    local current_time=$(date +"%Y%m%d%H%M%S")
    cat << EOF
{
  "client_ip": "192.168.2.${id}",
  "timestamp": "${current_time}${id}",
  "model_type": "image_model_${id}",
  "label": "$([ $((id % 2)) -eq 0 ] && echo "fail" || echo "pass")",
  "confidence": 0.$(( (id % 99) + 1 )),
  "frame_id": ${id},
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": $((2048000 + id * 1000)),
  "size_formatted": "2MB",
  "jpeg_quality": 85,
  "inference_time_ms": $((15 + id % 25)).2,
  "capture_time_ms": 2.1,
  "jpeg_encode_time_ms": 12.4,
  "pc_num": "PC$(printf "%03d" $id)",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
}
EOF
}

# 执行高并发测试的函数
run_concurrent_test() {
    local test_name=$1
    local total_requests=$2
    local concurrency=$3
    local use_image=${4:-false}
    
    echo -e "\n${BLUE}🔥 测试: $test_name${NC}"
    echo "总请求数: $total_requests, 并发数: $concurrency"
    echo "预期时间: $(echo "scale=2; $total_requests / 72" | bc)秒 (目标: 72 RPS)"
    
    # 生成测试数据文件
    local data_files=()
    for ((i=1; i<=total_requests; i++)); do
        local data_file="$RESULTS_DIR/data_${test_name}_${i}.json"
        if [ "$use_image" = true ]; then
            generate_image_test_data $i > "$data_file"
        else
            generate_test_data $i > "$data_file"
        fi
        data_files+=("$data_file")
    done
    
    echo "数据文件生成完成，开始测试..."
    
    # 记录开始时间
    local start_time=$(date +%s.%N)
    
    # 使用Apache Bench进行测试
    local output_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.txt"
    
    # 创建一个包含所有数据的单一文件用于ab测试
    local combined_data="$RESULTS_DIR/combined_${test_name}.json"
    generate_test_data 1 > "$combined_data"
    
    ab -n $total_requests -c $concurrency -p "$combined_data" -T "application/json" \
       "$BASE_URL/api/quality-records" > "$output_file" 2>&1
    
    # 记录结束时间
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    # 提取关键指标
    local rps=$(grep "Requests per second" "$output_file" | awk '{print $4}')
    local mean_time=$(grep "Time per request.*mean" "$output_file" | head -1 | awk '{print $4}')
    local failed=$(grep "Failed requests" "$output_file" | awk '{print $3}')
    local total_time=$(grep "Time taken for tests" "$output_file" | awk '{print $5}')
    
    echo -e "${GREEN}✅ 测试完成${NC}"
    echo "   实际用时: ${duration}秒"
    echo "   ab报告用时: ${total_time}秒"
    echo "   RPS: $rps (目标: 72)"
    echo "   平均响应时间: ${mean_time}ms"
    echo "   失败请求: $failed"
    
    # 判断是否达到目标
    local rps_int=${rps%.*}
    if [ "$rps_int" -ge 72 ]; then
        echo -e "   ${GREEN}🎯 达到目标 (≥72 RPS)${NC}"
    else
        echo -e "   ${RED}❌ 未达目标 (<72 RPS)${NC}"
    fi
    
    echo "   详细结果: $output_file"
    
    # 清理临时数据文件
    rm -f "${data_files[@]}" "$combined_data"
}

# 测试连接池状态
echo -e "\n${YELLOW}🏊 检查连接池初始状态...${NC}"
curl -s "$BASE_URL/api/quality-records/pool-status" | jq .

echo -e "\n${YELLOW}🎯 开始高并发写入测试...${NC}"

# 测试1: 72个请求，72并发 - 极限测试
run_concurrent_test "extreme_72_72" 72 72

# 测试2: 72个请求，36并发 - 中等并发
run_concurrent_test "moderate_72_36" 72 36

# 测试3: 72个请求，18并发 - 低并发
run_concurrent_test "low_72_18" 72 18

# 测试4: 144个请求，72并发 - 2秒测试
run_concurrent_test "double_144_72" 144 72

# 测试5: 36个请求，36并发 - 0.5秒测试
run_concurrent_test "half_36_36" 36 36

# 测试6: 带图片的高并发测试 (较少请求)
run_concurrent_test "image_36_18" 36 18 true

# 测试后检查连接池状态
echo -e "\n${YELLOW}🏊 检查连接池最终状态...${NC}"
curl -s "$BASE_URL/api/quality-records/pool-status" | jq .

# 生成测试报告
echo -e "\n${YELLOW}📊 生成测试报告...${NC}"

REPORT_FILE="$RESULTS_DIR/high_concurrency_report_${TIMESTAMP}.md"

cat > "$REPORT_FILE" << EOF
# 高并发写入测试报告

**测试时间**: $(date)
**测试目标**: 1秒内处理72个写入请求
**测试环境**: $(uname -a)
**Node.js版本**: $(node --version)

## 测试结果汇总

| 测试场景 | 请求数 | 并发数 | RPS | 响应时间(ms) | 失败数 | 是否达标 |
|---------|--------|--------|-----|-------------|--------|----------|
EOF

# 提取测试结果
for result_file in $RESULTS_DIR/*_${TIMESTAMP}.txt; do
    if [ -f "$result_file" ]; then
        test_name=$(basename "$result_file" "_${TIMESTAMP}.txt")
        rps=$(grep "Requests per second" "$result_file" | awk '{print $4}' | head -1)
        mean_time=$(grep "Time per request.*mean" "$result_file" | head -1 | awk '{print $4}')
        failed=$(grep "Failed requests" "$result_file" | awk '{print $3}')
        requests=$(grep "Complete requests" "$result_file" | awk '{print $3}')
        concurrency=$(grep "Concurrency Level" "$result_file" | awk '{print $3}')
        
        # 判断是否达标
        rps_int=${rps%.*}
        if [ "$rps_int" -ge 72 ]; then
            status="✅ 是"
        else
            status="❌ 否"
        fi
        
        echo "| $test_name | $requests | $concurrency | $rps | $mean_time | $failed | $status |" >> "$REPORT_FILE"
    fi
done

cat >> "$REPORT_FILE" << EOF

## 性能分析

### 🎯 目标达成情况
- **目标**: 1秒内处理72个写入请求 (72 RPS)
- **实际表现**: 查看上表中的达标情况

### 🔍 关键发现
1. **最佳并发策略**: 观察不同并发数的表现
2. **系统瓶颈**: 识别性能限制因素
3. **图片处理影响**: 带图片请求的性能差异
4. **连接池使用**: 数据库连接池的表现

### 📈 优化建议
1. **连接池调优**: 如果RPS不足，考虑增加连接池大小
2. **异步处理**: 对于高并发场景，考虑异步处理图片
3. **批量插入**: 考虑实现批量插入API
4. **缓存策略**: 减少数据库查询压力

### ⚠️ 注意事项
- 高并发可能导致数据库连接耗尽
- 磁盘I/O可能成为瓶颈
- 内存使用需要监控
EOF

echo -e "\n${GREEN}🎉 高并发写入测试完成！${NC}"
echo -e "${BLUE}📋 详细报告: $REPORT_FILE${NC}"
echo -e "${BLUE}📁 测试结果: $RESULTS_DIR${NC}"

# 显示快速汇总
echo -e "\n${YELLOW}📊 快速汇总:${NC}"
cat "$REPORT_FILE" | grep -A 20 "| 测试场景"

echo -e "\n${GREEN}✅ 建议查看详细报告分析性能表现${NC}" 