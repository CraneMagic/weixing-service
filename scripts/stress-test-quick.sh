#!/bin/bash

# 快速压力测试脚本 - 重点测试修复后的端点
BASE_URL="http://localhost:3000"

echo "🚀 快速压力测试 - 验证修复效果"

# 测试健康检查端点
echo -e "\n🔥 测试健康检查端点..."
ab -n 100 -c 10 "$BASE_URL/health" | grep -E "(Requests per second|Time per request|Failed requests)"

# 测试连接池状态端点  
echo -e "\n🔥 测试连接池状态端点..."
ab -n 100 -c 10 "$BASE_URL/api/quality-records/pool-status" | grep -E "(Requests per second|Time per request|Failed requests)"

# 测试数据查询端点
echo -e "\n🔥 测试数据查询端点..."
ab -n 500 -c 10 "$BASE_URL/api/quality-records?limit=20&page=1" | grep -E "(Requests per second|Time per request|Failed requests)"

echo -e "\n✅ 快速测试完成！" 