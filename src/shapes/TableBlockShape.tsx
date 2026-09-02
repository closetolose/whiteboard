import {
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { TABLE_BLOCK_TYPE } from '../../shared/schema'

export type TableBlockShape = TLShape<typeof TABLE_BLOCK_TYPE>

function createEmptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) =>
      rowIndex === 0 ? `Колонка ${colIndex + 1}` : '',
    ),
  )
}

function normalizeCells(cells: string[][]): string[][] {
  if (!cells.length) return createEmptyGrid(3, 3)
  const cols = Math.max(1, ...cells.map((row) => row.length))
  return cells.map((row) => {
    const next = [...row]
    while (next.length < cols) next.push('')
    return next.slice(0, cols)
  })
}

export class TableBlockShapeUtil extends BaseBoxShapeUtil<TableBlockShape> {
  static override type = TABLE_BLOCK_TYPE
  static override props: RecordProps<TableBlockShape> = {
    w: T.number,
    h: T.number,
    cells: T.arrayOf(T.arrayOf(T.string)),
  }

  getDefaultProps(): TableBlockShape['props'] {
    return {
      w: 480,
      h: 220,
      cells: createEmptyGrid(4, 3),
    }
  }

  override canEdit = () => true

  getIndicatorPath(shape: TableBlockShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  component(shape: TableBlockShape) {
    return <TableBlockComponent shape={shape} />
  }
}

function TableBlockComponent({ shape }: { shape: TableBlockShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const cells = normalizeCells(shape.props.cells)
  const cols = cells[0]?.length ?? 1

  function updateCells(nextCells: string[][]) {
    editor.updateShape({
      id: shape.id,
      type: TABLE_BLOCK_TYPE,
      props: { cells: normalizeCells(nextCells) },
    })
  }

  function setCell(row: number, col: number, value: string) {
    const next = cells.map((r) => [...r])
    if (!next[row]) return
    next[row]![col] = value
    updateCells(next)
  }

  function addRow() {
    updateCells([...cells, Array.from({ length: cols }, () => '')])
  }

  function addColumn() {
    updateCells(cells.map((row) => [...row, '']))
  }

  function removeLastRow(event: MouseEvent) {
    event.stopPropagation()
    if (cells.length <= 1) return
    updateCells(cells.slice(0, -1))
  }

  function removeLastColumn(event: MouseEvent) {
    event.stopPropagation()
    if (cols <= 1) return
    updateCells(cells.map((row) => row.slice(0, -1)))
  }

  function onCellKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return
    event.preventDefault()

    let nextRow = row
    let nextCol = col

    if (event.key === 'Enter') {
      nextRow = Math.min(cells.length - 1, row + (event.shiftKey ? -1 : 1))
    } else if (event.shiftKey) {
      nextCol = col - 1
      if (nextCol < 0) {
        nextCol = cols - 1
        nextRow = Math.max(0, row - 1)
      }
    } else {
      nextCol = col + 1
      if (nextCol >= cols) {
        nextCol = 0
        nextRow = Math.min(cells.length - 1, row + 1)
      }
    }

    const selector = `input[data-cell="${nextRow}-${nextCol}"]`
    const el = (
      event.currentTarget.getRootNode() as Document | ShadowRoot
    ).querySelector(selector) as HTMLInputElement | null
    el?.focus()
    el?.select()
  }

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid #c5cdd8',
          background: '#ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          pointerEvents: isEditing ? 'all' : 'none',
          fontFamily: 'system-ui, sans-serif',
        }}
        onPointerDown={
          isEditing
            ? (event) => {
                event.stopPropagation()
              }
            : undefined
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '6px 10px',
            background: '#f3f6fa',
            color: '#334155',
            fontSize: 12,
            borderBottom: '1px solid #d8dee8',
          }}
        >
          <span>
            Таблица · {cells.length}×{cols}
          </span>
          <span style={{ opacity: 0.7 }}>
            {isEditing ? 'редактирование' : 'двойной клик'}
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              height: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            <tbody>
              {cells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((value, colIndex) => {
                    const isHeader = rowIndex === 0
                    return (
                      <td
                        key={`${rowIndex}-${colIndex}`}
                        style={{
                          border: '1px solid #d0d7e2',
                          padding: 0,
                          background: isHeader ? '#eef3f9' : '#fff',
                          verticalAlign: 'middle',
                        }}
                      >
                        {isEditing ? (
                          <input
                            data-cell={`${rowIndex}-${colIndex}`}
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              setCell(rowIndex, colIndex, event.target.value)
                            }}
                            onKeyDown={(event) =>
                              onCellKeyDown(event, rowIndex, colIndex)
                            }
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              padding: '8px 10px',
                              font: 'inherit',
                              fontSize: 13,
                              fontWeight: isHeader ? 600 : 400,
                              color: '#1e293b',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              padding: '8px 10px',
                              fontSize: 13,
                              fontWeight: isHeader ? 600 : 400,
                              color: value ? '#1e293b' : '#94a3b8',
                              minHeight: 34,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {value || '—'}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isEditing ? (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              padding: '6px 8px',
              borderTop: '1px solid #d8dee8',
              background: '#f8fafc',
            }}
          >
            <button type="button" style={miniBtn} onClick={addRow}>
              + строка
            </button>
            <button type="button" style={miniBtn} onClick={addColumn}>
              + столбец
            </button>
            <button type="button" style={miniBtn} onClick={removeLastRow}>
              − строка
            </button>
            <button type="button" style={miniBtn} onClick={removeLastColumn}>
              − столбец
            </button>
          </div>
        ) : null}
      </div>
    </HTMLContainer>
  )
}

const miniBtn: CSSProperties = {
  border: '1px solid #c9d2de',
  background: '#fff',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#334155',
}
