import React from 'react';

interface AgentMarkdownProps {
  text: string;
  compact?: boolean;
}

function renderInlineBold(line: string): React.ReactNode[] {
  const segments = line.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, idx) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{seg}</React.Fragment>;
  });
}

export const AgentMarkdown: React.FC<AgentMarkdownProps> = ({ text, compact = false }) => {
  const lines = text.split(/\r?\n/);

  return (
    <div className={compact ? 'space-y-1.5 text-xs text-slate-200 leading-relaxed' : 'space-y-2 text-[13px] text-slate-200 leading-relaxed'}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={index} className="h-1" aria-hidden="true" />;
        }

        if (line.startsWith('>')) {
          const clean = line.replace(/^>\s*/, '');
          return (
            <div
              key={index}
              className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            >
              {renderInlineBold(clean)}
            </div>
          );
        }

        if (/^[-*]\s+/.test(line)) {
          const clean = line.replace(/^[-*]\s+/, '');
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{renderInlineBold(clean)}</span>
            </div>
          );
        }

        const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={index} className="flex items-start gap-2 pl-0.5">
              <span className="font-mono text-[11px] font-bold text-sky-300 mt-0.5 shrink-0">
                {numMatch[1]}.
              </span>
              <span className="min-w-0 flex-1">{renderInlineBold(numMatch[2])}</span>
            </div>
          );
        }

        if (/^#{1,3}\s+/.test(line)) {
          const heading = line.replace(/^#{1,3}\s+/, '');
          return (
            <div key={index} className="font-display font-semibold text-white pt-1">
              {renderInlineBold(heading)}
            </div>
          );
        }

        return <p key={index}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
};
