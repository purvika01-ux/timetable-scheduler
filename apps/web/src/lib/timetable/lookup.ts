import type { Dataset, Room, Section, SessionRequirement, Subject, Teacher } from "./types.ts";

export interface Lookup {
  teacher: (id: string) => Teacher | undefined;
  room: (id: string) => Room | undefined;
  section: (id: string) => Section | undefined;
  subject: (id: string) => Subject | undefined;
  requirement: (id: string) => SessionRequirement | undefined;
}

export function makeLookup(dataset: Dataset): Lookup {
  const index = <T extends { id: string }>(items: T[]) => {
    const map = new Map(items.map((i) => [i.id, i]));
    return (id: string) => map.get(id);
  };
  return {
    teacher: index(dataset.teachers),
    room: index(dataset.rooms),
    section: index(dataset.sections),
    subject: index(dataset.subjects),
    requirement: index(dataset.requirements),
  };
}
