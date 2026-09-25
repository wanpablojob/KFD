import { Button } from "./button";
import { EmptyState } from "./status";
import { TableSkeleton } from "./table-skeleton";

/**
 * Wraps the non-content states of a data-backed table: skeleton while loading,
 * error + retry on failure. The empty state is already handled by the table
 * itself, so this stays out of the way.
 */
export function TableBoundary({
  loading,
  error,
  onRetry,
  skeletonRows,
  skeletonColumns,
  errorTitle,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  skeletonRows?: number;
  skeletonColumns?: number;
  errorTitle?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return <TableSkeleton rows={skeletonRows} columns={skeletonColumns} />;
  }
  if (error) {
    return (
      <EmptyState
        title={errorTitle ?? "Could not load data"}
        description={error}
        action={
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
