import { useEffect, useRef, useState } from 'react';

interface UseIntersectionOptions extends IntersectionObserverInit {
  freezeOnceVisible?: boolean;
}

export function useIntersection<T extends Element>(
  options: UseIntersectionOptions = {},
): [React.RefObject<T | null>, boolean] {
  const { freezeOnceVisible = false, ...observerOptions } = options;
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (freezeOnceVisible && isVisible) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setIsVisible(entry.isIntersecting);
    }, observerOptions);

    observer.observe(element);
    return () => observer.disconnect();
  }, [freezeOnceVisible, isVisible, observerOptions]);

  return [ref, isVisible];
}
