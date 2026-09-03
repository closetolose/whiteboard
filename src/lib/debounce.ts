import { useEffect, useRef, type RefObject } from 'react'

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const debounced = useRef((...args: A) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      callbackRef.current(...args)
    }, delayMs)
  })

  return debounced.current
}

export function useFlushOnBlur(
  flush: () => void,
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    if (!enabled) return
    const node = containerRef.current
    if (!node) return

    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget
      if (next instanceof Node && node!.contains(next)) return
      flushRef.current()
    }

    node.addEventListener('focusout', onFocusOut)
    return () => node.removeEventListener('focusout', onFocusOut)
  }, [containerRef, enabled])
}
