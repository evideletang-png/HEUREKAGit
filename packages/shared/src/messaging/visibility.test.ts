import assert from "node:assert/strict";
import { actorTypeFromRole, canActorCreateMessage, canActorSeeMessage, canMentionActor } from "./visibility.js";
import type { MessagingActorContext, MessagingActorType, MessagingVisibility } from "./types.js";

function actor(actorType: MessagingActorType, overrides: Partial<MessagingActorContext> = {}): MessagingActorContext {
  return {
    actorType,
    actorId: `${actorType.toLowerCase()}-1`,
    isParticipant: false,
    canSeeInternal: actorType !== "CITOYEN",
    hasDossierScope: actorType === "MAIRIE" || actorType === "METROPOLE",
    ...overrides,
  };
}

function canSee(actorType: MessagingActorType, messageVisibility: MessagingVisibility, overrides: Partial<MessagingActorContext> = {}) {
  return canActorSeeMessage({
    actor: actor(actorType, overrides),
    conversationVisibility: messageVisibility === "PUBLIC" ? "PUBLIC" : "INTERNAL",
    messageVisibility,
  }).allowed;
}

assert.equal(actorTypeFromRole("citoyen"), "CITOYEN");
assert.equal(actorTypeFromRole("user"), "CITOYEN");
assert.equal(actorTypeFromRole("metropole"), "METROPOLE");
assert.equal(actorTypeFromRole("abf"), "ABF");
assert.equal(actorTypeFromRole("admin"), "MAIRIE");

assert.equal(canSee("CITOYEN", "PUBLIC", { isParticipant: true }), true, "citizen sees public participant messages");
assert.equal(canSee("CITOYEN", "PUBLIC", { isParticipant: false }), false, "citizen needs explicit participation");
assert.equal(canSee("CITOYEN", "INTERNAL", { isParticipant: true }), false, "citizen never sees internal messages");
assert.equal(canSee("CITOYEN", "RESTRICTED", { isParticipant: true }), false, "citizen never sees restricted messages by default");

assert.equal(canSee("MAIRIE", "PUBLIC"), true, "mairie sees public in dossier scope");
assert.equal(canSee("MAIRIE", "INTERNAL"), true, "mairie sees internal in dossier scope");
assert.equal(canSee("MAIRIE", "RESTRICTED"), false, "mairie needs participation for restricted");
assert.equal(canSee("MAIRIE", "RESTRICTED", { isParticipant: true }), true, "mairie participant sees restricted");

assert.equal(canSee("METROPOLE", "PUBLIC"), true, "metropole sees public in dossier scope");
assert.equal(canSee("METROPOLE", "INTERNAL"), true, "metropole sees internal in dossier scope");
assert.equal(canSee("METROPOLE", "RESTRICTED"), false, "metropole needs participation for restricted");
assert.equal(canSee("METROPOLE", "RESTRICTED", { isParticipant: true }), true, "metropole participant sees restricted");

assert.equal(canSee("ABF", "PUBLIC"), false, "abf needs explicit participation");
assert.equal(canSee("ABF", "PUBLIC", { isParticipant: true }), true, "abf participant sees public");
assert.equal(canSee("ABF", "INTERNAL", { isParticipant: false }), false, "abf cannot see internal without participant record");
assert.equal(canSee("ABF", "INTERNAL", { isParticipant: true }), true, "abf participant sees internal");
assert.equal(canSee("ABF", "RESTRICTED", { isParticipant: true }), true, "abf participant sees restricted");

assert.equal(canActorCreateMessage({
  actor: actor("CITOYEN", { isParticipant: true }),
  conversationVisibility: "PUBLIC",
  messageVisibility: "INTERNAL",
}).allowed, false, "citizen cannot create internal message");

assert.equal(canActorCreateMessage({
  actor: actor("MAIRIE"),
  conversationVisibility: "INTERNAL",
  messageVisibility: "INTERNAL",
}).allowed, true, "mairie can create internal scoped message");

assert.equal(canMentionActor({ messageVisibility: "INTERNAL", mentionedActorType: "CITOYEN" }).allowed, false, "internal message cannot mention citizen");
assert.equal(canMentionActor({ messageVisibility: "PUBLIC", mentionedActorType: "CITOYEN" }).allowed, true, "public message can mention citizen");

console.log("Messaging visibility matrix tests passed.");
