// jsdom has no layout. ProseMirror asks for rectangles when it scrolls a selection into view; give
// it empty ones. Test-only.
export function stubEditorLayout(): void {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }
  Range.prototype.getBoundingClientRect = () => rect as DOMRect
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* empty() {} }) as unknown as DOMRectList
  if (!document.elementFromPoint) document.elementFromPoint = () => null
}
