import express from 'express'

const router = express.Router()

router.get('/', (_req, res) => {
  console.log('Hello World')
  res.status(200).type('text/plain').send('Hello World')
})

export default router
