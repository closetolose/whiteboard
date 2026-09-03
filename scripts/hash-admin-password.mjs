import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

async function main() {
  const password = process.argv[2] ?? (await promptHidden('Admin password: '))

  if (!password || password.length < 4) {
    console.error('Password must be at least 4 characters')
    process.exit(1)
  }

  const hash = bcrypt.hashSync(password, 12)
  console.log('\nAdd to .env on the server:\n')
  console.log(`ADMIN_PASSWORD_HASH=${hash}`)
}

async function promptHidden(label) {
  const rl = createInterface({ input, output })
  const value = await rl.question(label)
  rl.close()
  return value
}

void main()
