declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'code-block': {
      w: number
      h: number
      code: string
      language: string
    }
    'python-block': {
      w: number
      h: number
      code: string
      output: string
    }
    'table-block': {
      w: number
      h: number
      cells: string[][]
    }
  }
}

export {}
