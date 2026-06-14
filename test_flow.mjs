import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'http://localhost:3001/api'

function log(title, data) {
  console.log(`\n=== ${title} ===`)
  if (data !== undefined) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  }
}

async function apiJson(method, endpoint, body) {
  const url = `${BASE_URL}${endpoint}`
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  const data = await res.json()
  if (!data.success) {
    throw new Error(`API Error: ${data.error || 'Unknown error'}`)
  }
  return data.data
}

async function uploadFile(endpoint, filePath, importedBy) {
  const boundary = '----TestBoundary' + Date.now()
  const fileContent = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="importedBy"\r\n` +
    `\r\n` +
    `${importedBy}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: text/csv\r\n` +
    `\r\n`
  )

  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`)

  const body = Buffer.concat([preamble, fileContent, epilogue])

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  const data = await res.json()
  return data
}

async function main() {
  console.log('========== 库存盘点系统 - 完整流程验证 ==========\n')

  try {
    // ==========================================
    // 阶段0: 仪表盘初始状态 + CSV脏数据校验测试
    // ==========================================

    log('0. 仪表盘统计 + CSV脏数据校验')

    log('  0.1 获取空数据库的仪表盘统计')
    const emptyStats = await apiJson('GET', '/discrepancies/dashboard/stats')
    console.log(`    空仪表盘返回成功: ${!!emptyStats ? '✓' : '✗'}`)
    console.log(`    包含差异分布字段: ${'diffAmountDistribution' in emptyStats ? '✓' : '✗'}`)
    console.log(`    包含处置占比字段: ${'dispositionStatusDistribution' in emptyStats ? '✓' : '✗'}`)
    console.log(`    包含审批通过率字段: ${'recentApprovalRate' in emptyStats ? '✓' : '✗'}`)
    console.log(`    包含库存统计字段: ${'inventoryStats' in emptyStats ? '✓' : '✗'}`)

    log('  0.2 测试账面导入 - 非法数量报错')
    const bookInvalidQty = await uploadFile(
      '/inventory/book',
      path.join(__dirname, 'samples', 'book_invalid_qty.csv'),
      '测试员A'
    )
    const bookInvalidCorrect = !bookInvalidQty.success &&
      bookInvalidQty.error &&
      bookInvalidQty.error.includes('数量字段存在非法值') &&
      bookInvalidQty.error.includes('第3行') &&
      bookInvalidQty.error.includes('第5行')
    console.log(`    非法数量被拦截并报行号: ${bookInvalidCorrect ? '✓' : '✗'}`)
    if (!bookInvalidCorrect) console.log('    错误信息:', bookInvalidQty.error)

    log('  0.3 测试账面导入 - 空SKU跳过计数')
    const bookEmptySku = await uploadFile(
      '/inventory/book',
      path.join(__dirname, 'samples', 'book_empty_sku.csv'),
      '测试员A'
    )
    const bookEmptyCorrect = bookEmptySku.success &&
      bookEmptySku.data.count === 3 &&
      bookEmptySku.data.skippedEmptySkuCount === 2
    console.log(`    空SKU正确跳过(3有效/2跳过): ${bookEmptyCorrect ? '✓' : '✗'}`)
    console.log(`    实际导入数=${bookEmptySku.data?.count}, 跳过数=${bookEmptySku.data?.skippedEmptySkuCount}`)

    log('  0.4 测试实盘导入 - 非法数量报错')
    const physicalInvalidQty = await uploadFile(
      '/inventory/physical',
      path.join(__dirname, 'samples', 'physical_invalid_qty.csv'),
      '盘点员B'
    )
    // 注意：第2行是负数（在importPhysicalInventory校验），第4行是"xyz"（路由校验）
    const physicalInvalidCorrect = !physicalInvalidQty.success
    console.log(`    实盘非法数量/负数被拦截: ${physicalInvalidCorrect ? '✓' : '✗'}`)
    if (!physicalInvalidCorrect) console.log('    响应:', JSON.stringify(physicalInvalidQty))

    // 1. 导入账面库存（正式测试用的正常数据）
    log('1. 导入账面库存（正式数据）')
    const bookResult = await uploadFile(
      '/inventory/book',
      path.join(__dirname, 'samples', 'book_inventory.csv'),
      '测试员A'
    )
    if (!bookResult.success) throw new Error(bookResult.error)
    console.log(`  ✓ 成功: batchNo=${bookResult.data.batchNo}, count=${bookResult.data.count}`)

    // 2. 获取当前库存（批准前的基线）
    log('2. 获取当前库存（初始状态）')
    const initialInventory = await apiJson('GET', '/inventory/current')
    console.log(`  ✓ 共 ${initialInventory.length} 个 SKU`)
    const sku002Initial = initialInventory.find(i => i.sku === 'SKU002')
    const sku005Initial = initialInventory.find(i => i.sku === 'SKU005')
    const sku004Initial = initialInventory.find(i => i.sku === 'SKU004')
    const sku006Initial = initialInventory.find(i => i.sku === 'SKU006')
    console.log(`  SKU002 初始数量: ${sku002Initial?.quantity}`)
    console.log(`  SKU005 初始数量: ${sku005Initial?.quantity}`)
    console.log(`  SKU004 初始数量: ${sku004Initial?.quantity}`)
    console.log(`  SKU006 初始数量: ${sku006Initial?.quantity}`)

    // 3. 导入实物盘点（正常）
    log('3. 导入实物盘点')
    const physicalResult = await uploadFile(
      '/inventory/physical',
      path.join(__dirname, 'samples', 'physical_inventory.csv'),
      '盘点员B'
    )
    if (!physicalResult.success) throw new Error(physicalResult.error)
    console.log(`  ✓ 成功: batchNo=${physicalResult.data.batchNo}, count=${physicalResult.data.count}`)

    // 4. 测试负数实盘报错
    log('4. 测试负数实盘报错')
    const negativeResult = await uploadFile(
      '/inventory/physical',
      path.join(__dirname, 'samples', 'physical_inventory_negative.csv'),
      '盘点员B'
    )
    if (negativeResult.success) {
      console.log('  ✗ 应该报错但没有报错')
    } else {
      console.log(`  ✓ 正确报错: ${negativeResult.error}`)
    }

    // 5. 计算差异
    log('5. 计算差异')
    const diff = await apiJson('POST', '/discrepancies/calculate', { createdBy: '主管C' })
    console.log(`  ✓ 批次号: ${diff.batch_no}`)
    console.log(`  ✓ 状态: ${diff.status}`)
    console.log(`  ✓ 差异行数: ${diff.lines?.length || 0}`)

    const batchId = diff.id

    // 检查差异类型
    const diffLines = diff.lines || []
    const surplusCount = diffLines.filter(l => l.diff_type === 'surplus').length
    const shortageCount = diffLines.filter(l => l.diff_type === 'shortage').length
    const missedCount = diffLines.filter(l => l.diff_type === 'missed').length
    console.log(`  盘盈: ${surplusCount}, 盘亏: ${shortageCount}, 漏盘: ${missedCount}`)

    for (const line of diffLines) {
      console.log(`  - ${line.sku}: 账面${line.book_qty}, 实盘${line.physical_qty}, 差异${line.diff_qty} (${line.diff_type})`)
    }

    // 6. 复核通过
    log('6. 复核通过')
    const reviewed = await apiJson('PUT', `/discrepancies/${batchId}/review`, {
      reviewedBy: '审核员D',
      pass: true,
    })
    console.log(`  ✓ 状态: ${reviewed.status}`)
    console.log(`  ✓ 复核人: ${reviewed.reviewed_by}`)

    // 7. 批准调整
    log('7. 批准调整')
    const approved = await apiJson('PUT', `/discrepancies/${batchId}/approve`, {
      approvedBy: '经理E',
    })
    console.log(`  ✓ 状态: ${approved.status}`)
    console.log(`  ✓ 批准人: ${approved.approved_by}`)

    // 8. 检查调整流水
    log('8. 检查原调整流水')
    const adjustments = await apiJson('GET', `/discrepancies/${batchId}/adjustments`)
    console.log(`  ✓ 调整流水数量: ${adjustments.length}`)
    const originalAdjs = adjustments.filter(a => a.adjustment_type === 'original')
    const compAdjs = adjustments.filter(a => a.adjustment_type === 'compensation')
    console.log(`  原调整: ${originalAdjs.length} 条, 补偿: ${compAdjs.length} 条`)

    for (const adj of originalAdjs) {
      console.log(`  - ${adj.sku}: ${adj.direction} ${adj.quantity} (${adj.adjustment_type}) by ${adj.operator}`)
    }

    // 9. 检查批准后的库存
    log('9. 检查批准后的库存')
    const afterApproveInv = await apiJson('GET', '/inventory/current')
    const sku002AfterApprove = afterApproveInv.find(i => i.sku === 'SKU002')
    const sku005AfterApprove = afterApproveInv.find(i => i.sku === 'SKU005')
    const sku004AfterApprove = afterApproveInv.find(i => i.sku === 'SKU004')
    const sku006AfterApprove = afterApproveInv.find(i => i.sku === 'SKU006')

    const expectedSku002 = sku002Initial.quantity - 30
    const expectedSku005 = sku005Initial.quantity + 10
    const expectedSku004 = sku004Initial.quantity - 200 // 漏盘，按0算，差异为-200
    const expectedSku006 = sku006Initial.quantity - 100 // 漏盘，按0算，差异为-100

    console.log(`  SKU002 批准后: ${sku002AfterApprove?.quantity} (预期: ${expectedSku002})`)
    console.log(`  SKU005 批准后: ${sku005AfterApprove?.quantity} (预期: ${expectedSku005})`)
    console.log(`  SKU004 批准后: ${sku004AfterApprove?.quantity} (预期: ${expectedSku004})`)
    console.log(`  SKU006 批准后: ${sku006AfterApprove?.quantity} (预期: ${expectedSku006})`)

    const sku002Correct = sku002AfterApprove.quantity === expectedSku002
    const sku005Correct = sku005AfterApprove.quantity === expectedSku005
    const sku004Correct = sku004AfterApprove.quantity === expectedSku004
    const sku006Correct = sku006AfterApprove.quantity === expectedSku006
    console.log(`  SKU002 库存正确: ${sku002Correct ? '✓' : '✗'}`)
    console.log(`  SKU005 库存正确: ${sku005Correct ? '✓' : '✗'}`)
    console.log(`  SKU004 库存正确: ${sku004Correct ? '✓' : '✗'}`)
    console.log(`  SKU006 库存正确: ${sku006Correct ? '✓' : '✗'}`)

    // 10. 差异处置模块测试
    log('10. 差异处置模块测试')

    log('  10.1 设置用户角色')
    const handlerUser = 'test_handler'
    const approverUser = 'test_approver'

    const setHandlerRole = await apiJson('POST', '/auth/role', { username: handlerUser, role: 'handler' })
    console.log(`    设置处置人角色: ${setHandlerRole?.role === 'handler' ? '✓' : '✗'}`)

    const setApproverRole = await apiJson('POST', '/auth/role', { username: approverUser, role: 'approver' })
    console.log(`    设置审批人角色: ${setApproverRole?.role === 'approver' ? '✓' : '✗'}`)

    const getHandlerRole = await apiJson('GET', `/auth/role?username=${handlerUser}`)
    console.log(`    查询处置人角色: ${getHandlerRole?.role === 'handler' ? '✓' : '✗'}`)

    log('  10.2 处置权限校验')
    const approverPerm = await apiJson('POST', '/dispositions/check-permission', { operator: approverUser, batchId })
    console.log(`    审批人无处置权限: ${!approverPerm?.allowed ? '✓' : '✗'}`)

    const handlerPerm = await apiJson('POST', '/dispositions/check-permission', { operator: handlerUser, batchId })
    console.log(`    处置人有处置权限: ${handlerPerm?.allowed ? '✓' : '✗'}`)

    log('  10.3 单条差异行处置')
    const firstLineId = diffLines[0].id
    const setDispResult = await apiJson('PUT', `/dispositions/${firstLineId}`, {
      batchId,
      status: 'adjusted',
      remark: '已调账处理测试',
      handler: handlerUser,
      operator: handlerUser,
    })
    console.log(`    第一条差异行处置成功: ${setDispResult?.status === 'adjusted' ? '✓' : '✗'}`)
    console.log(`    处置备注正确: ${setDispResult?.remark === '已调账处理测试' ? '✓' : '✗'}`)
    console.log(`    经办人正确: ${setDispResult?.handler === handlerUser ? '✓' : '✗'}`)

    log('  10.4 处置历史追溯')
    const historyResult = await apiJson('GET', `/dispositions/${firstLineId}/history`)
    console.log(`    历史记录数量 >= 1: ${historyResult.length >= 1 ? '✓' : '✗'}`)
    if (historyResult.length > 0) {
      const lastHist = historyResult[historyResult.length - 1]
      console.log(`    历史操作人正确: ${lastHist.operator === handlerUser ? '✓' : '✗'}`)
      console.log(`    历史状态变更正确: ${lastHist.to_status === 'adjusted' ? '✓' : '✗'}`)
    }

    log('  10.5 批量处置')
    const remainingLineIds = diffLines.slice(1, 3).map(l => l.id)
    // 先记录处置前的状态用于回滚验证
    const dispBeforeBatch = await Promise.all(
      remainingLineIds.map(lid => fetch(`${BASE_URL}/dispositions/${lid}/history`).then(r => r.json()).then(j => j.data || []))
    )
    const batchDispResult = await apiJson('PUT', '/dispositions/batch/action', {
      lineIds: remainingLineIds,
      batchId,
      status: 'accepted_loss',
      remark: '批量认亏处理',
      handler: handlerUser,
      operator: handlerUser,
    })
    console.log(`    批量处置成功: ${Array.isArray(batchDispResult) && batchDispResult.length === 2 ? '✓' : '✗'}`)

    log('  10.5.1 批量处置中途失败回滚测试')
    // 构造一个包含不存在lineId的批量请求（其中夹杂一个有效ID）
    const fakeLineId = 9999999
    const lineToTest = diffLines[3].id
    // 先记录测试行处置前的状态
    const dispBeforeFail = await apiJson('GET', `/dispositions/${lineToTest}/history`)
    const beforeFailCount = dispBeforeFail.length
    const mixedLineIds = [lineToTest, fakeLineId]
    const batchFailRes = await fetch(`${BASE_URL}/dispositions/batch/action`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineIds: mixedLineIds,
        batchId,
        status: 'adjusted',
        remark: '这个请求应该完全回滚',
        handler: handlerUser,
        operator: handlerUser,
      }),
    })
    const batchFailBody = await batchFailRes.json()
    const batchRollbackCorrect = !batchFailBody.success && batchFailBody.error && batchFailBody.error.includes('不存在')
    console.log(`    批量处置包含无效ID时报错: ${batchRollbackCorrect ? '✓' : '✗'}`)
    // 验证有效ID没有被部分修改（回滚生效）
    const dispAfterFail = await apiJson('GET', `/dispositions/${lineToTest}/history`)
    const historyUnchanged = dispAfterFail.length === beforeFailCount
    console.log(`    有效ID处置历史未被污染(回滚正确): ${historyUnchanged ? '✓' : '✗'}`)
    if (!historyUnchanged) {
      console.log(`    处置前历史: ${beforeFailCount}条, 处置后: ${dispAfterFail.length}条`)
    }

    log('  10.5.2 批量操作审计日志记录')
    const auditBatch = await apiJson('GET', '/audit?pageSize=100')
    const batchDispAuditLogs = auditBatch.data.filter(
      l => l.action === 'batch_set_disposition' && l.entity_type === 'discrepancy_batch' && l.entity_id === batchId
    )
    const batchDispAuditOk = batchDispAuditLogs.length >= 1
    console.log(`    批量处置汇总审计日志存在: ${batchDispAuditOk ? '✓' : '✗'}`)

    log('  10.6 按状态筛选差异')
    const adjustedDisps = await apiJson('GET', `/dispositions?batchId=${batchId}&status=adjusted`)
    console.log(`    按已调账筛选(1条): ${adjustedDisps?.total === 1 ? '✓' : '✗'}`)

    const acceptedDisps = await apiJson('GET', `/dispositions?batchId=${batchId}&status=accepted_loss`)
    console.log(`    按已认亏筛选(2条): ${acceptedDisps?.total === 2 ? '✓' : '✗'}`)

    log('  10.7 按SKU筛选差异')
    const skuFilter = await apiJson('GET', `/dispositions?batchId=${batchId}&sku=SKU`)
    console.log(`    按SKU筛选(含SKU): ${skuFilter?.total >= 1 ? '✓' : '✗'}`)

    log('  10.8 审计日志记录处置操作')
    const auditAll = await apiJson('GET', '/audit?pageSize=100')
    const dispAuditLogs = auditAll.data.filter(l => l.action === 'set_disposition' && l.entity_type === 'discrepancy_line')
    console.log(`    处置审计日志条数 >= 3: ${dispAuditLogs.length >= 3 ? '✓' : '✗'}`)

    log('  10.9 差异详情包含处置数据')
    const detailWithDisp = await apiJson('GET', `/discrepancies/${batchId}`)
    const linesWithDisp = detailWithDisp.lines.filter(l => l.disposition && l.disposition.status !== 'pending')
    console.log(`    详情页包含处置数据: ${linesWithDisp.length >= 3 ? '✓' : '✗'}`)

    log('  10.10 审批人尝试处置被拒绝')
    const approverSetDisp = await fetch(`${BASE_URL}/dispositions/${diffLines[3].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId,
        status: 'adjusted',
        remark: '审批人越权尝试',
        handler: approverUser,
        operator: approverUser,
      }),
    })
    const approverSetDispBody = await approverSetDisp.json()
    console.log(`    审批人处置被拒绝: ${!approverSetDispBody.success ? '✓' : '✗'}`)

    log('  10.11 handler=审批人绕过校验被拒绝')
    const handlerBypassRes = await fetch(`${BASE_URL}/dispositions/${diffLines[3].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId,
        status: 'adjusted',
        remark: 'handler填审批人绕过尝试',
        handler: approved.approved_by,
        operator: handlerUser,
      }),
    })
    const handlerBypassBody = await handlerBypassRes.json()
    console.log(`    handler=审批人被拒绝(403): ${!handlerBypassBody.success && handlerBypassRes.status === 403 ? '✓' : '✗'}`)

    // 保存处置历史数量供重启后验证
    const dispHistoryBefore = await apiJson('GET', `/dispositions/batch/${batchId}/history`)
    const dispHistoryCount = dispHistoryBefore.length

    // ==========================================
    // 新功能验证: 仪表盘数据与实际对账
    // ==========================================
    log('15. 仪表盘数据与实际对账验证')

    const finalStats = await apiJson('GET', '/discrepancies/dashboard/stats')

    // 15.1 盘盈盘亏数量分布对账
    log('  15.1 盘盈盘亏数量分布对账')
    const distSurplus = finalStats.diffAmountDistribution.surplus
    const distShortage = finalStats.diffAmountDistribution.shortage
    const distMissed = finalStats.diffAmountDistribution.missed
    const surplusMatches = distSurplus.count === surplusCount && distSurplus.totalAbsQty === 10
    const shortageMatches = distShortage.count === shortageCount && distShortage.totalAbsQty === 30
    const missedMatches = distMissed.count === missedCount && distMissed.totalAbsQty === 300
    console.log(`    盘盈统计正确(${surplusCount}条/10个): ${surplusMatches ? '✓' : '✗'}`)
    console.log(`    盘亏统计正确(${shortageCount}条/30个): ${shortageMatches ? '✓' : '✗'}`)
    console.log(`    漏盘统计正确(${missedCount}条/300个): ${missedMatches ? '✓' : '✗'}`)
    if (!surplusMatches) console.log(`      实际盘盈:`, distSurplus)
    if (!shortageMatches) console.log(`      实际盘亏:`, distShortage)
    if (!missedMatches) console.log(`      实际漏盘:`, distMissed)

    // 15.2 各处置状态占比对账
    log('  15.2 各处置状态占比对账')
    const dispDist = finalStats.dispositionStatusDistribution
    const adjustedItem = dispDist.find(d => d.status === 'adjusted')
    const acceptedLossItem = dispDist.find(d => d.status === 'accepted_loss')
    const pendingItem = dispDist.find(d => d.status === 'pending')
    const totalDispCount = (adjustedItem?.count || 0) + (acceptedLossItem?.count || 0) + (pendingItem?.count || 0)
    const dispMatches = (adjustedItem?.count === 1) && (acceptedLossItem?.count === 2) && (pendingItem?.count === 1) && totalDispCount === 4
    console.log(`    已调账(1条): ${adjustedItem?.count === 1 ? '✓' : '✗'}`)
    console.log(`    已认亏(2条): ${acceptedLossItem?.count === 2 ? '✓' : '✗'}`)
    console.log(`    待处理(1条): ${pendingItem?.count === 1 ? '✓' : '✗'}`)
    console.log(`    处置占比完整(共4条): ${dispMatches ? '✓' : '✗'}`)
    if (!dispMatches) console.log('      实际数据:', dispDist)

    // 15.3 最近批次审批通过率对账
    log('  15.3 最近批次审批通过率对账')
    const approval = finalStats.recentApprovalRate
    console.log(`    最近批次数=1: ${approval.totalBatches === 1 ? '✓' : '✗'}`)
    console.log(`    已复核数=1: ${approval.reviewedBatches === 1 ? '✓' : '✗'}`)
    console.log(`    已批准数=1: ${approval.approvedBatches === 1 ? '✓' : '✗'}`)

    // 15.4 总体统计
    log('  15.4 总体统计')
    const totalBatchesOk = finalStats.totalBatches === 1
    const totalLinesOk = finalStats.totalLines === 4
    const skuCountOk = finalStats.inventoryStats.skuCount >= 6
    console.log(`    总批次数=1: ${totalBatchesOk ? '✓' : '✗'} (实际:${finalStats.totalBatches})`)
    console.log(`    总差异行=4: ${totalLinesOk ? '✓' : '✗'} (实际:${finalStats.totalLines})`)
    console.log(`    SKU种类>=6: ${skuCountOk ? '✓' : '✗'} (实际:${finalStats.inventoryStats.skuCount})`)

    // 11. 撤销批准
    log('11. 撤销批准（生成补偿流水）')
    const rolledBack = await apiJson('PUT', `/discrepancies/${batchId}/rollback`, {
      rolledBackBy: '经理E',
      reason: '盘点数据有误，重新盘点',
    })
    console.log(`  ✓ 状态: ${rolledBack.status}`)
    console.log(`  ✓ 撤销人: ${rolledBack.rolled_back_by}`)
    console.log(`  ✓ 撤销原因: ${rolledBack.rollback_reason}`)

    // 12. 检查补偿流水
    log('12. 检查补偿流水')
    const adjustmentsAfterRollback = await apiJson('GET', `/discrepancies/${batchId}/adjustments`)
    console.log(`  ✓ 调整流水总数: ${adjustmentsAfterRollback.length}`)
    const originalAdjs2 = adjustmentsAfterRollback.filter(a => a.adjustment_type === 'original')
    const compAdjs2 = adjustmentsAfterRollback.filter(a => a.adjustment_type === 'compensation')
    console.log(`  原调整: ${originalAdjs2.length} 条, 补偿: ${compAdjs2.length} 条`)

    console.log(`  补偿流水详情:`)
    for (const adj of compAdjs2) {
      console.log(`  - #${adj.id} ${adj.sku}: ${adj.direction} ${adj.quantity} (关联原调整#${adj.related_adjustment_id})`)
      console.log(`    操作人: ${adj.operator}, 原因: ${adj.reason}`)
    }

    // 验证补偿流水关联正确
    const allCompHaveRelated = compAdjs2.every(a => a.related_adjustment_id != null)
    const compCountMatches = compAdjs2.length === originalAdjs2.length
    console.log(`  所有补偿流水都有关联原调整: ${allCompHaveRelated ? '✓' : '✗'}`)
    console.log(`  补偿数量与原调整数量一致: ${compCountMatches ? '✓' : '✗'}`)

    // 13. 检查撤销后的库存（应恢复到初始状态）
    log('13. 检查撤销后的库存')
    const afterRollbackInv = await apiJson('GET', '/inventory/current')
    const sku002AfterRollback = afterRollbackInv.find(i => i.sku === 'SKU002')
    const sku005AfterRollback = afterRollbackInv.find(i => i.sku === 'SKU005')
    const sku004AfterRollback = afterRollbackInv.find(i => i.sku === 'SKU004')
    const sku006AfterRollback = afterRollbackInv.find(i => i.sku === 'SKU006')

    console.log(`  SKU002 撤销后: ${sku002AfterRollback?.quantity} (预期: ${sku002Initial.quantity})`)
    console.log(`  SKU005 撤销后: ${sku005AfterRollback?.quantity} (预期: ${sku005Initial.quantity})`)
    console.log(`  SKU004 撤销后: ${sku004AfterRollback?.quantity} (预期: ${sku004Initial.quantity})`)
    console.log(`  SKU006 撤销后: ${sku006AfterRollback?.quantity} (预期: ${sku006Initial.quantity})`)

    const sku002Restored = sku002AfterRollback.quantity === sku002Initial.quantity
    const sku005Restored = sku005AfterRollback.quantity === sku005Initial.quantity
    const sku004Restored = sku004AfterRollback.quantity === sku004Initial.quantity
    const sku006Restored = sku006AfterRollback.quantity === sku006Initial.quantity
    console.log(`  SKU002 库存恢复: ${sku002Restored ? '✓' : '✗'}`)
    console.log(`  SKU005 库存恢复: ${sku005Restored ? '✓' : '✗'}`)
    console.log(`  SKU004 库存恢复: ${sku004Restored ? '✓' : '✗'}`)
    console.log(`  SKU006 库存恢复: ${sku006Restored ? '✓' : '✗'}`)

    // 14. 导出报告
    log('14. 导出完整报告')
    const exportRes = await fetch(`${BASE_URL}/discrepancies/${batchId}/export`)
    const exportText = await exportRes.text()
    console.log(`  ✓ 导出成功，文件大小: ${exportText.length} 字节`)

    // 检查报告中的各个部分
    const hasBatchStatus = exportText.includes('=== 批次状态 ===')
    const hasBatchSection = exportText.includes('=== 1. 批次信息 ===')
    const hasLinesSection = exportText.includes('=== 2. 差异明细')
    const hasAdjSection = exportText.includes('=== 3. 库存调整流水')
    const hasDispSection = exportText.includes('=== 4. 处置记录 ===')
    const hasDispHistSection = exportText.includes('=== 5. 处置历史追溯 ===')
    const hasAuditSection = exportText.includes('=== 6. 审计日志 ===')
    console.log(`  包含批次状态概览: ${hasBatchStatus ? '✓' : '✗'}`)
    console.log(`  包含批次信息: ${hasBatchSection ? '✓' : '✗'}`)
    console.log(`  包含差异明细: ${hasLinesSection ? '✓' : '✗'}`)
    console.log(`  包含调整流水: ${hasAdjSection ? '✓' : '✗'}`)
    console.log(`  包含处置记录: ${hasDispSection ? '✓' : '✗'}`)
    console.log(`  包含处置历史: ${hasDispHistSection ? '✓' : '✗'}`)
    console.log(`  包含审计日志: ${hasAuditSection ? '✓' : '✗'}`)

    // 保存导出文件用于验证
    const exportPath = path.join(__dirname, 'test_export.csv')
    fs.writeFileSync(exportPath, exportText, 'utf8')
    console.log(`  已保存到: ${exportPath}`)

    // 保存一份用于重启后对比
    const exportPath1 = path.join(__dirname, 'test_export_before_restart.csv')
    fs.writeFileSync(exportPath1, exportText, 'utf8')

    // 14. 审计日志检查
    log('14. 检查审计日志')

    // 保存撤销后的仪表盘数据（重启后对比用）
    const finalStatsAfterRollback = await apiJson('GET', '/discrepancies/dashboard/stats')
    log('  已保存撤销后的仪表盘快照（用于重启后对比）')
    const auditResult = await apiJson('GET', '/audit?pageSize=100')
    console.log(`  ✓ 审计日志总数: ${auditResult.total}`)

    const batchAuditLogs = auditResult.data.filter(
      l => l.entity_type === 'discrepancy_batch' && l.entity_id === batchId
    )
    console.log(`  当前批次相关审计日志: ${batchAuditLogs.length} 条`)
    for (const logEntry of batchAuditLogs) {
      console.log(`  - ${logEntry.action}: ${logEntry.operator} - ${logEntry.detail}`)
    }

    // 汇总
    console.log('\n========== 验证结果汇总 ==========')
    const results = [
      ['【CSV校验】账面非法数量拦截', bookInvalidCorrect],
      ['【CSV校验】账面空SKU跳过计数正确', bookEmptyCorrect],
      ['【CSV校验】实盘非法/负数数量拦截', physicalInvalidCorrect],
      ['【仪表盘】空仪表盘API结构完整', 'diffAmountDistribution' in emptyStats && 'dispositionStatusDistribution' in emptyStats && 'recentApprovalRate' in emptyStats],
      ['账面库存导入', bookResult.success],
      ['实物盘点导入', physicalResult.success],
      ['负数实盘报错', !negativeResult.success],
      ['差异计算(4条差异)', diffLines.length === 4],
      ['复核通过', reviewed.status === 'reviewed'],
      ['批准调整', approved.status === 'approved'],
      ['生成原调整流水(4条)', originalAdjs.length === 4],
      ['批准后库存正确', sku002Correct && sku005Correct && sku004Correct && sku006Correct],
      ['撤销成功', rolledBack.status === 'rolled_back'],
      ['生成补偿流水(4条)', compAdjs2.length === 4],
      ['补偿流水关联正确', allCompHaveRelated && compCountMatches],
      ['撤销后库存恢复', sku002Restored && sku005Restored && sku004Restored && sku006Restored],
      ['导出报告包含所有部分', hasBatchStatus && hasBatchSection && hasLinesSection && hasAdjSection && hasDispSection && hasDispHistSection && hasAuditSection],
      ['审计日志完整(>=4条)', batchAuditLogs.length >= 4],
      ['处置角色设置正常', setHandlerRole?.role === 'handler' && setApproverRole?.role === 'approver'],
      ['处置权限校验正常', !approverPerm?.allowed && handlerPerm?.allowed],
      ['单条处置正常', setDispResult?.status === 'adjusted'],
      ['处置历史追溯正常', historyResult.length >= 1],
      ['批量处置正常', Array.isArray(batchDispResult) && batchDispResult.length === 2],
      ['【批量事务】批量含无效ID时报错', batchRollbackCorrect],
      ['【批量事务】回滚不污染有效数据', historyUnchanged],
      ['【批量事务】汇总审计日志存在', batchDispAuditOk],
      ['按状态筛选正常', adjustedDisps?.total === 1 && acceptedDisps?.total === 2],
      ['按SKU筛选正常', skuFilter?.total >= 1],
      ['处置审计日志正常', dispAuditLogs.length >= 3],
      ['详情含处置数据', linesWithDisp.length >= 3],
      ['审批人处置被拒绝', !approverSetDispBody.success],
      ['handler=审批人绕过被拒绝', !handlerBypassBody.success],
      ['【仪表盘】盘盈盘亏分布正确', surplusMatches && shortageMatches && missedMatches],
      ['【仪表盘】处置状态占比正确', dispMatches],
      ['【仪表盘】审批通过率结构正确', approval.totalBatches === 1],
      ['【仪表盘】总体统计正确', totalBatchesOk && totalLinesOk && skuCountOk],
    ]

    let allPassed = true
    for (const [name, passed] of results) {
      const icon = passed ? '✓' : '✗'
      console.log(`  ${icon} ${name}`)
      if (!passed) allPassed = false
    }

    console.log(`\n${allPassed ? '✅ 所有验证通过！' : '❌ 部分验证失败！'}`)

    if (allPassed) {
      console.log('\n📝 第一阶段验证完成！接下来请：')
      console.log('   1. 停止服务 (Ctrl+C)')
      console.log('   2. 重新启动 (npm run dev)')
      console.log('   3. 再次运行 node test_flow.mjs --restart-test 验证数据持久化')
    }

    // 保存批次ID供重启后测试使用
    fs.writeFileSync(path.join(__dirname, '.test_state.json'), JSON.stringify({
      batchId,
      exportFile: exportPath,
      dispHistoryCount,
      dispLinesCount: linesWithDisp.length,
      dashboardStats: finalStatsAfterRollback,
    }), 'utf8')

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

