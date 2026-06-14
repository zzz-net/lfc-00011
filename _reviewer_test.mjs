const BASE = "http://localhost:3001/api";

async function api(method, endpoint, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${endpoint}`, opts);
  return r.json();
}

async function go() {
  console.log("========== Reviewer自建验证 ==========\n");

  // --- 边界1: 创建计划，日期范围无任何数据 ---
  console.log("1. 边界测试：计划日期窗口内无数据");
  const p1 = await api("POST", "/plans", {
    name: "空窗口计划", scopeType: "all", planDate: "2020-01-01",
    responsiblePerson: "T1", executor: "E1", recurrenceType: "once", createdBy: "admin"
  });
  const start1 = await api("PUT", `/plans/${p1.data.id}/start`, { operator: "E1" });
  const sum1 = await api("GET", `/plans/${p1.data.id}/summary`);
  console.log("  importCount:", sum1.data.importCount, "(期望0)");
  console.log("  discrepancyBatchCount:", sum1.data.discrepancyBatchCount, "(期望0)");
  const boundary1Ok = sum1.data.importCount === 0 && sum1.data.discrepancyBatchCount === 0;
  console.log("  =>", boundary1Ok ? "PASS" : "FAIL");

  // --- 边界2: by_category 且类别完全不匹配 ---
  console.log("\n2. 边界测试：by_category不匹配(ZZZ)");
  const p2 = await api("POST", "/plans", {
    name: "ZZZ空类别计划", scopeType: "by_category", category: "ZZZ",
    planDate: "2026-06-14", warehouse: "warehouseZZZ",
    responsiblePerson: "T2", executor: "E2", recurrenceType: "once", createdBy: "admin"
  });
  const start2 = await api("PUT", `/plans/${p2.data.id}/start`, { operator: "E2" });
  const sum2 = await api("GET", `/plans/${p2.data.id}/summary`);
  console.log("  importCount:", sum2.data.importCount, "(期望>=1, 导入全量关联)");
  console.log("  discrepancyBatchCount:", sum2.data.discrepancyBatchCount, "(期望0, ZZZ无匹配)");
  console.log("  totalDiffLines:", sum2.data.totalDiffLines, "(期望0)");
  const boundary2Ok = sum2.data.importCount >= 1 && sum2.data.discrepancyBatchCount === 0 && sum2.data.totalDiffLines === 0;
  console.log("  =>", boundary2Ok ? "PASS" : "FAIL");

  // --- 边界3: 重复启动已in_progress的计划 ---
  console.log("\n3. 边界测试：重复启动已开始的计划");
  const startAgain = await api("PUT", `/plans/${p1.data.id}/start`, { operator: "E1" });
  console.log("  第二次启动:", startAgain.success ? "成功(FAIL)" : "被拒绝(PASS)");
  console.log("  =>", !startAgain.success ? "PASS" : "FAIL");

  // --- 边界4: 两个不同日期窗口的计划，各自summary是否正确 ---
  console.log("\n4. 边界测试：不同日期窗口计划summary隔离");
  const sumP2 = await api("GET", `/plans/${p2.data.id}/summary`);
  const sumP1again = await api("GET", `/plans/${p1.data.id}/summary`);
  console.log("  空窗口计划(P1) importCount:", sumP1again.data.importCount);
  console.log("  类别计划(P2) importCount:", sumP2.data.importCount);
  console.log("  =>", (sumP1again.data.importCount === 0 && sumP2.data.importCount >= 1) ? "PASS" : "FAIL");

  const allOk = boundary1Ok && boundary2Ok && !startAgain.success && (sumP1again.data.importCount === 0 && sumP2.data.importCount >= 1);
  console.log("\n==========");
  console.log(allOk ? "ALL PASS" : "SOME FAILED");
  if (!allOk) process.exit(1);
}

go().catch(e => { console.error(e); process.exit(1); });
