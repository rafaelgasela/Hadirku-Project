import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function initDatabase() {
  console.log('🔄 Menghubungkan ke MySQL...')
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT) || 3306
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const dbName = process.env.DB_NAME || 'hadirku_db'

  // Connection without database to ensure DB exists
  const conn = await mysql.createConnection({ host, port, user, password })
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()

  // Connection with database
  const db = await mysql.createConnection({ host, port, user, password, database: dbName, multipleStatements: true })
  const schemaPath = path.resolve(__dirname, '../schema.sql')
  if (fs.existsSync(schemaPath)) {
    console.log('📄 Menerapkan schema.sql ke MySQL...')
    const sql = fs.readFileSync(schemaPath, 'utf8')
    await db.query(sql)
    console.log('✅ Skema tabel MySQL berhasil diterapkan!')
  }
  await db.end()
}

// If run directly: node src/initDb.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDatabase()
    .then(() => {
      console.log('🎉 Inisialisasi database selesai!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('❌ Gagal inisialisasi database:', err)
      process.exit(1)
    })
}
