import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button, ConfirmDialog, PageLoader } from "../../../components/ui";
import { api, formatDate, type SessionDetail } from "../../../lib/api";
import { EditDetails } from "./EditDetails";
import { Record } from "./Record";
import { Review } from "./Review";

/** One lecture: the review screen while it is a draft, the attendance record once confirmed. */
export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: session, isLoading } = useQuery({
    queryKey: ["teacher", "session", id],
    queryFn: () => api<SessionDetail>(`/teacher/sessions/${id}`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/teacher/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      navigate(`/teacher/courses/${session!.course.id}`);
      // Drop the deleted lecture instead of refetching it, then refresh the lists.
      client.removeQueries({ queryKey: ["teacher", "session", id] });
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Lecture and its attendance deleted");
    },
  });
  if (isLoading || !session) return <PageLoader />;
  const confirmed = session.status === "confirmed";

  return (
    <>
      <Link
        to={`/teacher/courses/${session.course.id}`}
        className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> {session.course.subject}
      </Link>
      <div className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <span className="label">{confirmed ? "Attendance record" : "Review draft"}</span>
          <h1 className="text-2xl font-semibold sm:text-[28px]">
            {formatDate(session.date, "long")}
            {session.topic && <span className="text-muted"> · {session.topic}</span>}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
          {confirmed && (
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
              Delete lecture
            </Button>
          )}
        </div>
      </div>
      {confirmed ? <Record session={session} /> : <Review session={session} />}
      <EditDetails
        key={`${session.date}-${session.topic}`}
        session={session}
        open={editing}
        onClose={() => setEditing(false)}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this lecture?"
        description="The lecture and its attendance marks are removed from every student's record. This cannot be undone."
        confirmLabel="Delete lecture"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
