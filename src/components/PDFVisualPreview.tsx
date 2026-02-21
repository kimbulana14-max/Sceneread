// PDF Visual Preview - Clean and Simple
// Thumbnails with tap-to-preview, checkbox to select

'use client'

import { useState, useEffect } from 'react'

interface PDFVisualPreviewProps {
  file: File
  onPagesSelect?: (pages: number[]) => void
  selectedPages?: number[]
  mode: 'select-text' | 'select-pages'
}

interface PageThumb {
  pageNum: number
  url: string
  fullUrl?: string
}

export function PDFVisualPreview({ 
  file, 
  onPagesSelect,
  selectedPages = [],
  mode 
}: PDFVisualPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState('')
  const [thumbnails, setThumbnails] = useState<PageThumb[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [previewPage, setPreviewPage] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  
  // For select-text mode: current page viewing
  const [currentViewPage, setCurrentViewPage] = useState(1)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [renderingPage, setRenderingPage] = useState(false)

  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file)
    setPdfUrl(url)
    
    async function init() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
        
        if (cancelled) return
        
        setTotalPages(pdf.numPages)
        setPdfDoc(pdf)
        
        if (mode === 'select-pages') {
          const thumbs = await renderThumbnails(pdf, 1, Math.min(12, pdf.numPages))
          if (!cancelled) setThumbnails(thumbs)
        }
        
        setLoading(false)
      } catch (err) {
        console.error('PDF error:', err)
        setLoading(false)
      }
    }
    
    init()
    return () => { 
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file, mode])

  // Render current page for select-text mode
  useEffect(() => {
    if (mode !== 'select-text' || !pdfDoc) return
    
    const renderPage = async () => {
      setRenderingPage(true)
      try {
        const page = await pdfDoc.getPage(currentViewPage)
        const viewport = page.getViewport({ scale: 2 }) // High quality
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        setPageUrl(canvas.toDataURL('image/jpeg', 0.9))
      } catch (err) {
        console.error('Page render error:', err)
      }
      setRenderingPage(false)
    }
    
    renderPage()
  }, [pdfDoc, currentViewPage, mode])

  async function renderThumbnails(pdf: any, start: number, end: number): Promise<PageThumb[]> {
    const results: PageThumb[] = []
    for (let i = start; i <= end && i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 0.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        results.push({ pageNum: i, url: canvas.toDataURL('image/jpeg', 0.7) })
      } catch (err) {
        console.error('Thumbnail error:', err)
      }
    }
    return results
  }

  async function loadMore() {
    if (!pdfDoc || loadingMore || thumbnails.length >= totalPages) return
    setLoadingMore(true)
    const more = await renderThumbnails(pdfDoc, thumbnails.length + 1, Math.min(thumbnails.length + 12, totalPages))
    setThumbnails(prev => [...prev, ...more])
    setLoadingMore(false)
  }

  // Open full preview
  async function openPreview(pageNum: number) {
    if (!pdfDoc) return
    
    setPreviewPage(pageNum)
    setLoadingPreview(true)
    
    try {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 }) // High quality
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.9))
    } catch (err) {
      console.error('Preview error:', err)
    }
    
    setLoadingPreview(false)
  }

  const closePreview = () => {
    setPreviewPage(null)
    setPreviewUrl(null)
  }

  const togglePage = (pageNum: number, e: React.MouseEvent) => {
    e.stopPropagation() // Don't open preview when clicking checkbox
    if (!onPagesSelect) return
    const newSel = selectedPages.includes(pageNum)
      ? selectedPages.filter(p => p !== pageNum)
      : [...selectedPages, pageNum].sort((a, b) => a - b)
    onPagesSelect(newSel)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  // === CUSTOM TEXT MODE - Canvas-based PDF viewer (works on mobile) ===
  if (mode === 'select-text') {
    return (
      <div className="space-y-3">
        {/* Page navigation header */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setCurrentViewPage(p => Math.max(1, p - 1))}
            disabled={currentViewPage <= 1}
            className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center text-text-muted disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-text-muted text-xs">
            Page {currentViewPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentViewPage(p => Math.min(totalPages, p + 1))}
            disabled={currentViewPage >= totalPages}
            className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center text-text-muted disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        {/* Rendered PDF page */}
        <div className="rounded-lg overflow-hidden border border-border bg-white relative" style={{ maxHeight: '350px', overflow: 'auto' }}>
          {renderingPage ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pageUrl ? (
            <img 
              src={pageUrl} 
              alt={`Page ${currentViewPage}`} 
              className="w-full h-auto"
              style={{ userSelect: 'none' }}
            />
          ) : (
            <div className="flex items-center justify-center py-20 text-text-muted text-sm">
              Unable to load page
            </div>
          )}
        </div>
        
        {/* Instructions */}
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 text-center">
          <p className="text-accent text-xs font-medium mb-1">📋 How to select text:</p>
          <p className="text-text-muted text-[10px]">
            Open the original PDF on your device, select the dialogue you want, copy it, then paste in the text box below.
          </p>
        </div>
      </div>
    )
  }

  // === PAGE SELECT MODE ===
  return (
    <div className="space-y-3">
      {/* Full page preview modal */}
      {previewPage !== null && (
        <div 
          className="fixed inset-0 bg-bg/95 z-50 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          {/* Close button */}
          <button 
            onClick={closePreview}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* Page number */}
          <div className="absolute top-4 left-4 bg-white/10 text-white px-3 py-1.5 rounded-full text-sm font-medium">
            Page {previewPage} of {totalPages}
          </div>
          
          {/* Navigation arrows */}
          {previewPage > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); openPreview(previewPage - 1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          
          {previewPage < totalPages && (
            <button
              onClick={(e) => { e.stopPropagation(); openPreview(previewPage + 1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          
          {/* Select/Deselect button */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePage(previewPage, e) }}
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-medium text-sm transition-all ${
              selectedPages.includes(previewPage)
                ? 'bg-accent text-white'
                : 'bg-white text-gray-900'
            }`}
          >
            {selectedPages.includes(previewPage) ? '✓ Selected' : 'Select This Page'}
          </button>
          
          {/* Preview image */}
          <div className="max-w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {loadingPreview ? (
              <div className="w-64 h-96 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-text-subtle border-t-transparent rounded-full animate-spin" />
              </div>
            ) : previewUrl ? (
              <img 
                src={previewUrl} 
                alt={`Page ${previewPage}`}
                className="max-h-[80vh] w-auto rounded-lg shadow-2xl"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-xs">{totalPages} pages · Tap to preview</span>
        <div className="flex gap-3 text-xs">
          <button onClick={() => onPagesSelect?.(Array.from({ length: totalPages }, (_, i) => i + 1))} className="text-accent">
            Select All
          </button>
          <button onClick={() => onPagesSelect?.([])} className="text-text-muted">
            Clear
          </button>
        </div>
      </div>

      {/* Thumbnails grid */}
      <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-0.5">
        {thumbnails.map((thumb) => {
          const isSelected = selectedPages.includes(thumb.pageNum)
          return (
            <div
              key={thumb.pageNum}
              className="relative rounded-lg overflow-hidden ring-1 ring-border"
            >
              {/* Clickable thumbnail area - opens preview */}
              <div 
                onClick={() => openPreview(thumb.pageNum)}
                className="cursor-pointer active:scale-95 transition-transform"
              >
                <img src={thumb.url} alt={`Page ${thumb.pageNum}`} className="w-full bg-white" draggable={false} />
                
                {/* Page number */}
                <div className="absolute bottom-1 left-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">
                  {thumb.pageNum}
                </div>
              </div>
              
              {/* Selection checkbox - separate click target */}
              <div
                onClick={(e) => togglePage(thumb.pageNum, e)}
                className={`absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all ${
                  isSelected 
                    ? 'bg-accent' 
                    : 'bg-black/40 hover:bg-black/60'
                }`}
              >
                {isSelected ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-3.5 h-3.5 rounded border-2 border-text-muted" />
                )}
              </div>
              
              {/* Selection overlay */}
              {isSelected && <div className="absolute inset-0 bg-accent/15 pointer-events-none rounded-lg ring-2 ring-accent" />}
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {thumbnails.length < totalPages && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-2 text-xs text-accent bg-accent/10 rounded-lg border border-accent/20"
        >
          {loadingMore ? 'Loading...' : `Load More (${totalPages - thumbnails.length})`}
        </button>
      )}

      {/* Selection summary */}
      {selectedPages.length > 0 && (
        <div className="bg-accent/10 rounded-lg p-2.5 text-center">
          <span className="text-accent text-sm font-medium">
            {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''} selected
          </span>
          {selectedPages.length <= 8 && (
            <span className="text-accent/70 text-xs ml-2">
              ({selectedPages.join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default PDFVisualPreview
