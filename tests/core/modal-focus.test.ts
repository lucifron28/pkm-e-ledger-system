import test from "node:test";
import assert from "node:assert/strict";

// Simulated DOM focus state machine matching useModalFocus invariants
class ModalFocusTracker {
  private isOpen = false;
  private wasOpen = false;
  private activeElement: string | null = "trigger-btn";
  private focusedElement: string | null = null;
  private triggerId = "trigger-btn";
  private initialFocusId = "close-btn";

  constructor() {}

  public getIsOpen() {
    return this.isOpen;
  }

  public setOpen(open: boolean) {
    if (open) {
      if (!this.wasOpen) {
        this.wasOpen = true;
      }
      // On opening, focus initial element inside modal
      this.focusedElement = this.initialFocusId;
      this.isOpen = true;
    } else {
      if (this.wasOpen) {
        this.wasOpen = false;
        // On closing (only after being open), restore focus to trigger
        this.focusedElement = this.triggerId;
      }
      this.isOpen = false;
    }
  }

  public getFocusedElement() {
    return this.focusedElement;
  }

  public handleKey(key: string): boolean {
    if (this.isOpen && key === "Escape") {
      this.setOpen(false);
      return true;
    }
    return false;
  }
}

test("Modal Focus: Initial mount with isOpen=false does NOT steal focus", () => {
  const tracker = new ModalFocusTracker();
  assert.equal(tracker.getIsOpen(), false);
  assert.equal(tracker.getFocusedElement(), null);
});

test("Modal Focus: Opening modal sets focus to initial dialog element", () => {
  const tracker = new ModalFocusTracker();
  tracker.setOpen(true);
  assert.equal(tracker.getIsOpen(), true);
  assert.equal(tracker.getFocusedElement(), "close-btn");
});

test("Modal Focus: Closing modal restores focus to trigger element", () => {
  const tracker = new ModalFocusTracker();
  tracker.setOpen(true);
  assert.equal(tracker.getFocusedElement(), "close-btn");
  tracker.setOpen(false);
  assert.equal(tracker.getIsOpen(), false);
  assert.equal(tracker.getFocusedElement(), "trigger-btn");
});

test("Modal Focus: Escape key closes active modal and restores focus", () => {
  const tracker = new ModalFocusTracker();
  tracker.setOpen(true);
  const handled = tracker.handleKey("Escape");
  assert.equal(handled, true);
  assert.equal(tracker.getIsOpen(), false);
  assert.equal(tracker.getFocusedElement(), "trigger-btn");
});
