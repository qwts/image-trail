import { useLayoutEffect, useRef } from 'react';

export function WorkspaceDomBody({ content }: { readonly content: HTMLElement }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren(content);
    return () => {
      if (content.parentElement === host) content.remove();
    };
  }, [content]);
  return <div ref={hostRef} className="image-trail-workspace__dom-body" />;
}
