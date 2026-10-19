import * as React from 'react';

/** Bold (**text**) and inline code (`text`); everything else stays plain text. */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded bg-background/60 px-1 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

type Block =
  | {type: 'paragraph'; lines: string[]}
  | {type: 'list'; ordered: boolean; items: string[]};

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '');
    const last = blocks.at(-1);
    const ordered = NUMBERED.test(line);
    if (BULLET.test(line) || ordered) {
      const item = line.replace(ordered ? NUMBERED : BULLET, '');
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({type: 'list', ordered, items: [item]});
    } else if (!line.trim()) {
      blocks.push({type: 'paragraph', lines: []});
    } else if (last?.type === 'paragraph') {
      last.lines.push(line);
    } else {
      blocks.push({type: 'paragraph', lines: [line]});
    }
  }
  return blocks.filter((block) => block.type === 'list' || block.lines.length > 0);
}

/**
 * Renders the simple markdown the coach writes (paragraphs, bullet and
 * numbered lists, bold) as React elements, never as HTML.
 */
export function ChatMarkdown({text}: {text: string}) {
  return (
    <div className="space-y-2">
      {toBlocks(text).map((block, index) => {
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={index}
              className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
