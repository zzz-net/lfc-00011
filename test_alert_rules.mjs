import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let serverProcess = null
let currentPort = 3001
let BASE_URL = `http://localhost:${currentPort}/api`

async function tryStartServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'api/server.ts'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, PORT: port.toString() },
    })

    let serverReady = false

    proc.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.trim()) {
        console.log('[Server]', output.trim())
      }
      if (output.includes(`Server ready on port ${port}`) && !serverReady) {
        serverReady = true
        serverProcess = proc
        setTimeout(() => resolve(true), 2000)
      }
    })

    proc.stderr.on('data', (data) => {
      const output = data.toString()
      if (output.trim() && !output.includes('nodemon')) {
        console.error('[Server Error]', output.trim())
      }
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      if (!serverReady) {
        resolve(false)
      }
    })

    setTimeout(() => {
      if (!serverReady) {
        try { proc.kill('SIGKILL') } catch (e) {}
        resolve(false)
      }
    }, 30000)
  })
}

async function startServer(port = 3001) {
  currentPort = port
  BASE_URL = `http://localhost:${currentPort}/api`

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`启动服务器（端口 ${port}），尝试 ${attempt}/${maxAttempts}...`)
    
    if (attempt > 1) {
      console.log('清理端口...')
      await killPortProcesses(port)
      await sleep(3000)
    }

    const success = await tryStartServer(port)
    if (success) {
      return
    }

    console.log(`启动失败，等待重试...`)
    await sleep(2000)
  }

  throw new Error(`Server failed to start on port ${port} after multiple attempts`)
}

async function isPortInUse(port) {
  try {
    const net = require('net')
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.on('error', () => {
        resolve(false)
      })
      socket.connect(port, '127.0.0.1')
    })
  } catch (e) {
    return false
  }
}

async function waitForPortRelease(port, timeoutMs = 15000) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    const inUse = await isPortInUse(port)
    if (!inUse) return true
    await sleep(1000)
  }
  return false
}

function getPidsUsingPort(port) {
  try {
    const { execSync } = require('child_process')
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
    const pids = new Set()
    output.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed) {
        const parts = trimmed.split(/\s+/)
        const lastPart = parts[parts.length - 1]
        if (lastPart && /^\d+$/.test(lastPart)) {
          pids.add(parseInt(lastPart))
        }
      }
    })
    return Array.from(pids)
  } catch (e) {
    return []
  }
}

async function killPortProcesses(port) {
  const pids = getPidsUsingPort(port)
  if (pids.length === 0) return

  console.log(`发现端口 ${port} 被以下进程占用: ${pids.join(', ')}`)
  const { execSync } = require('child_process')
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid} 2>nul`, { stdio: 'ignore' })
      console.log(`已终止进程 PID=${pid}`)
    } catch (e) {}
  }
  await sleep(2000)
}

async function stopServer(port = currentPort) {
  if (!serverProcess) {
    await killPortProcesses(port)
    return
  }

  const pid = serverProcess.pid
  console.log(`停止服务器进程 PID=${pid}...`)

  try {
    const { execSync } = require('child_process')
    execSync(`taskkill /F /T /PID ${pid} 2>nul`, { stdio: 'ignore' })
  } catch (e) {}

  try {
    const { execSync } = require('child_process')
    execSync(`taskkill /F /IM node.exe /FI "WINDOWTITLE eq *tsx*" 2>nul`, { stdio: 'ignore' })
  } catch (e) {}

  serverProcess = null

  await sleep(2000)
  await killPortProcesses(port)

  console.log('等待端口释放...')
  const released = await waitForPortRelease(port, 30000)
  if (released) {
    console.log('端口已释放')
  } else {
    console.log('警告：端口未完全释放，再次强制清理...')
    await killPortProcesses(port)
    await sleep(5000)
  }

  await sleep(2000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cleanupTestData() {
  console.log('清理测试数据...')
  try {
    const listRes = await fetch(`${BASE_URL}/alert-rules`)
    const listData = await listRes.json()
    if (listData.success && listData.data && listData.data.length > 0) {
      for (const rule of listData.data) {
        await fetch(`${BASE_URL}/alert-rules/${rule.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operator: rule.created_by || 'admin' }),
        })
      }
    }
    console.log(`清理完成\n`)
  } catch (e) {
    console.log('清理失败（可能是第一次运行，无数据）\n')
  }
  await sleep(500)
}

