import { useEffect } from 'react';

export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let restingHeight = window.innerHeight;
    let width = window.innerWidth;
    const update = () => {
      const mobile = window.innerWidth < 768;
      const editing = document.activeElement?.closest('.chat-composer') != null;
      if (!editing || width !== window.innerWidth) restingHeight = window.innerHeight;
      width = window.innerWidth;
      document.documentElement.style.setProperty('--chat-height', mobile ? `${viewport.height}px` : '100dvh');
      document.documentElement.toggleAttribute('data-keyboard', mobile && editing && restingHeight - viewport.height > 140);
    };
    update();
    viewport.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => { viewport.removeEventListener('resize', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); document.documentElement.removeAttribute('data-keyboard'); document.documentElement.style.removeProperty('--chat-height'); };
  }, []);
}
