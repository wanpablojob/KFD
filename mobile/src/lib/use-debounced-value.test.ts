import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useDebouncedValue } from "./use-debounced-value";

/**
 * The debounce bug was invisible to a pure-function test because it lived in
 * how the hook wired its effect, not in a value it computed. So this drives a
 * real component under fake timers and reads what the hook returned.
 */

function Probe({ value }: { value: string }) {
  const debounced = useDebouncedValue(value, 300);
  return createElement("probe", { debounced });
}

function mount(value: string): ReactTestRenderer {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe, { value }));
  });
  // Assigned synchronously inside act.
  return renderer!;
}

function read(renderer: ReactTestRenderer): string {
  return renderer.root.findByType("probe" as never).props.debounced as string;
}

function setValue(renderer: ReactTestRenderer, value: string): void {
  act(() => {
    renderer.update(createElement(Probe, { value }));
  });
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const renderer = mount("a");
    expect(read(renderer)).toBe("a");
  });

  it("does not emit a new value until the delay has elapsed", () => {
    const renderer = mount("a");
    setValue(renderer, "ab");
    expect(read(renderer)).toBe("a");

    advance(299);
    expect(read(renderer)).toBe("a");

    advance(1);
    expect(read(renderer)).toBe("ab");
  });

  it("collapses a burst of changes into one update", () => {
    const renderer = mount("");
    setValue(renderer, "p");
    advance(100);
    setValue(renderer, "pi");
    advance(100);
    setValue(renderer, "piz");
    // Every change cleared the previous timer, so 200ms in nothing has landed.
    expect(read(renderer)).toBe("");

    advance(300);
    expect(read(renderer)).toBe("piz");
  });

  it("clears a pending timer on unmount", () => {
    const renderer = mount("a");
    setValue(renderer, "ab");
    act(() => {
      renderer.unmount();
    });
    // A timer that fired after unmount would warn about setting state on an
    // unmounted component; advancing past the delay must be a no-op.
    expect(() => advance(300)).not.toThrow();
  });
});