async function restartTest() {
  console.log('========== 重启后数据验证 ==========\n')

  try {
    const statePath = path.join(__dirname, '.test_state.json')
    if (!fs.existsSync(statePath)) {
      console.log('未找到测试状态文件，请先运行完整测试')
      process.exit(1)
    }
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const batchId = state.batchId
    const savedDashboardStats = state.dashboardStats

    // 1. 检查批次是否还在
    log('1. 检查差异批次')
    const batch = await apiJson('GET', `/discrepancies/${batchId}`)
    console.log(`  ✓ 批次号: ${batch.batch_no}`)
    console.log(`  ✓ 状态: ${batch.status}`)
    console.log(`  ✓ 撤销人: ${batch.rolled_back_by}`)
    console.log(`  ✓ 撤销原因: ${batch.rollback_reason}`)

    const statusCorrect = batch.status === 'rolled_back'
    console.log(`  状态正确(已撤销): ${statusCorrect ? '✓' : '✗'}`)

    // 2. 检查调整流水
    log('2. 检查调整流水')
    const adjustments = await apiJson('GET', `/discrepancies/${batchId}/adjustments`)
    const originalAdjs = adjustments.filter(a => a.adjustment_type === 'original')
    const compAdjs = adjustments.filter(a => a.adjustment_type === 'compensation')
    console.log(`  ✓ 调整流水总数: ${adjustments.length}`)
    console.log(`  原调整: ${originalAdjs.length} 条, 补偿: ${compAdjs.length} 条`)

    const adjsCountCorrect = adjustments.length === 8 // 4 original + 4 compensation
    console.log(`  流水数量正确: ${adjsCountCorrect ? '✓' : '✗'}`)

    // 3. 检查库存
    log('3. 检查当前库存')
    const inventory = await apiJson('GET', '/inventory/current')
    console.log(`  ✓ 共 ${inventory.length} 个 SKU`)
    const sku002 = inventory.find(i => i.sku === 'SKU002')
    const sku005 = inventory.find(i => i.sku === 'SKU005')
    console.log(`  SKU002: ${sku002?.quantity}`)
    console.log(`  SKU005: ${sku005?.quantity}`)

    // 4. 重新导出报告并对比
    log('4. 重新导出报告并对比')
    const exportRes = await fetch(`${BASE_URL}/discrepancies/${batchId}/export`)
    const newExportText = await exportRes.text()

    const oldExportPath = path.join(__dirname, 'test_export_before_restart.csv')
    const oldExportText = fs.readFileSync(oldExportPath, 'utf8')

    // 去掉时间相关的可能变化的部分... 实际上数据应该完全一致
    const exportsMatch = newExportText === oldExportText
    console.log(`  导出内容与重启前一致: ${exportsMatch ? '✓' : '✗'}`)

    if (!exportsMatch) {
      // 找出差异
      const newLines = newExportText.split('\n')
      const oldLines = oldExportText.split('\n')
      console.log(`  新文件行数: ${newLines.length}, 旧文件行数: ${oldLines.length}`)
    }

    // 保存新导出
    const newExportPath = path.join(__dirname, 'test_export_after_restart.csv')
    fs.writeFileSync(newExportPath, newExportText, 'utf8')

    // 5. 检查处置数据持久化
    log('5. 检查处置数据持久化')
    const dispAfter = await apiJson('GET', `/dispositions?batchId=${batchId}&pageSize=100`)
    const dispHistAfter = await apiJson('GET', `/dispositions/batch/${batchId}/history`)
    console.log(`  处置记录数: ${dispAfter?.total}`)
    console.log(`  处置历史数: ${dispHistAfter?.length}`)

    const dispPersisted = dispAfter?.total >= 3
    const dispHistPersisted = dispHistAfter?.length >= state.dispHistoryCount
    console.log(`  处置记录持久化: ${dispPersisted ? '✓' : '✗'}`)
    console.log(`  处置历史持久化: ${dispHistPersisted ? '✓' : '✗'}`)

    const detailAfter = await apiJson('GET', `/discrepancies/${batchId}`)
    const linesWithDispAfter = detailAfter.lines.filter(l => l.disposition && l.disposition.status !== 'pending')
    console.log(`  详情含处置数据行数: ${linesWithDispAfter.length}`)
    const detailHasDisp = linesWithDispAfter.length >= 3
    console.log(`  详情含处置数据: ${detailHasDisp ? '✓' : '✗'}`)

    // 6. 检查审计日志
    log('6. 检查审计日志')
    const auditResult = await apiJson('GET', '/audit?pageSize=100')
    const batchAuditLogs = auditResult.data.filter(
      l => l.entity_type === 'discrepancy_batch' && l.entity_id === batchId
    )
    console.log(`  批次相关审计日志: ${batchAuditLogs.length} 条`)
    for (const logEntry of batchAuditLogs) {
      console.log(`  - ${logEntry.action}: ${logEntry.operator}`)
    }

    // 7. 检查仪表盘统计持久化
    log('7. 检查仪表盘统计持久化')
    const dashboardAfterRestart = await apiJson('GET', '/discrepancies/dashboard/stats')

    // 深度对比关键数据
    function deepCompare(a, b, path = '') {
      if (typeof a !== typeof b) return { match: false, path, reason: `类型不同: ${typeof a} vs ${typeof b}` }
      if (typeof a !== 'object' || a === null) {
        if (a === b) return { match: true }
        return { match: false, path, reason: `值不同: ${a} vs ${b}` }
      }
      if (Array.isArray(a) !== Array.isArray(b)) return { match: false, path, reason: '数组/对象不同' }
      const keysA = Object.keys(a)
      const keysB = Object.keys(b)
      if (keysA.length !== keysB.length) return { match: false, path, reason: `键数量不同: ${keysA.length} vs ${keysB.length}` }
      for (const k of keysA) {
        if (!(k in b)) return { match: false, path: path + '.' + k, reason: '缺少键' }
        const r = deepCompare(a[k], b[k], path + '.' + k)
        if (!r.match) return r
      }
      return { match: true }
    }

    const dashboardCompare = deepCompare(dashboardAfterRestart, savedDashboardStats)
    console.log(`  仪表盘数据与重启前完全一致: ${dashboardCompare.match ? '✓' : '✗'}`)
    if (!dashboardCompare.match) {
      console.log(`    差异路径: ${dashboardCompare.path}, 原因: ${dashboardCompare.reason}`)
    }
    console.log(`  重启后总批次数: ${dashboardAfterRestart.totalBatches}`)
    console.log(`  重启后总差异行: ${dashboardAfterRestart.totalLines}`)
    console.log(`  重启后库存SKU数: ${dashboardAfterRestart.inventoryStats.skuCount}`)
    console.log(`  重启后SKU002库存恢复验证(应为480): 见上库存检查`)

    // 汇总
    console.log('\n========== 重启验证结果 ==========')
    const results = [
      ['批次状态正确', statusCorrect],
      ['调整流水完整', adjsCountCorrect],
      ['库存数据正确', sku002?.quantity === 480 && sku005?.quantity === 150],
      ['导出报告一致', exportsMatch],
      ['处置记录持久化', dispPersisted],
      ['处置历史持久化', dispHistPersisted],
      ['详情含处置数据', detailHasDisp],
      ['审计日志完整', batchAuditLogs.length >= 4],
      ['【仪表盘】重启后统计不变', dashboardCompare.match],
    ]

    let allPassed = true
    for (const [name, passed] of results) {
      const icon = passed ? '✓' : '✗'
      console.log(`  ${icon} ${name}`)
      if (!passed) allPassed = false
    }

    console.log(`\n${allPassed ? '✅ 重启后数据验证全部通过！' : '❌ 部分验证失败！'}`)
    console.log('\n📦 数据库文件位置: data/inventory.db')
    console.log('📄 导出报告: test_export_before_restart.csv / test_export_after_restart.csv')

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

const args = process.argv.slice(2)
if (args.includes('--restart-test')) {
  restartTest()
} else {
  main()
}
