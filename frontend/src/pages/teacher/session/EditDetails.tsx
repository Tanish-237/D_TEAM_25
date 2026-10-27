import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Button, Dialog, Field } from "../../../components/ui";
import { api, type SessionDetail } from "../../../lib/api";

export function EditDetails({
  session,
  open,
  onClose,
}: {
  session: SessionDetail;
  open: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (body: { date: string; topic: string }) =>
      api(`/teacher/sessions/${session.id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Lecture updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    save.mutate({ date: String(f.get("date")), topic: String(f.get("topic")) });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Edit lecture details">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Date" name="date" type="date" defaultValue={session.date} required />
        <Field label="Topic" name="topic" defaultValue={session.topic} placeholder="e.g. Hough transform" />
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </form>
    </Dialog>
  );
}
