/**
 * Jest setup.
 *
 * AsyncStorage is a native module and has no native side under jest, so any
 * test that imports a module touching storage fails at import time. The package
 * ships an in-memory mock; registering it here means a test never has to know
 * which module three levels down happens to persist something.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
