import {
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

export const CODE_BLOCK_TYPE = 'code-block' as const
export const PYTHON_BLOCK_TYPE = 'python-block' as const
export const TABLE_BLOCK_TYPE = 'table-block' as const

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
  cells: T.arrayOf(T.arrayOf(T.string)),
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
