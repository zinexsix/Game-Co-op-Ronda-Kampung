import type { Scene } from "@babylonjs/core";
import type { Player } from "../entities/Player";
import { PembangunAbility } from "./Pembangun";
import { PenjagaAbility } from "./Penjaga";
import { PenyembuhAbility } from "./Penyembuh";
import { PenyerangAbility } from "./Penyerang";
import type { RoleAbility } from "./RoleAbility";

/** Buat perilaku skill untuk peran milik `player` (visual skill ikut dibuat di awal). */
export function createAbility(player: Player, scene: Scene): RoleAbility {
  const role = player.role;
  switch (role.id) {
    case "penjaga":
      return new PenjagaAbility(role, scene, player);
    case "pembangun":
      return new PembangunAbility(role);
    case "penyerang":
      return new PenyerangAbility(role);
    case "penyembuh":
      return new PenyembuhAbility(role);
  }
}
