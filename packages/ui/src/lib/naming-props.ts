/** How a labelled surface such as a dialog names itself. */
export interface Naming {
  title?: string;
  titleId?: string;
  descriptionId?: string;
}

/** The props that name a surface: `titleId` and `descriptionId` reference rendered nodes. */
export function namingProps({ title }: Naming): { accessibilityLabel?: string } {
  return { accessibilityLabel: title };
}
