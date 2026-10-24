import {
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

export const CODE_BLOCK_TYPE = 'code-block' as const
export const PYTHON_BLOCK_TYPE = 'python-block' as const
export const TABLE_BLOCK_TYPE = 'table-block' as const
export const MAX_TABLE_ROWS = 100
export const MAX_TABLE_COLUMNS = 20
export const MAX_TABLE_CELLS = 1000
export const MAX_CELL_CHARS = 2000

export const tableCellsValidator = T.arrayOf(T.arrayOf(T.string)).check((cells) => {
  const columns = cells.reduce((max, row) => Math.max(max, row.length), 0)
  if (
    cells.length > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS ||
    cells.length * columns > MAX_TABLE_CELLS ||
    cells.some((row) => row.some((cell) => cell.length > MAX_CELL_CHARS))
  ) {
    throw new Error('Table exceeds the row, column, cell or text limit')
  }
})

export const codeBlockProps = {
  w: T.number,
  h: T.number,
  code: T.string,
  language: T.string,
}

export const pythonBlockProps = {
  w: T.number,
  h: T.number,
  code: T.string,
  output: T.string,
}

export const tableBlockProps = {
  w: T.number,
  h: T.number,
  cells: tableCellsValidator,
}

export const boardSchema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    [CODE_BLOCK_TYPE]: {
      props: codeBlockProps,
    },
    [PYTHON_BLOCK_TYPE]: {
      props: pythonBlockProps,
    },
    [TABLE_BLOCK_TYPE]: {
      props: tableBlockProps,
    },
  },
  bindings: defaultBindingSchemas,
})
