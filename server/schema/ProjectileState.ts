import { Schema, type } from "@colyseus/schema";

export class ProjectileState extends Schema {
  @type("string") weapon = "cannon";
  @type("string") ownerId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
}
