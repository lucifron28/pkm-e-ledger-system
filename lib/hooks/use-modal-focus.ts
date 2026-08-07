"use client";

import { useEffect, useRef, useCallback } from "react";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseModalFocusOptions {
  isOpen: boolean;
  isPending?: boolean;
  onClose?: () => void;
}

export function shouldAllowModalClose(isOpen: boolean, isPending: boolean | undefined, key: string): boolean {
  if (!isOpen) return false;
  if (key === "Escape" && isPending) return false;
  return key === "Escape";
}

export function getNextFocusTarget(
  focusables: HTMLElement[],
  activeElement: HTMLElement | null,
  shiftKey: boolean
): HTMLElement | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (shiftKey) {
    if (activeElement === first || !activeElement || !focusables.includes(activeElement)) {
      return last;
    }
  } else {
    if (activeElement === last || !activeElement || !focusables.includes(activeElement)) {
      return first;
    }
  }
  return null;
}

export function useModalFocus({ isOpen, isPending, onClose }: UseModalFocusOptions) {
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
      if (e.key === "Escape") {
        if (isPending) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (onClose) {
          e.stopPropagation();
          onClose();
          return;
        }
      }

      if (e.key === "Tab" && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        const target = getNextFocusTarget(focusables, document.activeElement as HTMLElement | null, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    },
    [isPending, onClose]
  );

  return {
    triggerRef,
    containerRef,
    initialFocusRef,
    handleKeyDown,
  };
}
