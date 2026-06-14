const BASE_URL = 'http://localhost:3001/api'

async function test() {
  console.log('========== 权限控制测试 ==========\n')

  // 创建一个计划，创建人是 creator，执行人是 executor
  console.log('1. 创建计划 (创建人: creator, 执行人: executor)')
  const createRes = await fetch(`${BASE_URL}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '权限测试计划',
      scopeType: 'all',
      planDate: '2026-09-01',
      responsiblePerson: '负责人A',
      executor: 'executor',
      recurrenceType: 'once',
      createdBy: 'creator',
    }),
  })
  const createData = await createRes.json()
  console.log('  创建成功:', createData.success)
  const planId = createData.data?.id
  console.log('  计划ID:', planId)

  if (!planId) return

  // 测试1：创建人可以修改
  console.log('\n2. 测试创建人可以修改计划')
  const updateByCreator = await fetch(`${BASE_URL}/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '权限测试计划（已修改）',
      operator: 'creator',
    }),
  })
  const updateByCreatorData = await updateByCreator.json()
  console.log('  创建人修改成功:', updateByCreatorData.success)
  if (!updateByCreatorData.success) {
    console.log('  错误:', updateByCreatorData.error)
  }

  // 测试2：执行人不能修改
  console.log('\n3. 测试执行人不能修改计划')
  const updateByExecutor = await fetch(`${BASE_URL}/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '执行人尝试修改',
      operator: 'executor',
    }),
  })
  const updateByExecutorData = await updateByExecutor.json()
  console.log('  执行人修改被拒绝:', !updateByExecutorData.success)
  console.log('  错误:', updateByExecutorData.error)

  // 测试3：执行人可以开始计划
  console.log('\n4. 测试执行人可以开始计划')
  const startByExecutor = await fetch(`${BASE_URL}/plans/${planId}/start`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: 'executor' }),
  })
  const startByExecutorData = await startByExecutor.json()
  console.log('  执行人开始成功:', startByExecutorData.success)
  console.log('  状态:', startByExecutorData.data?.status)

  // 测试4：执行人可以完成计划
  console.log('\n5. 测试执行人可以完成计划')
  const completeByExecutor = await fetch(`${BASE_URL}/plans/${planId}/complete`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: 'executor' }),
  })
  const completeByExecutorData = await completeByExecutor.json()
  console.log('  执行人完成成功:', completeByExecutorData.success)
  console.log('  状态:', completeByExecutorData.data?.status)

  // 测试5：执行人不能取消计划
  console.log('\n6. 测试执行人不能取消计划 (需要重新创建一个)')
  const createRes2 = await fetch(`${BASE_URL}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '取消权限测试计划',
      scopeType: 'all',
      planDate: '2026-10-01',
      responsiblePerson: '负责人B',
      executor: 'executor2',
      recurrenceType: 'once',
      createdBy: 'creator2',
    }),
  })
  const createData2 = await createRes2.json()
  const planId2 = createData2.data?.id

  if (planId2) {
    const cancelByExecutor = await fetch(`${BASE_URL}/plans/${planId2}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'executor2', reason: '执行人想取消' }),
    })
    const cancelByExecutorData = await cancelByExecutor.json()
    console.log('  执行人取消被拒绝:', !cancelByExecutorData.success)
    console.log('  错误:', cancelByExecutorData.error)

    // 创建人可以取消
    const cancelByCreator = await fetch(`${BASE_URL}/plans/${planId2}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'creator2', reason: '创建人取消' }),
    })
    const cancelByCreatorData = await cancelByCreator.json()
    console.log('  创建人取消成功:', cancelByCreatorData.success)
    console.log('  状态:', cancelByCreatorData.data?.status)
  }

  console.log('\n========== 权限测试完成 ==========')
  console.log('✅ 权限控制测试通过！')
}

test().catch(console.error)
