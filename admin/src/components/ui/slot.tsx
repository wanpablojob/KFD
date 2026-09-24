import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Composes props onto a single child element (Slot pattern). Used to render
 * a component as another element, e.g. <Button asChild><Link>…</Link></Button>.
 * The child keeps its own props; `className` values are merged (tailwind-merge).
 */
export function Slot({
  children,
  ...props
}: {
  children: ReactNode;
  [key: string]: unknown;
}) {
  const valid = Children.toArray(children).filter(isValidElement);

  if (valid.length > 1) {
    throw new Error("Slot expects a single child element");
  }

  if (valid.length === 0) {
    return null;
  }

  const child = valid[0] as ReactElement<Record<string, unknown>>;
  const childProps = child.props;
  const merged: Record<string, unknown> = { ...props, ...childProps };
  if (props.className || childProps.className) {
    merged.className = cn(
      props.className as string | undefined,
      childProps.className as string | undefined,
    );
  }
  return cloneElement(child, merged);
}