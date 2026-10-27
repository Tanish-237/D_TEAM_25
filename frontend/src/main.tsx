import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { AppShell } from "./components/Layout";
import { Button } from "./components/ui";
import "./index.css";
import { ApiError, ensureCsrf } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { Login, Signup } from "./pages/Auth";
import Landing from "./pages/Landing";
import Profile from "./pages/Profile";
import StudentDashboard from "./pages/student/Dashboard";
import RegisterFace from "./pages/student/RegisterFace";
import CoursePage from "./pages/teacher/course/CoursePage";
import TeacherDashboard from "./pages/teacher/Dashboard";
import SessionPage from "./pages/teacher/session/SessionPage";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="grid justify-items-center gap-4">
        <span className="num text-faint text-6xl font-semibold">404</span>
        <p className="text-muted">This page does not exist.</p>
        <Link to="/">
          <Button variant="secondary">Go home</Button>
        </Link>
      </div>
    </div>
  );
}

ensureCsrf();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/student" element={<AppShell role="student" />}>
              <Route index element={<StudentDashboard />} />
              <Route path="face" element={<RegisterFace />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="/teacher" element={<AppShell role="teacher" />}>
              <Route index element={<TeacherDashboard />} />
              <Route path="courses/:id" element={<CoursePage />} />
              <Route path="sessions/:id" element={<SessionPage />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
