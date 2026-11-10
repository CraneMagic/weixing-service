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
新的报警会取消旧恢复重试；初始化、报警、清除和恢复使用同一队列，避免红绿灯命令交错。

`normalSyncPending=false` 只表示恢复指令已成功发送，不表示收到物理灯反馈。
若状态中 `reasons=[]`、`normalSyncPending=false`，现场仍红灯，应核对串口、接线和灯控硬件。
本地回归覆盖串口返回失败、恢复重试、新报警中止旧重试及弹窗保留，不替代现场硬件联调。
