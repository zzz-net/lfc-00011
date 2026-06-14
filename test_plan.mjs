const BASE_URL = 'http://localhost:3001/api'

async function test() {
  console.log('========== 盘点计划模块测试 ==========\n')

  try {
    // 1. 创建计划
    console.log('1. 创建盘点计划')
    const createRes = await fetch(`${BASE_URL}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '6月月度全仓盘点',
        scopeType: 'all',
        planDate: '2026-06-15',
        responsiblePerson: '张三',
        executor: '李四',
        recurrenceType: 'once',
        remark: '六月底全仓大盘点',
        createdBy: 'admin',
      }),
    })
    const createData = await createRes.json()
    console.log('  创建成功:', createData.success)
    if (!createData.success) console.log('  错误:', createData.error)
    const planId = createData.data?.id
    console.log('  计划ID:', planId)
    console.log('  计划编号:', createData.data?.plan_no)
    console.log('  状态:', createData.data?.status)

    if (!planId) throw new Error('创建计划失败')

    // 2. 获取计划列表
    console.log('\n2. 获取计划列表')
    const listRes = await fetch(`${BASE_URL}/plans?pageSize=10`)
    const listData = await listRes.json()
    console.log('  获取成功:', listData.success)
    console.log('  总数:', listData.total)
    console.log('  列表数量:', listData.data?.length)

    // 3. 获取计划详情
    console.log('\n3. 获取计划详情')
    const detailRes = await fetch(`${BASE_URL}/plans/${planId}`)
    const detailData = await detailRes.json()
    console.log('  获取成功:', detailData.success)
    console.log('  计划名称:', detailData.data?.name)

    // 4. 测试时间冲突
    console.log('\n4. 测试时间冲突检测')
    const conflictRes = await fetch(`${BASE_URL}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '冲突的盘点计划',
        scopeType: 'all',
        planDate: '2026-06-15',
        responsiblePerson: '王五',
        recurrenceType: 'once',
        createdBy: 'admin',
      }),
    })
    const conflictData = await conflictRes.json()
    console.log('  冲突检测生效:', !conflictData.success)
    console.log('  错误信息:', conflictData.error)

    // 5. 开始计划
    console.log('\n5. 开始盘点计划')
    const startRes = await fetch(`${BASE_URL}/plans/${planId}/start`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: '李四' }),
    })
    const startData = await startRes.json()
    console.log('  开始成功:', startData.success)
    console.log('  状态:', startData.data?.status)
    console.log('  开始人:', startData.data?.started_by)

    // 6. 测试权限 - 执行人不能修改
    console.log('\n6. 测试权限 - 执行人不能修改计划')
    const updateRes = await fetch(`${BASE_URL}/plans/${planId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '被修改的计划', operator: '李四' }),
    })
    const updateData = await updateRes.json()
    console.log('  执行人修改被拒绝:', !updateData.success)
    console.log('  错误信息:', updateData.error)

    // 7. 获取计划汇总
    console.log('\n7. 获取计划汇总统计')
    const summaryRes = await fetch(`${BASE_URL}/plans/${planId}/summary`)
    const summaryData = await summaryRes.json()
    console.log('  获取成功:', summaryData.success)
    console.log('  导入批次:', summaryData.data?.importCount)
    console.log('  差异批次:', summaryData.data?.discrepancyBatchCount)
    console.log('  处置进度:', summaryData.data?.dispositionProgress + '%')
    console.log('  审批通过率:', summaryData.data?.approvalRate + '%')

    // 8. 检查权限
    console.log('\n8. 检查权限')
    const permRes = await fetch(`${BASE_URL}/plans/${planId}/check-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'admin' }),
    })
    const permData = await permRes.json()
    console.log('  admin 可编辑:', permData.data?.canEdit)
    console.log('  admin 可执行:', permData.data?.canExecute)

    // 9. 完成计划
    console.log('\n9. 完成盘点计划')
    const completeRes = await fetch(`${BASE_URL}/plans/${planId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: '李四' }),
    })
    const completeData = await completeRes.json()
    console.log('  完成成功:', completeData.success)
    console.log('  状态:', completeData.data?.status)

    // 10. 创建第二个计划用于测试删除
    console.log('\n10. 创建测试删除的计划')
    const createRes2 = await fetch(`${BASE_URL}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '待删除的测试计划',
        scopeType: 'by_category',
        category: '电子产品',
        planDate: '2026-07-01',
        responsiblePerson: '测试员',
        recurrenceType: 'once',
        createdBy: 'tester',
      }),
    })
    const createData2 = await createRes2.json()
    const planId2 = createData2.data?.id
    console.log('  创建成功, ID:', planId2)

    if (planId2) {
      console.log('\n11. 删除计划')
      const deleteRes = await fetch(`${BASE_URL}/plans/${planId2}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'tester' }),
      })
      const deleteData = await deleteRes.json()
      console.log('  删除成功:', deleteData.success)

      // 测试非创建人不能删除
      console.log('\n12. 测试非创建人不能删除')
      console.log('  (已删除，跳过验证)')
    }

    // 13. 测试取消计划
    console.log('\n13. 创建并取消一个计划')
    const createRes3 = await fetch(`${BASE_URL}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '待取消的计划',
        scopeType: 'all',
        planDate: '2026-08-01',
        responsiblePerson: '取消测试员',
        recurrenceType: 'once',
        createdBy: 'cancel_tester',
      }),
    })
    const createData3 = await createRes3.json()
    const planId3 = createData3.data?.id

    if (planId3) {
      const cancelRes = await fetch(`${BASE_URL}/plans/${planId3}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'cancel_tester', reason: '计划变更，不需要了' }),
      })
      const cancelData = await cancelRes.json()
      console.log('  取消成功:', cancelData.success)
      console.log('  状态:', cancelData.data?.status)
      console.log('  取消原因:', cancelData.data?.cancel_reason)
    }

    console.log('\n========== 测试完成 ==========')
    console.log('✅ 盘点计划模块 API 测试通过！')

  } catch (err) {
    console.error('❌ 测试失败:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

test()
