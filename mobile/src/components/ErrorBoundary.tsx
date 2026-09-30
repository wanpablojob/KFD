import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import * as Sentry from "@sentry/react-native";
import { colors } from "../lib/theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches React component errors and reports to Sentry.
 * Wraps the entire app or individual screens to prevent total crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message ?? "An unexpected error occurred"}
          </Text>
          <View style={styles.actions}>
            <Button title="Try again" onPress={this.handleRetry} />
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
    marginBottom: 24,
  },
  actions: {
    width: "100%",
  },
});

/**
 * HOC to wrap a screen component with ErrorBoundary.
 * Usage: export default withErrorBoundary(MyScreen);
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
