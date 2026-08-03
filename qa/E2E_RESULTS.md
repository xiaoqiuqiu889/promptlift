# Prompt Lift Windows 真实端到端验收

## 结论

**FAIL**

- 真实模型：`deepseek-v4-flash`
- Endpoint：`https://tokenhub.tencentmaas.com/v1`
- API Key 已保存：`false`（报告不包含 Key）
- 真实模型返回次数：`0`
- 至少一次真实返回：`否`
- 监听进程存活：`是`
- Electron userData 路径：`wrapper 直接核验 app.getPath('userData')`
- Computer Use：`未中断`

## 入口结果

| 入口 | 真实返回字符数 | 成功回填 | 成功恢复 | 结果 |
| --- | ---: | --- | --- | --- |
| 左键头像 | 0 | 否 | 否 | FAIL |
| 双击 Alt | 0 | 否 | 否 | FAIL |

## 左键头像阶段（相对时间）

| 阶段 | 时间 |
| --- | ---: |
| event | 未记录 |
| loading | 未记录 |
| capture | 未记录 |
| model | 未记录 |
| apply | 未记录 |
| restore | 未记录 |

## 双击 Alt 阶段（相对时间）

| 阶段 | 时间 |
| --- | ---: |
| event | 未记录 |
| loading | 未记录 |
| capture | 未记录 |
| model | 未记录 |
| apply | 未记录 |
| restore | 未记录 |

## 关键安全检查

- 原文锚点：数字、日期、路径、链接、否定约束分别记录在 `summary.json`，缺失即不通过。
- 模型结果：禁止 `AAAAA` 与替换乱码；结果未通过校验时不得回填。
- 空输入保护：`PASS`。
- 等待取消保护：`PASS`（可控 mock 延迟）。
- 目标内容变化保护：`PASS`（注入 bridge mock）。
- API Key：未写入 stdout、stderr、报告或截图；证据只保留布尔状态。

## Alt 误触保护

- 单次 Alt 不触发：`FAIL`
- Alt+Tab 不触发：`FAIL`
- 右 Alt/AltGr 不触发：`FAIL`

## 未执行项及原因

- avatar.event: 未观察到或未执行
- avatar.loading: 未观察到或未执行
- avatar.capture: 未观察到或未执行
- avatar.model: 未观察到或未执行
- avatar.apply: 未观察到或未执行
- avatar.restore: 未观察到或未执行
- avatar.copy: 未通过 QA host 的真实 Ctrl+V 验证
- double-alt.event: 未观察到或未执行
- double-alt.loading: 未观察到或未执行
- double-alt.capture: 未观察到或未执行
- double-alt.model: 未观察到或未执行
- double-alt.apply: 未观察到或未执行
- double-alt.restore: 未观察到或未执行
- double-alt.guard.singleAltNoTrigger: 未通过 Computer Use 实际按键验证
- double-alt.guard.altTabNoTrigger: 未通过 Computer Use 实际按键验证
- double-alt.guard.rightAltNoTrigger: 未通过 Computer Use 实际按键验证

## 证据

- [summary.json](./evidence/e2e/summary.json)
- [steps.log](./evidence/e2e/steps.log)
- 运行元数据：[run.json](./evidence/e2e/run.json)

所有临时 userData 位于系统 Temp 的精确前缀目录，收尾后删除；用户现有 packaged Prompt Lift 未关闭。
