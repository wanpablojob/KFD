import type { AppStateStatus } from "react-native";
import { focusFromAppState, onlineFromNetInfo } from "./connectivity-manager";

/**
 * Both bridges were silently broken in React Native before: the query cache
 * reported "online" forever and never heard the app come back to the foreground.
 * These tests pin the behaviour a phone in a lift depends on.
 */

type NetListener = (state: { isConnected: boolean | null }) => void;
type FocusListener = (state: AppStateStatus) => void;

function fakeNetInfo() {
  const box: { listener: NetListener | null } = { listener: null };
  const unsubscribe = jest.fn();
  return {
    unsubscribe,
    addEventListener: jest.fn((listener: NetListener) => {
      box.listener = listener;
      return unsubscribe;
    }),
    emit: (state: { isConnected: boolean | null }) => box.listener?.(state),
  };
}

function fakeAppState() {
  const box: { listener: FocusListener | null } = { listener: null };
  const remove = jest.fn();
  return {
    remove,
    addEventListener: jest.fn((_type: "change", listener: FocusListener) => {
      box.listener = listener;
      return { remove };
    }),
    emit: (state: AppStateStatus) => box.listener?.(state),
  };
}

describe("onlineFromNetInfo", () => {
  it("reports connectivity changes", () => {
    const netInfo = fakeNetInfo();
    const setOnline = jest.fn();

    const unsubscribe = onlineFromNetInfo(netInfo)(setOnline);
    expect(unsubscribe).toBe(netInfo.unsubscribe);

    netInfo.emit({ isConnected: true });
    netInfo.emit({ isConnected: false });
    expect(setOnline.mock.calls).toEqual([[true], [false]]);
  });

  it("treats an unknown connectivity as online, so polling is never paused on a guess", () => {
    const netInfo = fakeNetInfo();
    const setOnline = jest.fn();
    onlineFromNetInfo(netInfo)(setOnline);

    // The deliberate choice: isInternetReachable can be null on a captive
    // portal while Supabase is perfectly reachable.
    netInfo.emit({ isConnected: null });
    expect(setOnline).toHaveBeenCalledWith(true);
  });
});

describe("focusFromAppState", () => {
  it("maps the app state onto focus and unsubscribes", () => {
    const appState = fakeAppState();
    const handleFocus = jest.fn();

    const unsubscribe = focusFromAppState(appState)(handleFocus);
    appState.emit("active");
    appState.emit("background");
    expect(handleFocus.mock.calls).toEqual([[true], [false]]);

    unsubscribe();
    expect(appState.remove).toHaveBeenCalled();
  });
});
