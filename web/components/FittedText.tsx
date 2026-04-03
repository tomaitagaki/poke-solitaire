'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders text that shrinks to fit its container width.
 * Starts at maxSize and steps down until text fits in maxLines.
 * Falls back to CSS truncation if pretext isn't available.
 */
export function FittedText({
  text,
  maxLines = 2,
  maxSize = 16,
  minSize = 11,
  step = 1,
  className,
  as: Tag = 'p',
}: {
  text: string;
  maxLines?: number;
  maxSize?: number;
  minSize?: number;
  step?: number;
  className?: string;
  as?: 'p' | 'h3' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Measure: step down font size until content fits in maxLines
    let size = maxSize;
    el.style.fontSize = `${size}px`;

    while (size > minSize && el.scrollHeight > el.clientHeight) {
      size -= step;
      el.style.fontSize = `${size}px`;
    }

    setFontSize(size);
  }, [text, maxLines, maxSize, minSize, step]);

  const style: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: 1.25,
    display: '-webkit-box',
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    margin: 0,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  };

  return (
    <Tag ref={ref as any} className={className} style={style}>
      {text}
    </Tag>
  );
}
