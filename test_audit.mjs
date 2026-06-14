const BASE_URL = 'http://localhost:3001/api'

async function test() {
  const res = await fetch(`${BASE_URL}/audit?pageSize=50`)
  const result = await res.json()
  const data = result.data
  console.log('审计日志总数:', data.total)
  
  const logs = data.data || []
  const planLogs = logs.filter(l => l.entity_type === 'stocktake_plan')
  console.log('计划相关审计日志:', planLogs.length)
  console.log('\n--- 计划相关审计日志 ---')
  planLogs.forEach(l => {
    console.log(`  [${l.created_at}] ${l.action} - ${l.operator} - ${l.detail}`)
  })
}

test().catch(console.error)
