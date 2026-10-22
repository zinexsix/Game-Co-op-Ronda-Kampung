import type { RoleData } from "../data/types";
import { PendingAbility, type RoleAbility } from "./RoleAbility";
import { PenyerangAbility } from "./Penyerang";

/** Buat perilaku skill untuk satu peran. Peran lain menyusul di Tahap 3. */
export function createAbility(role: RoleData): RoleAbility {
  switch (role.id) {
    case "penyerang":
      return new PenyerangAbility(role);
    default:
      return new PendingAbility(role.skills);
  }
}
