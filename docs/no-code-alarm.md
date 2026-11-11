# 无喷码报警（按帧数）

所有在线相机各自连续无喷码达到阈值才报警，默认每路300张。
任一路检出喷码只清零本路；没有在线相机不报警。
在线指最近5秒内收到带有效布尔 has_code 的图片，NO_CODE_STALE_MS 可调整。
tcp-server在收帧处计数，每秒上报；WebSocket预览丢帧不影响计数。

## 操作
- /quality：“无喷码报警”开关位于质量跳过旁，只控制无喷码报警。
- /settings：设置“连续无喷码张数（每相机）”，必须为正整数。
- 表面缺陷和无喷码共用一个质量报警弹窗，分别确认；处理缺陷并前往审核时，会先等待剩余无喷码报警处理完。
- 确认报警后所有在线相机重新累计；活动报警不重复执行灯控。
- 关闭报警、修改阈值、进入/退出质量跳过均重新累计。
- 配置保存为参数 noCodeAlarm；无保存值时开关沿用 NO_CODE_ALARM_ENABLED，张数默认300。
- 计数不跨重启保存。服务端重启、TCP重连、收帧超时会使旧计数失效。
- 清除无喷码原因不清除 defect；硬件动作失败由监视器重试。
- 弹窗保存报警当时各路计数，相机随后离线也能查看触发情况。

## 接口
- GET /api/no-code/status：enabled、frameThreshold、active、bypassed、resetToken、cameras、alarmCameras、lastAlarmAt。
- POST /api/no-code/config：局部更新 enabled 或 frameThreshold，保存后即时生效。
- POST /api/no-code/clear：确认无喷码报警，重置全部计数。
- POST /api/no-code/report：clientIp、hasCode、consecutiveNoCodeFrames、frameAgeMs、sessionId、sequence、resetToken。
  每次响应包含当前 resetToken；tcp-server发现变化后重新计数。
  重复/倒序上报不增加计数，旧token的计数不参与报警，但相机仍占在线位置。

## 更新与验证
需一起更新 weixing-service、全部三个 tcp-server 实例和 weixing-frontend。
旧版只含最新 hasCode 的上报不支持张数判定，会被新接口拒绝。
tcp-server现在持续上报，现场开关不再受 tcp-server 的 NO_CODE_ALARM_ENABLED 环境变量限制。
各实例 NO_CODE_STALE_MS 应保持一致。

service：npm test -- --runInBand；npm run build。
tcp-server：npx ts-node scripts/test-no-code-counter.ts；npm run build。
frontend：npx tsc --noEmit；npm run lint；npm run build。
本地自动化使用替代灯控，不操作真实继电器，现场仍需联调真实灯和相机。

## 清除报警与灯控恢复

缺陷记录清除、报警原因清除、恢复灯控指令发送是不同步骤。页面同时查询
`GET /api/alarm/status`，即使缺陷记录已经转审核，只要服务端仍保留报警原因，
弹窗仍显示对应清除按钮。清除请求失败时保留错误提示和重试入口。

所有原因清空后，恢复指令失败会保留 `normalSyncPending=true` 和
`normalSyncError`；后台每2秒重试，只发送恢复命令，不重复触发剔除脉冲。
新的报警会取消旧恢复重试；初始化、报警、清除和恢复由同一目标同步器协调。
同步器仅保留最新目标，连续报警不重复发送红灯和继电器2状态；每条命令前检查目标，
已开始的串口操作最多等待操作超时，尚未开始的旧命令跳过，不积压历史红绿转换。
失败的红灯或绿灯目标均每2秒重试，状态接口提供 syncPending/syncError。
继电器4逐件调用独立保留原有脉冲锁规则，不被静态去重影响，也不随状态重试重放。
手动全灭也通过同步器协调，下次报警或清除会重新选择红绿目标。

`normalSyncPending=false` 只表示恢复指令已成功发送，不表示收到物理灯反馈。
若状态中 `reasons=[]`、`normalSyncPending=false`，现场仍红灯，应核对串口、接线和灯控硬件。
本地回归覆盖串口返回失败、恢复重试、新报警中止旧重试及弹窗保留，不替代现场硬件联调。

## 驱动无回调与重复报警回归（2026-11-11）

上一版报警串行队列依赖底层驱动返回；驱动打开/写入没有回调时，后续清除会永久排队。
串口打开、写入、关闭现默认每项最多等待3秒，可用 `SERIAL_OPERATION_TIMEOUT_MS` 调整。
超时/断开后隔离旧连接；重连前先回收旧 native binding。关闭失败时保留旧句柄，
后续可继续回收，不能仅销毁 Node stream 后丢弃仍持有设备锁的连接。
迟到的打开回调会关闭旧连接；迟到写入回调不会继续旧报警指令序列。
这些保护不等于驱动底层操作一定已取消，硬件持续故障时仍会报错，不能保证物理灯恢复。

页面清除流程中的每个请求（含响应体）默认20秒超时；超时显示当前失败步骤，恢复重试入口。
图片记录为空但服务端 defect 仍存在时，仍可清除服务端原因，标题不再显示误导性的“0张报警”。
回归包括连续两轮真实HTTP报警操作、驱动不回调、迟到回调、实际SerialPortStream独占锁回收，
以及本地浏览器中请求挂起→超时提示→再次清除成功。尚无现场日志证明驱动失联就是现场根因。
新增验证：`npx ts-node scripts/test-serial-timeout.ts`、`npx ts-node scripts/test-serial-binding.ts`；
前端 `node scripts/test-alarm-request.cjs`。

## 表面缺陷图片报警过期（2026-11-11）

仅表面缺陷图片记录使用新状态 `EXPIRED`（过期待审核）。服务端每30秒检查一次，
`label=fail AND status IS NULL` 且接收时间达到2小时的记录转为EXPIRED，保留图片、原label和审核字段。
实时页原有 `status=null` 查询自动排除EXPIRED；审核页“过期待审核”标签可查询并正常审核。
手动清除转INREVIEW、已解决、已忽略的记录不受自动过期影响。

`alarm_received_at` 由数据库默认记录服务端接收时间，重复上报不刷新，重启后继续原计时。
升级时旧未处理缺陷采用有效且不晚于当前时间的capture_time补齐；缺失或异常时间从升级时开始计时。
无喷码报警保持独立，不自动过期。

当没有未处理缺陷记录且表面缺陷原因最后触发也已达到2小时，任务会清除对应原因。
扫描期间的新报警有版本保护，不会误清；仍有无喷码原因时保持红灯。
最后一个原因清除后发送恢复指令，发送失败仍按现有机制重试，不能把物理灯反馈视为已确认。

新增回归：`npx ts-node scripts/test-alarm-expiry.ts`；
`TEST_DATABASE_URL=<隔离测试数据库> npx ts-node scripts/test-alarm-expiry-postgres.ts`。
前端：`node scripts/test-expired-status.cjs`。

## 灯控异常边界修复（2026-11-12）

无喷码首次触发失败后，评估器仅重试当前静态目标，不重新触发报警或继电器4脉冲。
ALARM/RELAY 串口打开、关闭、错误均使已发送状态缓存失效，后台重新同步最新目标；
同步中连接发生变化时，不把旧连接上的成功发送当作当前连接已同步。
同步结束的失败窗口中到达的新目标，不再继承旧目标的失败；当前目标自身发送失败仍会正常返回错误。
