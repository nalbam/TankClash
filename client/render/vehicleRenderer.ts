import * as THREE from "three";
import type { PlayerView } from "../net/colyseusClient";

const TEAM_COLORS: Record<string, number> = {
  blue: 0x4da3ff,
  red: 0xff5d5d,
};

interface TankView {
  group: THREE.Group;
  barrel: THREE.Group;
  chargeGlow: THREE.Mesh;
  shieldBubble: THREE.Mesh;
  body: THREE.Mesh;
  team: string;
}

/** 3D tank models synced from interpolated player views. */
export class VehicleRenderer {
  readonly group = new THREE.Group();
  private tanks = new Map<string, TankView>();

  sync(players: Map<string, PlayerView>): void {
    for (const [id, view] of players) {
      let tank = this.tanks.get(id);
      if (!tank || tank.team !== view.team) {
        if (tank) this.removeTank(id);
        tank = this.createTank(view.team);
        this.tanks.set(id, tank);
        this.group.add(tank.group);
      }
      tank.group.visible = view.alive;
      tank.group.position.set(view.x, view.y, 0);
      // Tilt the whole tank to the terrain slope; offset the barrel so its
      // absolute aim still matches view.aimAngle.
      tank.group.rotation.z = view.tilt;
      tank.barrel.rotation.z = view.aimAngle - view.tilt;
      // Lean slightly into aim direction for life.
      tank.body.rotation.z = Math.cos(view.aimAngle) * -0.04;

      const glow = tank.chargeGlow.material as THREE.MeshBasicMaterial;
      if (view.charging) {
        const s = 0.3 + view.charge * 1.1;
        tank.chargeGlow.scale.setScalar(s);
        glow.opacity = 0.35 + view.charge * 0.6;
        tank.chargeGlow.visible = true;
      } else {
        tank.chargeGlow.visible = false;
      }

      // Shield bubble + burn tint reflect status effects.
      tank.shieldBubble.visible = view.alive && view.shieldTime > 0;
      const bodyMat = tank.body.material as THREE.MeshStandardMaterial;
      if (view.burnTime > 0) {
        bodyMat.emissive.setHex(0xff4400);
        bodyMat.emissiveIntensity = 0.6;
      } else {
        bodyMat.emissiveIntensity = 0;
      }
    }

    for (const id of [...this.tanks.keys()]) {
      if (!players.has(id)) this.removeTank(id);
    }
  }

  private removeTank(id: string): void {
    const tank = this.tanks.get(id);
    if (!tank) return;
    this.group.remove(tank.group);
    tank.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.tanks.delete(id);
  }

  private createTank(team: string): TankView {
    const color = TEAM_COLORS[team] ?? 0xcccccc;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2333, metalness: 0.4, roughness: 0.7 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x2dd4bf,
      emissiveIntensity: 0.6,
      metalness: 0.2,
      roughness: 0.4,
    });

    // Hull.
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.3, 2.2), bodyMat);
    body.position.y = -0.2;
    group.add(body);

    // Tracks.
    const tracks = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.8, 2.5), darkMat);
    tracks.position.y = -0.85;
    group.add(tracks);

    // Wheels hint.
    for (let i = -1; i <= 1; i++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 12), darkMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(i * 1.05, -0.9, 0);
      group.add(wheel);
    }

    // Turret.
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), bodyMat);
    turret.position.y = 0.55;
    turret.scale.y = 0.75;
    group.add(turret);

    // Team light strip.
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.3), accentMat);
    strip.position.y = 0.42;
    group.add(strip);

    // Barrel pivot at turret center.
    const barrel = new THREE.Group();
    barrel.position.y = 0.55;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.6, 10), darkMat);
    tube.rotation.z = -Math.PI / 2;
    tube.position.x = 1.3;
    barrel.add(tube);

    const chargeGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.5 }),
    );
    chargeGlow.position.x = 2.7;
    chargeGlow.visible = false;
    barrel.add(chargeGlow);
    group.add(barrel);

    // Shield bubble.
    const shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x4dffd0, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    shieldBubble.visible = false;
    group.add(shieldBubble);

    return { group, barrel, chargeGlow, shieldBubble, body, team };
  }
}
