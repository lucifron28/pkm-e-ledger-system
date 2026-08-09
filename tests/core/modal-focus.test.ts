import test from "node:test";
import assert from "node:assert/strict";
import { getNextFocusTarget, shouldAllowModalClose } from "../../lib/hooks/use-modal-focus";

test("Modal Focus Production Logic: initial mount with isOpen=false ignores Escape", () => {
  assert.equal(shouldAllowModalClose(false, false, "Escape"), false);
});

test("Modal Focus Production Logic: Escape key allows close when open and not pending", () => {
  assert.equal(shouldAllowModalClose(true, false, "Escape"), true);
});

test("Modal Focus Production Logic: Escape key PREVENTS close when isPending=true", () => {
  assert.equal(shouldAllowModalClose(true, true, "Escape"), false);
});

test("Modal Focus Production Logic: Tab wraps focus from last element to first element", () => {
  const elem1 = { id: "input1" } as unknown as HTMLElement;
  const elem2 = { id: "input2" } as unknown as HTMLElement;
  const elem3 = { id: "button-submit" } as unknown as HTMLElement;
  const focusables = [elem1, elem2, elem3];

  const target = getNextFocusTarget(focusables, elem3, false);
  assert.equal(target, elem1);
});

test("Modal Focus Production Logic: Shift+Tab wraps focus from first element to last element", () => {
  const elem1 = { id: "input1" } as unknown as HTMLElement;
  const elem2 = { id: "input2" } as unknown as HTMLElement;
  const elem3 = { id: "button-submit" } as unknown as HTMLElement;
  const focusables = [elem1, elem2, elem3];

  const target = getNextFocusTarget(focusables, elem1, true);
  assert.equal(target, elem3);
});

test("Modal Focus Production Logic: Tab advances focus normally when inside container", () => {
  const elem1 = { id: "input1" } as unknown as HTMLElement;
  const elem2 = { id: "input2" } as unknown as HTMLElement;
  const elem3 = { id: "button-submit" } as unknown as HTMLElement;
  const focusables = [elem1, elem2, elem3];

  const targetForward = getNextFocusTarget(focusables, elem1, false);
  assert.equal(targetForward, null); // Browser default navigation handles inner steps

  const targetBackward = getNextFocusTarget(focusables, elem3, true);
  assert.equal(targetBackward, null); // Browser default handles inner steps
});
