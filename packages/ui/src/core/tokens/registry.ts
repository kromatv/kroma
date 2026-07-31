/** A token union that stays open: the base table's names plus whatever its
 *  registry gains through module augmentation (see `ColorRegistry`). Written
 *  as one generic so each group's union reads identically. */
export type TokenOf<Base, Registry> = keyof Base | keyof Registry;
