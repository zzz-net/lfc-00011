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
    // 1. 导入账面库存
    log('1. 导入账面库存')
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

    // 10. 撤销批准
    log('10. 撤销批准（生成补偿流水）')
    const rolledBack = await apiJson('PUT', `/discrepancies/${batchId}/rollback`, {
      rolledBackBy: '经理E',
      reason: '盘点数据有误，重新盘点',
    })
    console.log(`  ✓ 状态: ${rolledBack.status}`)
    console.log(`  ✓ 撤销人: ${rolledBack.rolled_back_by}`)
    console.log(`  ✓ 撤销原因: ${rolledBack.rollback_reason}`)

    // 11. 检查补偿流水
    log('11. 检查补偿流水')
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

    // 12. 检查撤销后的库存（应恢复到初始状态）
    log('12. 检查撤销后的库存')
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

    // 13. 导出报告
    log('13. 导出完整报告')
    const exportRes = await fetch(`${BASE_URL}/discrepancies/${batchId}/export`)
    const exportText = await exportRes.text()
    console.log(`  ✓ 导出成功，文件大小: ${exportText.length} 字节`)

    // 检查报告中的各个部分
    const hasBatchStatus = exportText.includes('=== 批次状态 ===')
    const hasBatchSection = exportText.includes('=== 1. 批次信息 ===')
    const hasLinesSection = exportText.includes('=== 2. 差异明细 ===')
    const hasAdjSection = exportText.includes('=== 3. 库存调整流水')
    const hasAuditSection = exportText.includes('=== 4. 审计日志 ===')
    console.log(`  包含批次状态概览: ${hasBatchStatus ? '✓' : '✗'}`)
    console.log(`  包含批次信息: ${hasBatchSection ? '✓' : '✗'}`)
    console.log(`  包含差异明细: ${hasLinesSection ? '✓' : '✗'}`)
    console.log(`  包含调整流水: ${hasAdjSection ? '✓' : '✗'}`)
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
      ['导出报告包含所有部分', hasBatchStatus && hasBatchSection && hasLinesSection && hasAdjSection && hasAuditSection],
      ['审计日志完整(>=4条)', batchAuditLogs.length >= 4],
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

    // 5. 检查审计日志
    log('5. 检查审计日志')
    const auditResult = await apiJson('GET', '/audit?pageSize=100')
    const batchAuditLogs = auditResult.data.filter(
      l => l.entity_type === 'discrepancy_batch' && l.entity_id === batchId
    )
    console.log(`  批次相关审计日志: ${batchAuditLogs.length} 条`)
    for (const logEntry of batchAuditLogs) {
      console.log(`  - ${logEntry.action}: ${logEntry.operator}`)
    }

    // 汇总
    console.log('\n========== 重启验证结果 ==========')
    const results = [
      ['批次状态正确', statusCorrect],
      ['调整流水完整', adjsCountCorrect],
      ['库存数据正确', sku002?.quantity === 480 && sku005?.quantity === 150],
      ['导出报告一致', exportsMatch],
      ['审计日志完整', batchAuditLogs.length >= 4],
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
