#!/bin/bash

# 性能监控脚本 - 持续监控72 RPS负载下的系统表现

BASE_URL="http://localhost:3000"
DURATION=${1:-60}  # 监控时长，默认60秒

echo "🔍 开始性能监控 - 持续${DURATION}秒"
echo "📊 模拟72 RPS负载..."

# 创建测试数据
cat > monitor_data.json << 'EOF'
{
  "client_ip": "192.168.1.200",
  "timestamp": "20250617000000999",
  "model_type": "monitor_model",
  "label": "pass",
  "confidence": 0.95,
  "frame_id": 999,
  "fis": 30,
  "fps": 25,
  "resolution": "1920x1080",
  "size_bytes": 1024000,
  "size_formatted": "1MB",
  "jpeg_quality": 85,
  "inference_time_ms": 15.5,
  "capture_time_ms": 2.3,
  "jpeg_encode_time_ms": 8.7,
  "pc_num": "PC999"
}
EOF

# 后台启动持续负载
echo "🚀 启动持续负载测试..."
(
  for ((i=1; i<=DURATION; i++)); do
    ab -n 72 -c 18 -p monitor_data.json -T "application/json" "$BASE_URL/api/quality-records" > /dev/null 2>&1 &
    sleep 1
  done
  wait
) &

LOAD_PID=$!

# 监控系统状态
echo "📈 开始监控系统指标..."
echo "时间,RPS,连接池总数,活跃连接,等待连接,CPU%,内存%" > performance_log.csv

for ((i=1; i<=DURATION; i++)); do
    # 获取当前时间
    timestamp=$(date '+%H:%M:%S')
    
    # 快速RPS测试
    rps_result=$(ab -n 10 -c 5 -p monitor_data.json -T "application/json" "$BASE_URL/api/quality-records" 2>/dev/null | grep "Requests per second" | awk '{print $4}')
    
    # 获取连接池状态
    pool_status=$(curl -s "$BASE_URL/api/quality-records/pool-status" 2>/dev/null)
    total_conn=$(echo "$pool_status" | jq -r '.data.connections.total // "N/A"')
    active_conn=$(echo "$pool_status" | jq -r '.data.connections.active // "N/A"')
    waiting_conn=$(echo "$pool_status" | jq -r '.data.connections.waiting // "N/A"')
    
    # 获取系统资源使用情况
    cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
    memory_usage=$(top -l 1 | grep "PhysMem" | awk '{print $2}' | sed 's/M//')
    
    # 输出到控制台
    printf "%s | RPS: %6s | 连接: %2s/%2s/%2s | CPU: %4s%% | 内存: %5sM\n" \
           "$timestamp" "$rps_result" "$active_conn" "$total_conn" "$waiting_conn" "$cpu_usage" "$memory_usage"
    
    # 记录到CSV
    echo "$timestamp,$rps_result,$total_conn,$active_conn,$waiting_conn,$cpu_usage,$memory_usage" >> performance_log.csv
    
    sleep 1
done

# 等待负载测试完成
wait $LOAD_PID

echo -e "\n✅ 监控完成!"
echo "📊 性能日志已保存到: performance_log.csv"

# 生成汇总报告
echo -e "\n📋 性能汇总:"
echo "平均RPS: $(awk -F, 'NR>1 && $2!="" {sum+=$2; count++} END {if(count>0) print sum/count; else print "N/A"}' performance_log.csv)"
echo "最大活跃连接: $(awk -F, 'NR>1 && $4!="" {if($4>max) max=$4} END {print max+0}' performance_log.csv)"
echo "平均CPU使用: $(awk -F, 'NR>1 && $6!="" {sum+=$6; count++} END {if(count>0) print sum/count"%"; else print "N/A"}' performance_log.csv)"

# 清理
rm -f monitor_data.json

echo -e "\n💡 建议: 如果系统指标稳定，说明可以持续支持72 RPS负载" 