import { randomId } from './randomId'

const COLORS = [
  '#E03131',
  '#F08C00',
  '#2F9E44',
  '#1971C2',
  '#9C36B5',
  '#0CA678',
  '#E8590C',
  '#7048E8',
]

const NAMES = [
  'Ученик',
  'Студент',
  'Препод',
  'Гость',
  'Художник',
  'Кодер',
  'Лиса',
  'Кот',
]

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export type BoardUser = {
  id: string
  name: string
  color: string
}

export function getOrCreateUser(): BoardUser {
  const key = 'whiteboard-user'
  const existing = localStorage.getItem(key)
  if (existing) {
    try {
      return JSON.parse(existing) as BoardUser
    } catch {
      // ignore
    }
  }

  const user: BoardUser = {
    id: randomId(),
    name: `${randomItem(NAMES)}-${Math.floor(Math.random() * 90 + 10)}`,
    color: randomItem(COLORS),
  }
  localStorage.setItem(key, JSON.stringify(user))
  return user
}
