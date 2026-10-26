// Thin fetch wrapper for the Django API. Session cookie + CSRF header on every call.

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function ensureCsrf(): Promise<void> {
  if (!csrfToken()) await fetch("/api/auth/csrf", { credentials: "same-origin" });
}

function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  if (status === 401) return "Please log in again.";
  return "Something went wrong. Please try again.";
}

export async function api<T>(
  path: string,
  options: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const method = options.method ?? (options.json || options.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-CSRFToken"] = csrfToken();
  }
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(response.status, messageFrom(data, response.status), data);
  return data as T;
}

// ---------------------------------------------------------------- types

export type Role = "student" | "teacher";

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  name: string;
  roll_no: string;
  role: Role;
}

export interface Course {
  id: number;
  subject: string;
  year: number;
  semester: number;
  code: string;
  teacher: string;
}

export interface FaceStatus {
  photos_used: number;
  templates: number;
  embedder: string;
  updated: string;
}

export interface StudentCourse extends Course {
  present: number;
  total: number;
  percent: number | null;
  records: { date: string; topic: string; present: boolean }[];
}

export interface StudentOverview {
  courses: StudentCourse[];
  face: FaceStatus | null;
}

export interface CourseSummary extends Course {
  students: number;
  registered: number;
  sessions: number;
  drafts: number;
  average: number | null;
}

export interface DraftRef {
  id: number;
  course: string;
  date: string;
  topic: string;
  faces: number;
}

export interface SessionRow {
  id: number;
  date: string;
  topic: string;
  status: "draft" | "confirmed";
  present: number;
  marked: number;
  faces: number;
  seconds: number;
}

export interface StudentRow extends User {
  registered: boolean;
  attended: number;
  marked: number;
  percent: number | null;
}

export interface CourseDetail extends CourseSummary {
  session_list: SessionRow[];
  student_list: StudentRow[];
}

export interface Face {
  index: number;
  box: [number, number, number, number];
  score: number;
  proposed: number | null;
}

export interface RosterEntry extends User {
  registered: boolean;
  present: boolean | null;
}

export interface SessionDetail {
  id: number;
  course: { id: number; subject: string; code: string };
  date: string;
  topic: string;
  status: "draft" | "confirmed";
  seconds: number;
  photo: { width: number; height: number } | null;
  faces: Face[];
  roster: RosterEntry[];
}

export interface EnrollmentStep {
  key: string;
  title: string;
  instruction: string;
}

export interface PhotoCheck {
  ok: boolean;
  message: string;
  yaw: number;
  preview: string | null;
}

// ---------------------------------------------------------------- formatting

export function formatDate(iso: string, style: "short" | "long" = "short"): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(style === "long" ? { year: "numeric", weekday: "short" } : {}),
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
