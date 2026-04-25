import { ProfesorHomeworkSubmissionDetail } from "@/components/profesor/ProfesorHomeworkSubmissionDetail";

export default async function ProfesorSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string; submissionId: string }>;
}) {
  const { id, assignmentId, submissionId } = await params;
  const courseId = Number(id);
  const aId = Number(assignmentId);
  const sId = Number(submissionId);
  return <ProfesorHomeworkSubmissionDetail courseId={courseId} assignmentId={aId} submissionId={sId} />;
}

