import React, { useRef, useMemo, useState, useEffect } from 'react';
import { ResumeDiff } from './ResumeDiff';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getApiBaseUrl, getApiToken } from '../utils/api-config';

// ── Markdown renderer ────────────────────────────────────────────────────────

/**
 * Minimal markdown-to-HTML renderer for preview purposes.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md);
  const lines = escaped.split('\n');
  const parts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      if (inList) {
        parts.push('</ul>');
        inList = false;
      }
      const last = parts[parts.length - 1];
      if (last && last.endsWith('</p>')) parts.push('<br />');
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) {
        parts.push('</ul>');
        inList = false;
      }
      parts.push('<hr />');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      if (inList) {
        parts.push('</ul>');
        inList = false;
      }
      const level = hMatch[1].length;
      parts.push(`<h${level}>${applyInlineFormatting(hMatch[2])}</h${level}>`);
      continue;
    }

    const bMatch = trimmed.match(/^[-•*]\s+(.*)$/);
    if (bMatch) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${applyInlineFormatting(bMatch[1])}</li>`);
      continue;
    }

    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
    parts.push(`<p>${applyInlineFormatting(raw)}</p>`);
  }

  if (inList) parts.push('</ul>');
  return parts.join('\n');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocPreview {
  title: string;
  content: string;
  originalContent?: string;
  comparisonLabel?: string;
  filename?: string;
  type: 'resume' | 'cover-letter';
}

type PreviewTab = 'rendered' | 'pdf' | 'changes';

const DocPane = ({
  doc,
  previewUrl,
  onDownload,
}: {
  doc: DocPreview;
  previewUrl: string | null;
  onDownload: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>(
    doc.type === 'resume' && doc.originalContent !== undefined ? 'changes' : 'rendered'
  );
  const [pdfError, setPdfError] = useState(false);
  const renderedHtml = useMemo(() => renderMarkdown(doc.content), [doc.content]);
  const tabs: Array<{ id: PreviewTab; label: string }> = [
    { id: 'rendered', label: 'Preview' },
    ...(doc.type === 'resume' ? [{ id: 'changes' as const, label: 'Changes' }] : []),
    ...(doc.filename ? [{ id: 'pdf' as const, label: 'PDF' }] : []),
  ];

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-(--border-subtle) bg-(--bg-secondary) shrink-0">
        <span className="text-xs font-semibold text-(--text-primary)">
          {doc.type === 'resume' ? 'Resume' : 'Cover Letter'}
        </span>
        <div className="flex items-center gap-1">
          <div
            className="flex rounded-lg bg-(--bg-tertiary) p-0.5 border border-(--border-subtle)"
            role="group"
            aria-label={`${doc.type === 'resume' ? 'Resume' : 'Cover letter'} view`}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === tab.id ? 'bg-(--bg-elevated) text-(--text-primary) shadow-sm' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
                aria-pressed={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {doc.filename && (
            <button
              onClick={onDownload}
              className="p-1.5 rounded-lg hover:bg-(--bg-tertiary) text-(--text-secondary)"
              title="Download PDF"
              aria-label="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'changes' ? (
          <ResumeDiff
            original={doc.originalContent}
            tailored={doc.content}
            comparisonLabel={doc.comparisonLabel}
          />
        ) : activeTab === 'pdf' && previewUrl && !pdfError ? (
          <embed
            src={previewUrl}
            type="application/pdf"
            className="w-full h-full"
            onError={() => setPdfError(true)}
            title={doc.title}
          />
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {activeTab === 'pdf' && (
              <p className="mb-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
                PDF unavailable. Showing the text preview instead.
              </p>
            )}
            <div
              className="prose prose-sm max-w-none text-(--text-primary)
              prose-headings:text-(--text-primary) prose-headings:font-bold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
              prose-p:text-(--text-secondary) prose-p:leading-relaxed prose-p:text-xs
              prose-li:text-(--text-secondary) prose-li:text-xs
              prose-code:text-(--accent) prose-code:bg-(--bg-tertiary) prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-a:text-(--accent) prose-a:underline prose-strong:text-(--text-primary) prose-hr:border-(--border-subtle)"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

/** Preview tailored documents, including exact line changes against their source resume. */
export const PreviewModal = ({
  docs,
  initialIndex = 0,
  onClose,
}: {
  docs: DocPreview[];
  initialIndex?: number;
  onClose: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [docIndex, setDocIndex] = useState(Math.min(initialIndex, docs.length - 1));
  const [showSplit, setShowSplit] = useState(docs.length === 2);
  const [apiBase, setApiBase] = useState('http://localhost:8088');
  const [apiToken, setApiTokenState] = useState('');
  useFocusTrap(containerRef, { onClose });

  useEffect(() => {
    getApiBaseUrl()
      .then(setApiBase)
      .catch(() => {});
    getApiToken()
      .then((token) => setApiTokenState(token || ''))
      .catch(() => {});
  }, []);

  const docUrl = (kind: 'preview' | 'download', filename?: string): string | null => {
    if (!filename) return null;
    const url = `${apiBase}/documents/${kind}/${encodeURIComponent(filename)}`;
    return apiToken ? `${url}?token=${encodeURIComponent(apiToken)}` : url;
  };
  const handleDownload = (doc: DocPreview) => {
    const url = docUrl('download', doc.filename);
    if (!url || !doc.filename) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.filename;
    link.click();
  };
  const visibleDocs = showSplit ? docs : docs.slice(docIndex, docIndex + 1);
  if (!docs.length) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in overscroll-contain"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div
        ref={containerRef}
        className={`bg-(--bg-secondary) w-full ${showSplit ? 'sm:max-w-5xl' : 'sm:max-w-3xl'} sm:rounded-xl rounded-t-xl h-[90vh] flex flex-col min-w-0 animate-slide-up sm:animate-scale-in`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-(--border-subtle) shrink-0">
          <h3
            id="preview-title"
            className="text-sm font-semibold text-(--text-primary) min-w-0 flex-1"
          >
            {showSplit ? 'Resume & Cover Letter' : docs[docIndex]?.title}
          </h3>
          <div className="flex items-center gap-1">
            {!showSplit && docs.length > 1 && (
              <>
                <button
                  onClick={() => setDocIndex((index) => index - 1)}
                  disabled={docIndex === 0}
                  className="p-1.5 disabled:opacity-30"
                  aria-label="Previous document"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-(--text-secondary)">
                  {docIndex + 1}/{docs.length}
                </span>
                <button
                  onClick={() => setDocIndex((index) => index + 1)}
                  disabled={docIndex === docs.length - 1}
                  className="p-1.5 disabled:opacity-30"
                  aria-label="Next document"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            {docs.length === 2 && (
              <button
                onClick={() => setShowSplit((split) => !split)}
                className="px-2 py-1 text-xs rounded-lg bg-(--bg-tertiary) hover:bg-(--bg-hover) text-(--text-secondary)"
              >
                {showSplit ? 'Single View' : 'Split'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-(--bg-tertiary) text-(--text-secondary)"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 min-w-0">
          {visibleDocs.map((doc) => (
            <div
              key={`${doc.type}-${doc.title}`}
              className="flex-1 min-h-0 min-w-0 border-(--border-subtle) first:border-b sm:first:border-b-0 sm:first:border-r last:border-0"
            >
              <DocPane
                doc={doc}
                previewUrl={docUrl('preview', doc.filename)}
                onDownload={() => handleDownload(doc)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