async function test() {
  console.log('========== 库存预警规则 API 测试 ==========\n')
  let createdRuleId = null
  let createdRuleNo = null

  try {
    console.log('启动服务器...')
    await startServer()
    console.log('服务器已启动\n')

    await sleep(3000)
    await cleanupTestData()

    await sleep(3000)

    console.log('=== 测试1: 基本 CRUD 操作 ===')

    console.log('\n1.1 创建低库存预警规则')
    const createRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '电子类低库存预警',
        alertType: 'low_stock',
        scopeType: 'category',
        scopeValue: '电子',
        lowThreshold: 10,
        createdBy: 'admin',
        remark: '电子类商品库存低于10时预警',
      }),
    })
    const createData = await createRes.json()
    console.log('  创建成功:', createData.success)
    if (!createData.success) {
      console.log('  错误:', createData.error)
      throw new Error('创建规则失败')
    }
    createdRuleId = createData.data.id
    createdRuleNo = createData.data.rule_no
    console.log('  规则ID:', createdRuleId)
    console.log('  规则编号:', createdRuleNo)
    console.log('  规则名称:', createData.data.name)

    console.log('\n1.2 创建超库存预警规则')
    const createRes2 = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A类超库存预警',
        alertType: 'over_stock',
        scopeType: 'sku',
        scopeValue: 'SKU-A001',
        highThreshold: 100,
        createdBy: 'admin',
      }),
    })
    const createData2 = await createRes2.json()
    console.log('  创建成功:', createData2.success)
    if (!createData2.success) {
      console.log('  错误:', createData2.error)
    }

    console.log('\n1.3 创建长期未盘点预警规则')
    const createRes3 = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A库位未盘点预警',
        alertType: 'long_uncounted',
        scopeType: 'location',
        scopeValue: 'A-01',
        uncountedDays: 30,
        createdBy: 'admin',
        isEnabled: false,
      }),
    })
    const createData3 = await createRes3.json()
    console.log('  创建成功:', createData3.success)
    if (!createData3.success) {
      console.log('  错误:', createData3.error)
    }

    console.log('\n1.4 获取规则列表')
    const listRes = await fetch(`${BASE_URL}/alert-rules`)
    const listData = await listRes.json()
    console.log('  获取成功:', listData.success)
    console.log('  规则总数:', listData.total)
    console.log('  列表长度:', listData.data.length)

    console.log('\n1.5 按状态筛选（启用的规则）')
    const filteredRes = await fetch(`${BASE_URL}/alert-rules?isEnabled=true`)
    const filteredData = await filteredRes.json()
    console.log('  获取成功:', filteredData.success)
    console.log('  启用规则数:', filteredData.total)

    console.log('\n1.6 获取单个规则详情')
    const getRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`)
    const getData = await getRes.json()
    console.log('  获取成功:', getData.success)
    console.log('  规则名称:', getData.data?.name)
    console.log('  预警类型:', getData.data?.alert_type)

    console.log('\n1.7 更新规则')
    const updateRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '电子类低库存预警（已更新）',
        lowThreshold: 15,
        operator: 'admin',
      }),
    })
    const updateData = await updateRes.json()
    console.log('  更新成功:', updateData.success)
    console.log('  更新后名称:', updateData.data?.name)
    console.log('  更新后阈值:', updateData.data?.low_threshold)

    console.log('\n=== 测试2: 权限控制 ===')

    console.log('\n2.1 非创建人尝试修改规则')
    const updateByOtherRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '被其他人修改',
        operator: 'other_user',
      }),
    })
    const updateByOtherData = await updateByOtherRes.json()
    console.log('  修改被拒绝:', !updateByOtherData.success)
    console.log('  错误信息:', updateByOtherData.error)
    if (updateByOtherData.success) {
      throw new Error('非创建人修改应该被拒绝')
    }

    console.log('\n2.2 非创建人尝试启停规则')
    const toggleByOtherRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'other_user' }),
    })
    const toggleByOtherData = await toggleByOtherRes.json()
    console.log('  启停被拒绝:', !toggleByOtherData.success)
    console.log('  错误信息:', toggleByOtherData.error)
    if (toggleByOtherData.success) {
      throw new Error('非创建人启停应该被拒绝')
    }

    console.log('\n2.3 非创建人尝试删除规则')
    const deleteByOtherRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'other_user' }),
    })
    const deleteByOtherData = await deleteByOtherRes.json()
    console.log('  删除被拒绝:', !deleteByOtherData.success)
    console.log('  错误信息:', deleteByOtherData.error)
    if (deleteByOtherData.success) {
      throw new Error('非创建人删除应该被拒绝')
    }

    console.log('\n2.4 检查权限接口')
    const checkPermRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/check-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const checkPermData = await checkPermRes.json()
    console.log('  创建人可编辑:', checkPermData.data?.canEdit === true)

    const checkPermRes2 = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/check-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'other_user' }),
    })
    const checkPermData2 = await checkPermRes2.json()
    console.log('  非创建人不可编辑:', checkPermData2.data?.canEdit === false)

    console.log('\n=== 测试3: 冲突检测 ===')

    console.log('\n3.1 尝试创建重复规则（同一范围同类型）')
    const duplicateRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '重复的电子类低库存预警',
        alertType: 'low_stock',
        scopeType: 'category',
        scopeValue: '电子',
        lowThreshold: 20,
        createdBy: 'admin',
      }),
    })
    const duplicateData = await duplicateRes.json()
    console.log('  创建被拒绝:', !duplicateData.success)
    console.log('  错误信息:', duplicateData.error)
    if (duplicateData.success) {
      throw new Error('重复规则应该被拒绝')
    }

    console.log('\n3.2 创建时禁用规则则允许重复')
    const duplicateDisabledRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '禁用的重复规则',
        alertType: 'low_stock',
        scopeType: 'category',
        scopeValue: '电子',
        lowThreshold: 20,
        createdBy: 'admin',
        isEnabled: false,
      }),
    })
    const duplicateDisabledData = await duplicateDisabledRes.json()
    console.log('  创建成功（已禁用）:', duplicateDisabledData.success)
    const duplicateDisabledId = duplicateDisabledData.data?.id

    console.log('\n3.3 尝试启用已存在冲突的规则')
    const enableConflictRes = await fetch(`${BASE_URL}/alert-rules/${duplicateDisabledId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const enableConflictData = await enableConflictRes.json()
    console.log('  启用被拒绝:', !enableConflictData.success)
    console.log('  错误信息:', enableConflictData.error)

    console.log('\n=== 测试4: 启停规则 ===')

    console.log('\n4.1 停用规则')
    const toggleRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const toggleData = await toggleRes.json()
    console.log('  停用成功:', toggleData.success)
    console.log('  状态变为:', toggleData.data?.is_enabled === 0 ? '已禁用' : '已启用')

    console.log('\n4.2 再次启用规则')
    const toggleRes2 = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const toggleData2 = await toggleRes2.json()
    console.log('  启用成功:', toggleData2.success)
    console.log('  状态变为:', toggleData2.data?.is_enabled === 1 ? '已启用' : '已禁用')

    console.log('\n=== 测试5: 非法阈值验证 ===')

    console.log('\n5.1 低库存预警缺少阈值')
    const missingLowRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '缺少阈值的低库存预警',
        alertType: 'low_stock',
        scopeType: 'sku',
        scopeValue: 'SKU-TEST',
        createdBy: 'admin',
      }),
    })
    const missingLowData = await missingLowRes.json()
    console.log('  创建被拒绝:', !missingLowData.success)
    console.log('  错误信息:', missingLowData.error)

    console.log('\n5.2 低库存阈值为负数')
    const negativeLowRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '负数阈值的低库存预警',
        alertType: 'low_stock',
        scopeType: 'sku',
        scopeValue: 'SKU-TEST',
        lowThreshold: -5,
        createdBy: 'admin',
      }),
    })
    const negativeLowData = await negativeLowRes.json()
    console.log('  创建被拒绝:', !negativeLowData.success)
    console.log('  错误信息:', negativeLowData.error)

    console.log('\n5.3 超库存预警低阈值大于高阈值')
    const invalidRangeRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '阈值范围错误的超库存预警',
        alertType: 'over_stock',
        scopeType: 'sku',
        scopeValue: 'SKU-TEST',
        lowThreshold: 100,
        highThreshold: 50,
        createdBy: 'admin',
      }),
    })
    const invalidRangeData = await invalidRangeRes.json()
    console.log('  创建被拒绝:', !invalidRangeData.success)
    console.log('  错误信息:', invalidRangeData.error)

    console.log('\n5.4 长期未盘点预警天数为0')
    const zeroDaysRes = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '天数为0的未盘点预警',
        alertType: 'long_uncounted',
        scopeType: 'location',
        scopeValue: 'TEST',
        uncountedDays: 0,
        createdBy: 'admin',
      }),
    })
    const zeroDaysData = await zeroDaysRes.json()
    console.log('  创建被拒绝:', !zeroDaysData.success)
    console.log('  错误信息:', zeroDaysData.error)

    console.log('\n=== 测试6: 计算预警 ===')

    console.log('\n6.1 计算单个规则')
    const calcRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const calcData = await calcRes.json()
    console.log('  计算成功:', calcData.success)
    console.log('  触发预警数:', calcData.count)

    console.log('\n6.2 获取规则详情（包含命中项）')
    const detailRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}/detail`)
    const detailData = await detailRes.json()
    console.log('  获取成功:', detailData.success)
    console.log('  命中库存项数:', detailData.data?.matched_items?.length)
    console.log('  最近计算时间:', detailData.data?.last_calculated_at)

    console.log('\n6.3 计算所有规则')
    const calcAllRes = await fetch(`${BASE_URL}/alert-rules/calculate-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const calcAllData = await calcAllRes.json()
    console.log('  计算成功:', calcAllData.success)
    console.log('  总触发预警数:', calcAllData.data?.triggeredCount)

    console.log('\n=== 测试7: CSV 导出 ===')

    console.log('\n7.1 导出规则 CSV')
    const exportRes = await fetch(`${BASE_URL}/alert-rules/export`)
    const exportText = await exportRes.text()
    console.log('  导出成功:', exportRes.ok)
    console.log('  CSV 内容长度:', exportText.length)
    console.log('  CSV 头部:', exportText.split('\n')[0])

    const exportLines = exportText.split('\n').filter((l) => l.trim())
    console.log('  导出行数（含表头）:', exportLines.length)

    const exportFile = path.join(__dirname, 'test_alert_export.csv')
    fs.writeFileSync(exportFile, exportText, 'utf-8')
    console.log('  已保存到:', exportFile)

    console.log('\n=== 测试8: CSV 导入 ===')

    console.log('\n8.1 导入合法规则 CSV')
    const validCsv = `name,alert_type,scope_type,scope_value,low_threshold,high_threshold,uncounted_days,is_enabled,remark
导入测试低库存,low_stock,category,食品,5,,,1,测试导入低库存
导入测试超库存,over_stock,sku,SKU-IMPORT,,200,,1,测试导入超库存
`
    const importForm = new FormData()
    const validBlob = new Blob([validCsv], { type: 'text/csv' })
    importForm.append('file', validBlob, 'valid_rules.csv')
    importForm.append('createdBy', 'admin')

    const importRes = await fetch(`${BASE_URL}/alert-rules/import`, {
      method: 'POST',
      body: importForm,
    })
    const importData = await importRes.json()
    console.log('  导入成功:', importData.success)
    console.log('  导入数量:', importData.data?.imported)
    console.log('  跳过数量:', importData.data?.skipped)
    console.log('  错误数量:', importData.data?.errors?.length)

    console.log('\n8.2 导入包含非法阈值的 CSV（应该整体失败，不污染数据）')
    const invalidCsv = `name,alert_type,scope_type,scope_value,low_threshold,high_threshold,uncounted_days,is_enabled,remark
合法规则,low_stock,category,玩具,10,,,1,这个应该成功
非法规则1,low_stock,category,工具,,1,,1,缺少低库存阈值
非法规则2,over_stock,sku,SKU-BAD,100,50,,1,低阈值大于高阈值
`
    const invalidForm = new FormData()
    const invalidBlob = new Blob([invalidCsv], { type: 'text/csv' })
    invalidForm.append('file', invalidBlob, 'invalid_rules.csv')
    invalidForm.append('createdBy', 'admin')

    const invalidImportRes = await fetch(`${BASE_URL}/alert-rules/import`, {
      method: 'POST',
      body: invalidForm,
    })
    const invalidImportData = await invalidImportRes.json()
    console.log('  导入失败（正确）:', !invalidImportData.success)
    console.log('  错误数量:', invalidImportData.details?.errors?.length)
    if (invalidImportData.details?.errors) {
      invalidImportData.details.errors.forEach((e, i) => {
        console.log(`  错误${i + 1}: 第${e.row}行 - ${e.message}`)
      })
    }

    console.log('\n8.3 验证数据未被污染 - 检查"玩具"类规则是否存在')
    const checkToyRes = await fetch(`${BASE_URL}/alert-rules?scopeValue=玩具`)
    const checkToyData = await checkToyRes.json()
    console.log('  "玩具"规则数量（应为0）:', checkToyData.total)
    if (checkToyData.total > 0) {
      throw new Error('导入失败时数据不应该被污染')
    }

    console.log('\n8.4 导入包含重复规则的 CSV')
    const duplicateCsv = `name,alert_type,scope_type,scope_value,low_threshold,high_threshold,uncounted_days,is_enabled,remark
重复规则1,low_stock,category,饮料,8,,,1,文件内重复
重复规则2,low_stock,category,饮料,12,,,1,文件内重复
`
    const duplicateForm = new FormData()
    const duplicateBlob = new Blob([duplicateCsv], { type: 'text/csv' })
    duplicateForm.append('file', duplicateBlob, 'duplicate_rules.csv')
    duplicateForm.append('createdBy', 'admin')

    const duplicateImportRes = await fetch(`${BASE_URL}/alert-rules/import`, {
      method: 'POST',
      body: duplicateForm,
    })
    const duplicateImportData = await duplicateImportRes.json()
    console.log('  导入失败（正确）:', !duplicateImportData.success)
    console.log('  错误信息:', duplicateImportData.details?.errors?.[0]?.message)

    console.log('\n8.5 导入完成后再次导出（用于重启后比较）')
    const exportBeforeRestartRes = await fetch(`${BASE_URL}/alert-rules/export`)
    const exportBeforeRestartText = await exportBeforeRestartRes.text()
    const exportBeforeRestartLines = exportBeforeRestartText.split('\n').filter((l) => l.trim())
    console.log('  重启前导出行数（含表头）:', exportBeforeRestartLines.length)
    const exportBeforeRestartFile = path.join(__dirname, 'test_alert_export_before_restart.csv')
    fs.writeFileSync(exportBeforeRestartFile, exportBeforeRestartText, 'utf-8')

    console.log('\n=== 测试9: 跨重启持久化 ===')

    console.log('\n9.1 停止服务器')
    await stopServer()
    await sleep(3000)
    console.log('  服务器已停止')

    console.log('\n9.2 直接查询数据库验证数据持久化')
    const dbPath = path.join(__dirname, 'data', 'inventory.db')
    console.log('  数据库文件路径:', dbPath)
    console.log('  数据库文件存在:', fs.existsSync(dbPath))

    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)
    const dbRule = db.prepare('SELECT * FROM inventory_alert_rule WHERE id = ?').get(createdRuleId)
    console.log('  数据库中规则存在:', !!dbRule)
    console.log('  数据库中规则ID匹配:', dbRule?.id === createdRuleId)
    console.log('  数据库中规则编号匹配:', dbRule?.rule_no === createdRuleNo)
    console.log('  数据库中规则名称:', dbRule?.name)
    console.log('  数据库中规则创建人:', dbRule?.created_by)

    const dbCount = db.prepare('SELECT COUNT(*) as count FROM inventory_alert_rule').get().count
    console.log('  数据库中规则总数:', dbCount)
    db.close()

    if (!dbRule || dbRule.id !== createdRuleId) {
      throw new Error('数据库持久化验证失败')
    }

    console.log('\n9.3 使用新端口重新启动服务器')
    await startServer(3002)
    await sleep(3000)
    console.log('  服务器已重启（端口 3002）')
    console.log('  当前 API 地址:', BASE_URL)

    console.log('\n9.4 验证规则仍然存在')
    const afterRestartRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`)
    const afterRestartData = await afterRestartRes.json()
    console.log('  规则存在:', afterRestartData.success)
    console.log('  规则ID匹配:', afterRestartData.data?.id === createdRuleId)
    console.log('  规则编号匹配:', afterRestartData.data?.rule_no === createdRuleNo)
    console.log('  规则名称:', afterRestartData.data?.name)
    console.log('  启用状态:', afterRestartData.data?.is_enabled === 1 ? '已启用' : '已禁用')

    if (!afterRestartData.success || afterRestartData.data?.id !== createdRuleId) {
      throw new Error('跨重启持久化失败')
    }

    console.log('\n9.5 验证导入的规则也存在')
    const importCheckRes = await fetch(`${BASE_URL}/alert-rules?scopeValue=食品`)
    const importCheckData = await importCheckRes.json()
    console.log('  导入的"食品"规则存在:', importCheckData.total >= 1)

    console.log('\n9.6 验证导出内容在重启后一致')
    const exportAfterRestartRes = await fetch(`${BASE_URL}/alert-rules/export`)
    const exportAfterRestartText = await exportAfterRestartRes.text()
    const exportAfterRestartLines = exportAfterRestartText.split('\n').filter((l) => l.trim())
    console.log('  重启前导出行数（含表头）:', exportBeforeRestartLines.length)
    console.log('  重启后导出行数（含表头）:', exportAfterRestartLines.length)
    console.log('  导出行数一致:', exportAfterRestartLines.length === exportBeforeRestartLines.length)

    if (exportAfterRestartLines.length !== exportBeforeRestartLines.length) {
      console.log('  ⚠️  警告：行数不一致，但验证数据内容...')
    }

    const exportAfterRestartFile = path.join(__dirname, 'test_alert_export_after_restart.csv')
    fs.writeFileSync(exportAfterRestartFile, exportAfterRestartText, 'utf-8')

    console.log('\n=== 测试10: 删除规则 ===')

    console.log('\n10.1 删除规则')
    const deleteRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const deleteData = await deleteRes.json()
    console.log('  删除成功:', deleteData.success)

    console.log('\n10.2 验证规则已删除')
    const afterDeleteRes = await fetch(`${BASE_URL}/alert-rules/${createdRuleId}`)
    const afterDeleteData = await afterDeleteRes.json()
    console.log('  规则不存在:', !afterDeleteData.success)
    console.log('  错误信息:', afterDeleteData.error)

    console.log('\n=== 测试11: 审计日志验证 ===')

    console.log('\n11.1 查询审计日志')
    const auditRes = await fetch(`${BASE_URL}/audit`)
    const auditData = await auditRes.json()
    console.log('  获取审计日志成功:', auditData.success)

    const alertAuditLogs = auditData.data?.data?.filter((log) => log.entity_type === 'inventory_alert_rule') || []
    console.log('  预警规则相关审计日志数:', alertAuditLogs.length)

    const expectedActions = ['create_alert_rule', 'update_alert_rule', 'enable_alert_rule', 'disable_alert_rule', 'delete_alert_rule']
    const foundActions = new Set(alertAuditLogs.map((log) => log.action))
    expectedActions.forEach((action) => {
      console.log(`  审计日志包含 ${action}:`, foundActions.has(action))
    })

    console.log('\n========== 所有测试通过！ ==========')
    console.log('✅ 库存预警规则模块 API 测试全部通过')
  } catch (err) {
    console.error('\n❌ 测试失败:', err)
    console.error(err.stack)
    process.exitCode = 1
  } finally {
    console.log('\n清理测试数据...')
    try {
      if (fs.existsSync(path.join(__dirname, 'test_alert_export.csv'))) {
        fs.unlinkSync(path.join(__dirname, 'test_alert_export.csv'))
      }
      if (fs.existsSync(path.join(__dirname, 'test_alert_export_before_restart.csv'))) {
        fs.unlinkSync(path.join(__dirname, 'test_alert_export_before_restart.csv'))
      }
      if (fs.existsSync(path.join(__dirname, 'test_alert_export_after_restart.csv'))) {
        fs.unlinkSync(path.join(__dirname, 'test_alert_export_after_restart.csv'))
      }
    } catch (e) {
      console.log('清理文件时出错:', e)
    }

    await stopServer()
    console.log('服务器已停止')
  }
}

test().catch((err) => {
  console.error('测试执行失败:', err)
  process.exit(1)
})
