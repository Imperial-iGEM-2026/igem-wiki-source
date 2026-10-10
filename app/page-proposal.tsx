import { MathText } from './equation-block';
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import type { CanvasLayout } from './canvas-schema';
export type PageText = Record<string, { value: string; version: number }>;
export type PageProposal = {
  layout: CanvasLayout;
  fields: { id: string; value: string }[];
  explanation: string;
};
export type PageContext = {
  target?: { layerId: string; selector: string; label: string } | null;
  layout: CanvasLayout;
  layoutVersion: number;
  fields: PageText;
};
export function previewFields(
  element: ReactElement,
  fields: Record<string, string>,
): ReactElement {
  const props = element.props as {
    children?: ReactNode;
    field?: (id: string) => ReactNode;
    'data-field-id'?: string;
  };
  if (typeof props.field === 'function')
    return cloneElement(
      element as ReactElement<{ field: (id: string) => ReactNode }>,
      {
        field: (id) => {
          const child = props.field!(id);
          return isValidElement(child) ? previewFields(child, fields) : child;
        },
      },
    );
  const id = props['data-field-id'];
  if (id)
    return cloneElement(element as ReactElement<Record<string, unknown>>, {
      onClick: undefined,
      onKeyDown: undefined,
      tabIndex: undefined,
      role: undefined,
      ...(Object.hasOwn(fields, id)
        ? { children: <MathText text={fields[id]} /> }
        : {}),
    });
  return props.children
    ? cloneElement(
        element as ReactElement<{ children: ReactNode }>,
        {},
        Children.map(props.children, (child) =>
          isValidElement(child) ? previewFields(child, fields) : child,
        ),
      )
    : element;
}
