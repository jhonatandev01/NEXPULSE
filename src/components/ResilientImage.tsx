import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackIcon?: React.ReactNode;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
  fallbackIcon,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`bg-gradient-to-br from-[#131E34] via-[#0C1324] to-[#080D18] flex flex-col items-center justify-center gap-1.5 text-slate-400 ${className}`}
      >
        {fallbackIcon ?? <ImageOff className="w-5 h-5 text-sky-400/70" aria-hidden="true" />}
        {fallbackTitle && (
          <span className="text-[11px] font-medium text-slate-300 px-2 text-center truncate max-w-full">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
