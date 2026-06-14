import { Router, type Request, type Response } from 'express'
import { getUserRole, setUserRole } from '../services/dispositionService.js'

const router = Router()

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({ success: false, error: '暂未实现' })
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({ success: false, error: '暂未实现' })
})

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({ success: false, error: '暂未实现' })
})

router.get('/role', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.query.username as string
    if (!username) {
      res.status(400).json({ success: false, error: '缺少 username 参数' })
      return
    }
    const role = getUserRole(username)
    res.json({ success: true, data: role })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/role', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, role } = req.body
    if (!username || !role) {
      res.status(400).json({ success: false, error: '缺少 username 或 role 参数' })
      return
    }
    const data = setUserRole(username, role)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

export default router
