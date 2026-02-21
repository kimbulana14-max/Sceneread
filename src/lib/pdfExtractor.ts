// PDF Page Extraction using PDF.js and pdf-lib
// Extracts specific pages from a PDF file client-side before uploading

import { PDFDocument } from 'pdf-lib'

let pdfjsLib: typeof import('pdfjs-dist') | null = null
let workerInitialized = false

async function getPdfJs() {
  if (pdfjsLib && workerInitialized) return pdfjsLib
  
  if (typeof window === 'undefined') {
    throw new Error('PDF.js can only be used in browser')
  }
  
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  workerInitialized = true
  
  console.log('[PDF.js] Version:', pdfjsLib.version)
  return pdfjsLib
}

export interface PDFInfo {
  totalPages: number
  title?: string
}

export interface DetectedScene {
  id: string
  heading: string
  pageNumber: number
  startLine: number
  preview: string
  fullText: string
}

export interface PDFPreview {
  totalPages: number
  title?: string
  scenes: DetectedScene[]
  fullText: string
}

async function extractPageText(pdf: any, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  
  let lastY: number | null = null
  let pageText = ''
  
  for (const item of textContent.items) {
    const textItem = item as any
    if (!textItem.str) continue
    
    const currentY = textItem.transform?.[5]
    if (lastY !== null && currentY !== undefined && Math.abs(currentY - lastY) > 5) {
      pageText += '\n'
    } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
      pageText += ' '
    }
    
    pageText += textItem.str
    lastY = currentY
  }
  
  return pageText.trim()
}

/**
 * Detect scene headings - very flexible matching
 */
