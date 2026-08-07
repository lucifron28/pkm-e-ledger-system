"use client";

import { useEffect, useRef, useCallback } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseModalFocusOptions {
  isOpen: boolean;
  onClose?: () => void;
}

export function useModalFocus({ isOpen, onClose }: UseModalFocusOptions) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        previousActiveElement.current = document.activeElement as HTMLElement | null;
        wasOpenRef.current = true;
      }
      const timer = setTimeout(() => {
        if (initialFocusRef.current) {
          initialFocusRef.current.focus();
        } else if (containerRef.current) {
          const focusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            containerRef.current.focus();
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    } else {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const target = previousActiveElement.current || triggerRef.current;
        if (target && typeof target.focus === "function") {
          target.focus();
        }
      }
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab" && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [onClose]
  );

  return {
    triggerRef,
    containerRef,
    initialFocusRef,
    handleKeyDown,
  };
}
