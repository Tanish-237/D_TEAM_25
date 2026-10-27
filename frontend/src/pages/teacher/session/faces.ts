/** Which student each detected face is assigned to (face index → student id, or null). */
export type Assignments = Record<number, number | null>;

export function faceUrl(sessionId: number, index: number): string {
  return `/api/teacher/sessions/${sessionId}/faces/${index}`;
}

/** Inverts the assignment: student id → the face index showing them. */
export function facesByStudent(assign: Assignments): Map<number, number> {
  const map = new Map<number, number>();
  for (const [index, who] of Object.entries(assign)) if (who != null) map.set(who, Number(index));
  return map;
}

export function matchesQuery(student: { name: string; roll_no: string }, query: string): boolean {
  return `${student.name} ${student.roll_no}`.toLowerCase().includes(query.toLowerCase());
}
