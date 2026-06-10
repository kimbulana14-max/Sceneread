// Client-side text extraction for non-PDF script formats.
//
// The upload pipeline only understands PDFs (extracted server-side in n8n) and
// raw pasted text. Word docs, plain text, and screenwriting formats were
// accepted by the file picker but never parsed — they reached n8n with an empty
// body, so no lines were created. This module extracts their text in the
// browser so it can be sent through the existing rawText path.

// .docx → mammoth (browser build). Imported lazily so it never weighs down the
// initial bundle or runs during SSR.
async function extractDocx(file: File): Promise<string> {
  // 'mammoth' has a package "browser" field that bundlers resolve to the
  // browser build automatically, and it ships its own types.
  const mod = await import('mammoth')
  const mammoth = (mod as any).default || mod
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

// .fdx (Final Draft) is XML. Pull text out of <Paragraph><Text> nodes, and
// prefix character cues so the downstream parser keeps speaker structure.
function extractFdx(xml: string): string {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return ''
    const paras = Array.from(doc.getElementsByTagName('Paragraph'))
    if (paras.length === 0) {
      // Not the expected schema — fall back to stripping all tags.
      return xml.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim()
    }
    const lines: string[] = []
    for (const p of paras) {
      const type = p.getAttribute('Type') || ''
      const text = Array.from(p.getElementsByTagName('Text'))
        .map((t) => t.textContent || '')
        .join('')
        .trim()
      if (!text) continue
      // Character cues are their own paragraph type; keep them on their own line
      // (uppercased) so speaker detection downstream still works.
      if (type === 'Character') lines.push('\n' + text.toUpperCase())
      else if (type === 'Scene Heading') lines.push('\n' + text)
      else lines.push(text)
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return ''
  }
}

const TEXT_EXTS = ['txt', 'fountain', 'fountaintext', 'text', 'md']

/**
 * True when this file is a non-PDF document format we can extract client-side.
 */
export function isExtractableDoc(file: File): boolean {
  const name = file.name.toLowerCase()
  const ext = name.split('.').pop() || ''
  if (ext === 'docx' || ext === 'fdx') return true
  if (TEXT_EXTS.includes(ext)) return true
  if (file.type === 'text/plain') return true
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  return false
}

/**
 * Extract plain text from a .docx, .txt, .fountain, or .fdx file. Returns '' on
 * failure (caller can then fall back to sending the file or surfacing an error).
 * Note: legacy binary .doc is NOT supported by mammoth — handled by the caller.
 */
export async function extractTextFromDoc(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const ext = name.split('.').pop() || ''
  try {
    if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return (await extractDocx(file)).trim()
    }
    if (ext === 'fdx') {
      return extractFdx(await file.text())
    }
    if (TEXT_EXTS.includes(ext) || file.type === 'text/plain') {
      return (await file.text()).trim()
    }
  } catch (e) {
    console.warn('[docExtractor] failed to extract', file.name, e)
  }
  return ''
}
