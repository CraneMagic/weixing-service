#!/bin/bash

# 最终72 RPS综合测试
BASE_URL="http://localhost:3000"

echo "🎯 最终测试：确认系统能够持续稳定处理72 RPS"
echo "=============================================="

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试数据
cat > final_test_data.json << 'EOF'
{
  "client_ip": "192.168.1.250",
  "timestamp": "20250617000000250",
  "model_type": "final_test",
  "label": "pass",
  "confidence": 0.95,
  "frame_id": 250,
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": 1024000,
  "size_formatted": "1MB",
  "jpeg_quality": 85,
  "inference_time_ms": 15.5,
  "capture_time_ms": 2.3,
  "jpeg_encode_time_ms": 8.7,
  "pc_num": "PC250"
}
EOF

# 检查服务状态
echo -e "${YELLOW}🔍 检查服务状态...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ 服务未运行${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 服务正常${NC}"

# 测试1: 基准测试 - 72请求/18并发
echo -e "\n${BLUE}🔥 测试1: 基准测试 (72请求/18并发)${NC}"
result1=$(ab -n 72 -c 18 -p final_test_data.json -T "application/json" "$BASE_URL/api/quality-records" 2>/dev/null)
rps1=$(echo "$result1" | grep "Requests per second" | awk '{print $4}')
time1=$(echo "$result1" | grep "Time taken for tests" | awk '{print $5}')
failed1=$(echo "$result1" | grep "Failed requests" | awk '{print $3}')

echo "RPS: $rps1 | 用时: ${time1}s | 失败: $failed1"

# 测试2: 持续测试 - 连续5轮
echo -e "\n${BLUE}🔥 测试2: 持续稳定性测试 (5轮 × 72请求)${NC}"
total_rps=0
total_rounds=5

for ((i=1; i<=total_rounds; i++)); do
    echo -n "第${i}轮: "
    result=$(ab -n 72 -c 18 -p final_test_data.json -T "application/json" "$BASE_URL/api/quality-records" 2>/dev/null)
    rps=$(echo "$result" | grep "Requests per second" | awk '{print $4}')
    failed=$(echo "$result" | grep "Failed requests" | awk '{print $3}')
    
    echo "RPS: $rps | 失败: $failed"
    total_rps=$(echo "$total_rps + $rps" | bc)
    sleep 1
done

avg_rps=$(echo "scale=2; $total_rps / $total_rounds" | bc)
echo "平均RPS: $avg_rps"

# 测试3: 峰值测试 - 144请求模拟2秒内的峰值
echo -e "\n${BLUE}🔥 测试3: 峰值负载测试 (144请求/36并发)${NC}"
result3=$(ab -n 144 -c 36 -p final_test_data.json -T "application/json" "$BASE_URL/api/quality-records" 2>/dev/null)
rps3=$(echo "$result3" | grep "Requests per second" | awk '{print $4}')
time3=$(echo "$result3" | grep "Time taken for tests" | awk '{print $5}')
failed3=$(echo "$result3" | grep "Failed requests" | awk '{print $3}')

echo "RPS: $rps3 | 用时: ${time3}s | 失败: $failed3"

# 系统状态检查
echo -e "\n${YELLOW}📊 系统状态检查${NC}"
pool_status=$(curl -s "$BASE_URL/api/quality-records/pool-status" 2>/dev/null)
total_conn=$(echo "$pool_status" | jq -r '.data.connections.total')
active_conn=$(echo "$pool_status" | jq -r '.data.connections.active')
idle_conn=$(echo "$pool_status" | jq -r '.data.connections.idle')

echo "连接池: 总计${total_conn} | 活跃${active_conn} | 空闲${idle_conn}"

# 生成最终报告
echo -e "\n${YELLOW}📋 最终测试报告${NC}"
echo "=============================================="

# 判断是否达标
check_target() {
    local rps=$1
    local rps_int=${rps%.*}
    if [ "$rps_int" -ge 72 ]; then
        echo -e "${GREEN}✅ 达标${NC}"
        return 0
    else
        echo -e "${RED}❌ 未达标${NC}"
        return 1
    fi
}

echo "测试项目                | RPS      | 目标 | 状态"
echo "------------------------|----------|------|--------"
printf "基准测试 (72req/18c)    | %-8s | 72   | " "$rps1"
check_target "$rps1"

printf "持续测试 (平均)         | %-8s | 72   | " "$avg_rps"
check_target "$avg_rps"

printf "峰值测试 (144req/36c)   | %-8s | 72   | " "$rps3"
check_target "$rps3"

echo ""

# 最终结论
rps1_int=${rps1%.*}
avg_rps_int=${avg_rps%.*}
rps3_int=${rps3%.*}

if [ "$rps1_int" -ge 72 ] && [ "${avg_rps_int%.*}" -ge 72 ] && [ "$rps3_int" -ge 72 ]; then
    echo -e "${GREEN}🎉 最终结论: 系统完全能够满足1秒内72个并发写入的需求！${NC}"
    echo -e "${GREEN}✅ 所有测试均通过，系统性能稳定可靠${NC}"
    
    # 计算安全裕量
    min_rps=$(echo "$rps1 $avg_rps $rps3" | tr ' ' '\n' | sort -n | head -1)
    min_rps_int=${min_rps%.*}
    margin=$(echo "scale=1; $min_rps_int / 72" | bc)
    echo -e "${BLUE}📈 最低性能: ${min_rps} RPS (${margin}x 安全裕量)${NC}"
else
    echo -e "${RED}❌ 最终结论: 系统未能稳定达到72 RPS目标${NC}"
    echo -e "${RED}⚠️  需要进一步优化或调整配置${NC}"
fi

echo ""
echo -e "${YELLOW}💡 生产环境建议:${NC}"
echo "- 推荐并发数: 18-36"
echo "- 监控RPS: 应保持 >100 以确保安全裕量"
echo "- 连接池: 当前20个连接足够"
echo "- 定期监控: 使用 scripts/monitor-performance.sh"

# 清理
rm -f final_test_data.json

echo -e "\n${GREEN}🏁 测试完成！${NC}" 