function detectScenes(fullText: string, pageTexts: { pageNum: number; text: string }[]): DetectedScene[] {
  const scenes: DetectedScene[] = []
  
  // Build page position map
  let charOffset = 0
  const pageRanges: { pageNum: number; start: number; end: number }[] = []
  for (const pt of pageTexts) {
    pageRanges.push({ pageNum: pt.pageNum, start: charOffset, end: charOffset + pt.text.length })
    charOffset += pt.text.length + 2
  }
  
  const lines = fullText.split('\n')
  let currentCharPos = 0
  
  // Track found headings to avoid duplicates
  const foundHeadings = new Set<string>()
  
  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.length < 5) {
      currentCharPos += line.length + 1
      return
    }
    
    // Check various scene heading patterns
    let isSceneHeading = false
    
    // 1. Standard INT./EXT. format (most common)
    if (/^(?:\d+[\.\s]+)?(?:INT|EXT|I\/E|INT\/EXT)[\.\s\-]/i.test(trimmedLine)) {
      isSceneHeading = true
    }
    // 2. Scene with number prefix like "1 INT." or "23. EXT."  
    else if (/^\d+[\.\s]+(?:INT|EXT)/i.test(trimmedLine)) {
      isSceneHeading = true
    }
    // 3. "SCENE X" format
    else if (/^SCENE\s*[\d\:]/i.test(trimmedLine)) {
      isSceneHeading = true
    }
    // 4. Location with time of day (KITCHEN - DAY, BEDROOM - NIGHT)
    else if (/^[A-Z][A-Z\s\'\-\.]+\s*[\-–—]\s*(?:DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|LATER|CONTINUOUS|SAME|MOMENTS)/i.test(trimmedLine)) {
      isSceneHeading = true
    }
    // 5. All caps line that looks like a location (at least 2 words, ends with common time markers)
    else if (/^[A-Z][A-Z\s\'\-\.\,\/]+(?:DAY|NIGHT|MORNING|EVENING|CONTINUOUS)$/i.test(trimmedLine) && trimmedLine.length > 10) {
      isSceneHeading = true
    }
    
    // Avoid duplicates (same heading text)
    const headingKey = trimmedLine.toLowerCase().substring(0, 50)
    if (isSceneHeading && !foundHeadings.has(headingKey)) {
      foundHeadings.add(headingKey)
      
      // Find which page
      const pageInfo = pageRanges.find(pr => currentCharPos >= pr.start && currentCharPos < pr.end)
      const pageNum = pageInfo?.pageNum || 1
      
      // Get preview lines
      const previewLines: string[] = []
      for (let i = lineIndex + 1; i < lines.length && previewLines.length < 5; i++) {
        const previewLine = lines[i].trim()
        if (previewLine && previewLine.length > 2) {
          previewLines.push(previewLine)
        }
      }
      
      // Get full scene text
      const sceneLines: string[] = [trimmedLine]
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const nextLine = lines[i]
        const nextTrimmed = nextLine.trim()
        
        // Check if next line is a new scene
        if (nextTrimmed.length > 5) {
          const isNextScene = 
            /^(?:\d+[\.\s]+)?(?:INT|EXT|I\/E|INT\/EXT)[\.\s\-]/i.test(nextTrimmed) ||
            /^SCENE\s*[\d\:]/i.test(nextTrimmed) ||
            /^[A-Z][A-Z\s\'\-\.]+\s*[\-–—]\s*(?:DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|LATER|CONTINUOUS|SAME)/i.test(nextTrimmed)
          
          if (isNextScene && !foundHeadings.has(nextTrimmed.toLowerCase().substring(0, 50))) {
            break
          }
        }
        sceneLines.push(nextLine)
      }
      
      scenes.push({
        id: `scene_${scenes.length}`,
        heading: trimmedLine.length > 60 ? trimmedLine.substring(0, 60) + '...' : trimmedLine,
        pageNumber: pageNum,
        startLine: lineIndex + 1,
        preview: previewLines.slice(0, 3).join(' · ').substring(0, 100) || 'No preview available',
        fullText: sceneLines.join('\n').trim()
      })
      
      console.log(`[PDF] Found scene: "${trimmedLine.substring(0, 50)}" on page ${pageNum}`)
    }
    
    currentCharPos += line.length + 1
  })
  
  // If still no scenes, create page-based chunks
  if (scenes.length === 0) {
    console.log('[PDF] No scenes detected, creating page chunks')
    
    const chunkSize = Math.max(1, Math.ceil(pageTexts.length / 10)) // ~10 chunks max
    for (let i = 0; i < pageTexts.length; i += chunkSize) {
      const startPage = pageTexts[i].pageNum
      const endIdx = Math.min(i + chunkSize - 1, pageTexts.length - 1)
      const endPage = pageTexts[endIdx].pageNum
      
      const sectionText = pageTexts.slice(i, i + chunkSize).map(p => p.text).join('\n\n')
      const preview = sectionText.replace(/\s+/g, ' ').substring(0, 100)
      
      scenes.push({
        id: `pages_${startPage}_${endPage}`,
        heading: startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}-${endPage}`,
        pageNumber: startPage,
        startLine: 1,
        preview: preview + '...',
        fullText: sectionText
      })
    }
  }
  
  console.log(`[PDF] Total scenes/sections: ${scenes.length}`)
  return scenes
}

export async function getPDFInfo(file: File): Promise<PDFInfo> {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  
  let title: string | undefined
  try {
    const metadata = await pdf.getMetadata()
    title = (metadata?.info as any)?.Title || undefined
  } catch (e) {}
  
  return { totalPages: pdf.numPages, title }
}

export async function getPDFPreview(
  file: File,
  onProgress?: (currentPage: number, totalPages: number) => void
): Promise<PDFPreview> {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let title: string | undefined
  try {
    const metadata = await pdf.getMetadata()
    title = (metadata?.info as any)?.Title || undefined
  } catch (e) {}

  const totalPages = pdf.numPages
  console.log('[PDF] Extracting', totalPages, 'pages...')

  // Process pages in parallel batches for speed
  const BATCH_SIZE = 8
  const pageTexts: { pageNum: number; text: string }[] = []

  for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages)
    const batch: Promise<{ pageNum: number; text: string }>[] = []

    for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
      batch.push(
        extractPageText(pdf, pageNum).then(text => ({ pageNum, text }))
      )
    }

    const results = await Promise.all(batch)
    pageTexts.push(...results)

    if (onProgress) {
      onProgress(batchEnd, totalPages)
    }
  }

  // Sort by page number (parallel execution may return out of order)
  pageTexts.sort((a, b) => a.pageNum - b.pageNum)

  const fullText = pageTexts.map(p => p.text).join('\n\n')
  console.log('[PDF] Extracted', fullText.length, 'chars from', totalPages, 'pages')

  const scenes = detectScenes(fullText, pageTexts)

  return { totalPages, title, scenes, fullText }
}

export async function extractPagesFromPDF(file: File, startPage: number, endPage: number): Promise<string> {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  
  const actualStart = Math.max(1, startPage)
  const actualEnd = Math.min(pdf.numPages, endPage)
  
  const pages: string[] = []
  for (let pageNum = actualStart; pageNum <= actualEnd; pageNum++) {
    const text = await extractPageText(pdf, pageNum)
    if (text) pages.push(text)
  }
  
  return pages.join('\n\n')
}

export async function extractAllPagesFromPDF(file: File): Promise<string> {
  const info = await getPDFInfo(file)
  return extractPagesFromPDF(file, 1, info.totalPages)
}

export function extractScenesByIds(scenes: DetectedScene[], selectedIds: string[]): string {
  return scenes.filter(s => selectedIds.includes(s.id)).map(s => s.fullText).join('\n\n')
}

/**
 * Extract specific pages from a PDF into a NEW PDF file
 * Uses pdf-lib to copy pages byte-for-byte (no text interpretation)
 * This preserves all formatting and lets n8n handle text extraction
 */
export async function extractPagesAsPDF(file: File, startPage: number, endPage: number): Promise<File> {
  console.log(`[pdf-lib] Extracting pages ${startPage}-${endPage} from ${file.name}`)
  
  const arrayBuffer = await file.arrayBuffer()
  const sourcePdf = await PDFDocument.load(arrayBuffer)
  const totalPages = sourcePdf.getPageCount()
  
  // Create new PDF document
  const newPdf = await PDFDocument.create()
  
  // pdf-lib uses 0-based indexing
  const startIdx = Math.max(0, startPage - 1)
  const endIdx = Math.min(totalPages - 1, endPage - 1)
  
  console.log(`[pdf-lib] Source has ${totalPages} pages, copying indices ${startIdx}-${endIdx}`)
  
  // Build array of page indices to copy
  const pageIndices: number[] = []
  for (let i = startIdx; i <= endIdx; i++) {
    pageIndices.push(i)
  }
  
  // Copy pages from source to new PDF
  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices)
  copiedPages.forEach(page => newPdf.addPage(page))
  
  // Save to bytes
  const pdfBytes = await newPdf.save()
  
  // Create new File object with descriptive name
  const baseName = file.name.replace(/\.pdf$/i, '')
  const newFileName = `${baseName}_pages_${startPage}-${endPage}.pdf`
  
  console.log(`[pdf-lib] Created ${newFileName} (${pdfBytes.length} bytes, ${pageIndices.length} pages)`)
  
  // Convert Uint8Array to ArrayBuffer for File constructor compatibility
  const outputBuffer = new ArrayBuffer(pdfBytes.length)
  new Uint8Array(outputBuffer).set(pdfBytes)
  return new File([outputBuffer], newFileName, { type: 'application/pdf' })
}
