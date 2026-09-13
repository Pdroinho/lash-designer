import { Fragment, type ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={`${token}-${index}`}>{token.slice(1, -1)}</em>
    }
    return <Fragment key={`${token}-${index}`}>{token}</Fragment>
  })
}

export function LumaMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let unordered: string[] = []
  let ordered: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(paragraph.join(' '))}</p>)
    paragraph = []
  }

  const flushUnordered = () => {
    if (!unordered.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {unordered.map((item, index) => <li key={`${item}-${index}`}>{renderInline(item)}</li>)}
      </ul>,
    )
    unordered = []
  }

  const flushOrdered = () => {
    if (!ordered.length) return
    blocks.push(
      <ol key={`ol-${blocks.length}`}>
        {ordered.map((item, index) => <li key={`${item}-${index}`}>{renderInline(item)}</li>)}
      </ol>,
    )
    ordered = []
  }

  const flushAll = () => {
    flushParagraph()
    flushUnordered()
    flushOrdered()
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushAll()
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      flushAll()
      blocks.push(<h4 key={`h-${blocks.length}`} data-level={heading[1].length}>{renderInline(heading[2])}</h4>)
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      flushOrdered()
      unordered.push(bullet[1])
      continue
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      flushParagraph()
      flushUnordered()
      ordered.push(numbered[1])
      continue
    }

    flushUnordered()
    flushOrdered()
    paragraph.push(line)
  }

  flushAll()
  return <div className="luma35-markdown">{blocks}</div>
}
