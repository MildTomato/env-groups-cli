import { Flag } from "effect/cli";

export const projectRefFlag = Flag.String("project-ref").pipe(
  Flag.withDescription("Project to act on. Defaults to the linked project."),
  Flag.optional,
);
